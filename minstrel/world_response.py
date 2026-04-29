import random
import traceback
import json
import logging
import asyncio
from aiohttp import ClientResponseError
from datetime import datetime, timezone
import os

from utility import get_ai_response, extract_broken_json
from http_client import http_client
from websocket_manager import websocket_manager as wsm
from data_store import users, worlds, api_keys, api_urls, default_key, default_url, default_model, context_length_char
import ids
import s3_actions
from portal_management import send_party_portal, send_character_portal
from world_utils import location_has_portal, update_user_character_last_activity, update_party_last_activity, update_world_last_activity
from world_management import backup_character, backup_location, backup_location_summary, backup_adventure_summary, backup_travel_history,  add_to_recent_locations, add_to_encountered_locations, add_to_recent_characters, add_to_encountered_characters, add_to_discovered_characters, add_to_discovered_locations, create_character, create_location, create_object, create_document, create_container
from world_processing import (handle_agent_prompt, choose_narrator_or_character, get_responder, get_current_location,
                              get_mentioned_locations, get_chain_of_thought, check_new_character, tag_character, extract_tag_name_id,
                              update_character_summary_task, check_new_location, tag_location, update_periodic_summaries,
                              get_world_position, check_leaving_party, handle_nearby_parties, update_conversation_history, check_portal_activation, get_adventure_response)
from world_models import Room
from world_settings import MultiplayerOption

logger = logging.getLogger(__name__)

BUCKET = "minstrel-data"


'''
search_instructions, rating_instructions, chat_summary_instructions, search_response_instructions = \
    [open(f).read().strip() for f in ['query.txt', 'rating.txt', 'chat_summary.txt', 'search_response.txt']]
narrator_instructions, adv_summary_instructions = \
    [open(f).read().strip() for f in ['adventure/basic.txt', 'adventure/adv_summary.txt']]
'''

prompt_path = 'adventure/prompts'
#load prompt text components from files
prompt_text_files = ['narrator response pre.txt', 'narrator response.txt',
         'character response pre.txt', 'character response.txt']
narrator_response_pre, narrator_response_inst, character_response_pre, character_response_inst = \
    [open(os.path.join(prompt_path, f)).read().strip() for f in prompt_text_files]


#try to add players to previous room if they were in room together before
def get_world_chat(websocket, room_id):
    world = wsm.get_world(websocket)
    room = worlds[world].rooms[room_id]
    if not 'chat_id' in room:
        chat_id = ids.create_world_id()
        room['chat_id'] = chat_id
    chat_id = room['chat_id']
    return chat_id
def notify_received_message(websocket):
    #allows js client to clear prompt area etc.
    asyncio.create_task(wsm.send(websocket=websocket, message={'route': 'received message'}))

def notify_room_already_streaming(websocket):
    #The room is already processing a message
    asyncio.create_task(wsm.send({"route": 'received message busy', "content": ""}, websocket))

def notify_room_processing_message(room):
    #room is beginning to process a message
    #sets streaming = true in client, do as soon as possible to prevent other users from sending messages while streaming
    room_websockets = [connection['websocket'] for connection in room['connections']]
    asyncio.create_task(wsm.send_room({'route': 'received room message', "content": ""}, websockets=room_websockets))

async def handle_user_message(world, room, room_id, username, user_id, character_name, character_id, message):

    room_websockets = [connection['websocket'] for connection in room['connections']]
    #May not need to send username, user_id, and character name every message, use id to get in client?
    asyncio.create_task(
        wsm.send_room(websockets=room_websockets,
                      message={"route": 'user message',
                               "content": {'username': None, 'user_id': user_id, 'character': character_name, 'character_id': character_id, 'text': message}})
    )
    message_dict = {"sender": "player", "user_id": user_id, "name": character_name, "character_id": character_id, "party_id": room_id, "message": message}
    if 'conversation' not in room:
        room['conversation'] = []
    room['conversation'].append(message_dict)
    prefix = f"worlds/{world}/rooms/{room_id}/"
    asyncio.create_task(s3_actions.store(BUCKET, prefix, "conversation", room['conversation']))

    #asyncio.create_task(s3_actions.store(BUCKET, prefix, "conversation_text", room['conversation_text']))

async def check_room_status(websocket, world, room, room_id, user_id, character_name, character_id, message):
    if room.get('streaming'):
        notify_room_already_streaming(websocket)
        return True

    else:
        room['streaming'] = True
        notify_room_processing_message(room)
        username = None
        await handle_user_message(world, room, room_id, username, user_id, character_name, character_id, message)
        return False



def check_and_process_leaving_party(room, user_id, text):
    # add auto party leave and join later, not enough return for investment just for demonstration
    """
    detected_leaving_user = await check_leaving_party(f"Interactions:\n{recent_conversation}\n\nEntry Pair:\n{entry_pair}\n\n")
    if detected_leaving_user and detected_leaving_user in room['users']:

        #only send notification to user's sessions for this party, avoid sending to other open sessions
        for connection in room['connections']:
            websocket = connection['websocket']
            websocket_user_id = connection['user_id']
            if websocket_user_id == user_id:
                wsm.send()
        """
    pass

async def process_adventure(world, room_id, room_websockets, player_character, player_character_id, user_id, prompt, portal = False):
    room = worlds[world].rooms[room_id]
    context_length_char = 12000

    if player_character_id in worlds[world]['tags']:
        player_character_id = worlds[world]['tags'][player_character_id]

    player_character_tag = worlds[world]['characters'][player_character_id].get('tag', player_character_id)

    conversation = room.conversation_text
    adventure_summary = room.get('adventure_summary', "") #'\{"summary": "summary_text"}'
    world_summary = worlds[world]['world_summary']
    world_instruction = worlds[world]['world_instruction']
    worlds[world].setdefault('world_setting', "")
    world_setting = worlds[world]['world_setting']
    travel_history = room.get('travel_history', "")
    recent_conversation = conversation[-context_length_char:]
    response_prompt_body = ""

    room.setdefault('party_members', [])
    room.setdefault('world_portal_data', {})
    room['world_portal_data'].setdefault(world, {})
    recent_portal_locations = room['world_portal_data'][world].setdefault('recent_portal_locations', [])
    num_kept_locations = 3


    # decide whether narrator, character, or another player should respond
    responder_task = handle_agent_prompt(choose_narrator_or_character,
                                          f"Event History:{recent_conversation}\nPlayer {player_character} {player_character_tag}: {prompt}\n\n")

    location_task = handle_agent_prompt(get_current_location,
                                         f"Travel History: {travel_history}\n\nWorld Summary:\n{world_summary}\n\nWorld Setting:\n{world_setting}\n\nEvent History: {recent_conversation}\n\nPlayer {player_character} {player_character_tag}: {prompt}\n\n")
    # passing shorter event history
    mentioned_locations_task = handle_agent_prompt(get_mentioned_locations,
                                                    f"Event History: {recent_conversation[-2000:]}\n\nPlayer {player_character} {player_character_tag}: {prompt}\n\n")

    responder_reply, location_string, mentioned_locations = await asyncio.gather(
        responder_task, location_task, mentioned_locations_task
    )

    character, character_id = extract_tag_name_id(responder_reply)
    responder = get_responder(character_id)
    #temp fix respond "player" instead of player id
    if responder == "narrator":
        character = None
    
    character_tag = None

    if character_id:
        # If returned id is a tag, get the actual id. If one of my first world's tag is the id. Phase out check and just assign key value.
        if character_id in worlds[world]['tags']:
            character_id = worlds[world]['tags'][character_id]
        else:
            logger.error(f"Responder character id {character_id} not found in world {world}")
        if character_id in worlds[world].characters:
            character_tag = worlds[world]['characters'][character_id].get('tag', character_id)

    #add location info for current and mentioned locations
    current_location_id = None
    locations = set()
    if mentioned_locations:
        for loc in mentioned_locations:
            _, loc_id = extract_tag_name_id(loc)
            locations.add(loc_id)

    if location_string:
        #_, location = extract_tag_name_id(location_string)
        current_location_id = location_string
        print("location: ", current_location_id)

        if current_location_id:
            if current_location_id in worlds[world].tags:
                current_location_id = worlds[world].tags[current_location_id]
            else:
                if current_location_id in worlds[world]['locations']:
                    current_location_id = current_location_id
                elif current_location_id not in worlds[world]['locations']:
                    logger.error(f"Location {current_location_id} not found in world {world}")
                    current_location_id = None
            if current_location_id not in locations:
                locations.add(current_location_id)

    
    print("location: ", current_location_id)


    # add current location and mentioned locations to 'recent' and 'encountered' locations
    # and add location info to prompt
    print(f"locations: {locations}")
    for location_key in locations:
        if location_key in worlds[world]['tags']:
            location_key = worlds[world]['tags'][location_key]

        #add locations with portals to list for activation check
        if location_key in worlds[world]['locations']:
            if location_has_portal(world, location_key):
                if len(recent_portal_locations) >= num_kept_locations:
                    del recent_portal_locations[0]
                recent_portal_locations.append(location_key)

            # add current and mentioned locations to user's recent locations
            for party_character_id in room['characters']:
                await add_to_recent_locations(world, party_character_id, location_key)
                await add_to_encountered_locations(world, party_character_id, location_key)

            itr_location_name = worlds[world]['locations'][location_key].get('name', "")
            itr_location_summary = worlds[world]['locations'][location_key].get('summary', "")
            response_prompt_body += f"Location: {itr_location_name}\nLocation Summary: {itr_location_summary}"

    portal_prompt = ""
    portal_check_convo_len = 4000
    portal_prompt += f"Event History/Conversation: {recent_conversation[-portal_check_convo_len:]}\n\n"

    object_portals = []
    for party_character_id in room['characters']:
        if party_character_id in worlds[world]['characters']:
            worlds[world]['characters'][party_character_id].setdefault('objects', {})
            party_character_objects = worlds[world]['characters'][party_character_id]['objects']

            for object_id, object in party_character_objects.items():
                object.setdefault('portals', {})
                object['portals'].setdefault('outgoing', {})
                object['portals'].setdefault('incoming', {})
                if len(object['portals']['outgoing']) > 0:
                    object_portals.append(object_id)
                    portal_id = list(object['portals']['outgoing'].keys())[0]

                    object_tag = worlds[world]['objects'][object_id]['tag']
                    portal_prompt += f"Portal ID: {portal_id}\n"
                    portal_prompt += f"Object Name: {worlds[world]['objects'][object_id].get('name', '')}\n"
                    portal_prompt += f"Object Tag: {object_tag}\n"
                    portal_prompt += f"Portal Description: {object['portals']['outgoing'][portal_id]['description']}\n\n"

                #update incoming portal location
                if len(object['portals']['incoming']) > 0:
                    incoming_portal_id = list(object['portals']['incoming'].keys())[0]
                    if current_location_id:
                        worlds[world].portals[incoming_portal_id].location_id = current_location_id
        else: 
            logger.error(f"Character {party_character_id} not found in world {world}")
            continue

    room['world_portal_data'].setdefault(world, {})
    room['world_portal_data'][world].setdefault('recent_portal_locations', [])

    #add location portals to portal activation prompt
    if len(room['world_portal_data'][world]['recent_portal_locations']) > 0:
        for recent_loc_id in room['world_portal_data'][world]['recent_portal_locations']:
            location_tag = worlds[world]['locations'][recent_loc_id]['tag']
            for portal_id, portal in worlds[world]['locations'][recent_loc_id]['portals']['outgoing'].items():
                portal_prompt += f"Portal ID: {portal_id}\n"
                portal_prompt += f"Location Name: {worlds[world]['locations'][recent_loc_id].get('name', '')}\n"
                portal_prompt += f"Location Tag: {location_tag}\n"
                portal_prompt += f"Activation Description: {portal['description']}\n\n"


    portal_prompt += f"\n\nPlayer {player_character}, id:{player_character_tag}: {prompt}\n\n"
    if object_portals or len(recent_portal_locations) > 0:
        activated_portal_id = await handle_agent_prompt(check_portal_activation, portal_prompt)

        if activated_portal_id:

            if activated_portal_id in worlds[world].portals:
                portal_type = worlds[world].portals[activated_portal_id].portal_type
                destination_portal_id = None

                if portal_type == 'object':
                    object_id = worlds[world]['portals'][activated_portal_id]['object_id']
                    destinations = worlds[world]['objects'][object_id]['portals']['outgoing'][activated_portal_id]['destinations']
                    destination_portal_id = list(destinations.keys())[0] if destinations else None
                if portal_type == 'location':
                    location_id = worlds[world]['portals'][activated_portal_id]['location_id']
                    destinations = worlds[world]['locations'][location_id]['portals']['outgoing'][activated_portal_id]['destinations']
                    destination_portal_id = list(destinations.keys())[0] if destinations else None
                
                await send_party_portal(
                    depart_world_id=world, 
                    depart_portal_id=activated_portal_id, 
                    dest_portal_id=destination_portal_id, 
                    room_id=room_id,
                    user_id=user_id
                    )
                        #update travel history?
                return

    # Get responder name to let model know who is responding in chain of thought reflection prompt
    responder_name = ""
    sender_name = None
    sender_id = None
    if responder == "character":
        responder_name = f"{character} @@{character_tag}@@"
        sender_name = character
        sender_id = character_tag
    elif responder != "player":
        responder_name = "narrator"
        character_id = None
        sender_name = "narrator"
        sender_id = None
        
    # Notify client of sender so it can create response container
    asyncio.create_task(wsm.send_room(
                    websockets=room_websockets,
                    message={"route": "set response sender",
                             "content": {"sender": sender_name, "sender_id": sender_id}}))

    chain_of_thought_info = (
                f"Adventure Summary:\n{adventure_summary}\n\n"
                + f"World Summary:\n{world_summary}\n\n"
                + f"World Instruction:\n{world_instruction}\n\n"
                + f"World Setting:\n{world_setting}\n\n"
                + response_prompt_body
                + f"Event History/Conversation:\n{recent_conversation}"
                + f"\n\nPlayer {player_character}, id:{player_character_tag}: {prompt}\n\n"
                + f"Chosen Responder: {responder_name}\n\n"
    )
    chain_of_thought_setting = False #get setting from s3
    chain_of_thought = ""
    if chain_of_thought_setting:
        chain_of_thought = await handle_agent_prompt(get_chain_of_thought, chain_of_thought_info)

    #if users/chain_of_thought = False:
    #chain_of_thought = ""

    # mentioned_characters?

    if responder == "character":
        if character_id not in worlds[world]['characters']:
            responder = "narrator"

    response = None
    if responder == "narrator" or responder == "character":
        response = await get_adventure_response(responder=responder, adventure_summary=adventure_summary, world_summary=world_summary, world_setting=world_setting, world_instruction=world_instruction, response_prompt_body=response_prompt_body, chain_of_thought=chain_of_thought, recent_conversation=recent_conversation, world=world, room=room, room_websockets=room_websockets, player_character=player_character, player_character_tag=player_character_tag, character=character, character_id=character_id, character_tag=character_tag, user_id=user_id, prompt=prompt)

        if responder == "character":
            # add character to users' recent characters
            for party_character_id in room['characters']:
                await add_to_recent_characters(world, party_character_id, character_id)
                await add_to_encountered_characters(world, party_character_id, character_id)


        # follow-up processing, only if responder is narrator or character
        entry_pair = None

        if responder == "narrator":
            entry_pair = f"{player_character} @@{player_character_tag}@@: {prompt}\nnarrator: {response}\n"

        if responder == "character":
            entry_pair = f"{player_character} @@{player_character_tag}@@: {prompt}\n{character}, {character_tag}: {response}\n"
            #update character summary in background
            asyncio.create_task(update_character_summary_task(world, character, character_id, character_tag, character, recent_conversation))

        new_characters = await handle_agent_prompt(check_new_character,
                                                   f"Event History: {recent_conversation}\n\nNew Entry Pair: {entry_pair}\n\n")
        if new_characters:
            for new_character in new_characters:
                new_character_tag =  await create_character(world, new_character)
                new_character_id = worlds[world]['tags'][new_character_tag]
                entry_pair = await handle_agent_prompt(tag_character,
                                                    f"Event History:\n{recent_conversation}\n\nCharacter to tag:\n{new_character} @@{new_character_tag}@@, Entry Pair:\n{entry_pair}\n\n")
                
            for party_character_id in room['characters']:
                await add_to_discovered_characters(world, party_character_id, new_character_id)
                await add_to_encountered_characters(world, party_character_id, new_character_id)
                await add_to_recent_characters(world, party_character_id, new_character_id)

        #character get name? may be added to summary

        #check for new locations and update location expert
        new_locations = await handle_agent_prompt(check_new_location, f"Travel History: {travel_history}\n\nWorld Setting:\n{world_setting}\n\nEvent History: {recent_conversation}\n\nNew Entry Pair: {entry_pair}\n\n")
        if new_locations:
            # if new check with location expert,
            # if location expert returns null make new location, else add tags
            # update location expert if new location
            for new_location in new_locations:
                new_location_tag = await create_location(world, new_location)
                new_location_id = worlds[world].tags[new_location_tag]

                entry_pair = await handle_agent_prompt(tag_location, f"Event History:\n{recent_conversation}\n\nLocation to tag:\n{new_location} @@{new_location_tag}@@\n\nEntry Pair:\n{entry_pair}\n\n")

                # need to get parent location, use travel history. if parent remove from top_level_locations

                worlds[world]['top_level_locations'].append(new_location_id)

                for party_character_id in room['characters']:
                    await add_to_discovered_locations(world, party_character_id, new_location_id)
                    await add_to_encountered_locations(world, party_character_id, player_character_id)
                    await add_to_recent_locations(world, party_character_id, new_location_id)
            



        #check_and_process_leaving_party(room, user_id, f"Interactions:\n{recent_conversation}\n\nEntry Pair:\n{entry_pair}\n\n")


        #info added about locations? periodic, don't need right away but might miss information if don't do every turn

    #after nearby character location, so seeing party can see those, before update periodic summaries.
    # nearby processing, even if talking to player in party, another party could overhear, should always do if around other players
    #num_parties = len(worlds[world]['rooms'])
    num_parties = len(worlds[world].rooms)
    #function get number of active parties, iterate through each room check last active time

    worlds[world].settings.setdefault('free_agents', True)
    
    try:
        # check number of active_parties > 1
        if worlds[world].settings.world_settings.multiplayer == MultiplayerOption.FREE_FOR_ALL and num_parties > 1:
            """
            add \n\nWorld Setting:\n{world_setting}\n\n
            world_position = await handle_agent_prompt(get_world_position,
                                                    f"Travel History: {travel_history}\n\nWorld Summary:\n{world_summary}\n\nEvent History: {recent_conversation}\nPlayer {player_character} {player_character_tag}: {prompt}\n\n")
            """
            world_position = current_location_id
            if world_position in worlds[world].tags:
                world_position = worlds[world].tags[world_position]

            last_position = worlds[world].party_positions.parties.get(room_id, None)
            print(f"last_position: {last_position}")
            if last_position:
                # remove from list of parties at location
                if last_position in worlds[world].party_positions['locations']:
                    worlds[world].party_positions['locations'][last_position].remove(room_id)
                else:
                    logger.error(f"Last position {last_position} not found in party positions locations for world {world}")

            await handle_nearby_parties(world, room_id, player_character_id, world_position, entry_pair, context_length_char)
            # add party to list of parties at location, wait until after processing so doesn't process nearby actions for current party
            position = worlds[world].party_positions.locations.setdefault(world_position, [])
            position.append(room_id)
            # update party's recorded location
            worlds[world].party_positions.parties[room_id] = world_position
    except Exception as e:
        logging.error(f"Error handling nearby parties: {e}", exc_info=True)

    # do in background
    # alternate updating adv_summary and travel_history
    asyncio.create_task(update_periodic_summaries(world, room, adventure_summary, world_setting, travel_history, recent_conversation))

    '''
    if responder == "party":
        entry_pair = f"{player_character} @@{player_character_tag}@@: {prompt}\n"
        response = None
        # For player/party responders, use player's information for conversation history
        await update_conversation_history(world, room_id, player_character, player_character_id, response)
    '''
    # conversation_text could get very large
    #should go in update_conversation
    conversation_text = room.conversation_text
    #room['conversation_text'] = conversation_text + f"{character_name}, {character_id}: {message}\n"
    room.conversation_text = conversation_text + entry_pair

    asyncio.create_task(backup_adventure_summary(world, room, room_id))
    asyncio.create_task(backup_travel_history(world, room, room_id))
    
    # Only update conversation history for narrator/character responders (already done for player/party above)
    if responder == "narrator" or responder == "character":
        await update_conversation_history(world, room_id, character, character_id, response)

    # check if user (simulated character too?) split from party

    #update character and locations in background
        
    #if chatting with player don't need to update world location? narrator won't move anywhere
    # world_position
    # handle nearby parties
    # which can be done every few turns instead? adv_summary, location_update

    # if taking to other player/party (room_id) maybe special prompt that focuses on nearby_activity but stressing the other party may see or hear them saying or interacting with someone
    asyncio.create_task(update_world_last_activity(world))
    asyncio.create_task(update_user_character_last_activity(world, user_id, character_id))
    asyncio.create_task(update_party_last_activity(world, room_id))
    return response

async def handle_world_response(websocket, user_id, room_id, character_id, content):
    world = wsm.get_world(websocket)
    room = worlds[world].rooms[room_id]
    room_websockets = [connection['websocket'] for connection in room['connections']]
    character_id = wsm.get_character_id(websocket)
    character_name = worlds[world]['users'][user_id]['characters'][character_id]['name']

    text_data = content['message']
    prompt = text_data

    #check if room is already handling a user's message
    if await check_room_status(websocket, world, room, room_id, user_id, character_name, character_id, text_data):
        return

    #sends out user's message and updates room conversation
    notify_received_message(websocket)


    #process_world_message
    response = ""
    error_occurred = False

    try:
        response = await process_adventure(world, room_id, room_websockets, character_name, character_id, user_id, text_data)

    except ClientResponseError as e:
        logger.error(f"HTTP client error occurred while handling world response: {e}")
        room.streaming = False
        error_occurred = True
        # need timeout for streaming? try without, make sure all possible errors caught everywhere in code and streaming set to false

    except Exception as e:
        logging.exception(f"An error occurred handling world response: {e}")
        traceback.print_exc()
        room.streaming = False
        error_occurred = True

    finally:
        if not error_occurred:
            asyncio.create_task(wsm.send_room(websockets=room_websockets, message={"route": "response stream", "content": {'word': 'END_OF_STREAM'}}))
        else:
            if room.conversation:
                room.conversation.pop()
                #send message to client, remove last response message, replace error occurred

        room.streaming = False


async def serve_conversation(websocket, world, room_id):
    room_id = wsm.get_room_id(websocket)
    room = worlds[world].rooms[room_id]
    if not room:
        logging.error(f"Room {room_id} not found while serving conversation")
        return

    if 'conversation' not in room:
        logging.error(f"conversation not in world: {world} room {room_id}")
        return
    
    print("serving conversation")
    print("conversation world", world)
    print("conversation room:", room_id)
    conversation = room['conversation']
    if len(conversation) == 0:
        return
    #end_index = len(conversation) - 1
    start_index = max(0, len(conversation) - 6)
    messages = conversation[start_index:]
    print("sending conversation\n\n")
    current_message = room.current_stream_text
    #socketio.emit('get conversation', {'messages': messages, "startIndex": start_index, "current_message": current_message}, to = client)
    asyncio.create_task(wsm.send(websocket=websocket,
             message={'route': 'conversation', 'content': {'messages': messages, "startIndex": start_index, "current_message": current_message}}))

async def serve_extended_conversation(websocket, room_id, index):
    world = wsm.get_world(websocket)
    room_id = wsm.get_room_id(websocket)
    room = worlds[world].rooms[room_id]
    if 'conversation' not in room:
        return
    conversation = room['conversation']
    if len(conversation) <= 6:
        return

    #index = 0 when entire conversation present
    if index == 0:
        return

    elif index is None:
        print ("index is None")
        index = max(0, len(conversation) - 6)

    elif isinstance(index, int):
        print("Index is a valid integer:", index)

    else:
        print("Error: index is neither a valid integer nor None")
        return

    fetch_index = max(0, index - 6)
    print("fetch index: " + str(fetch_index))
    messages = conversation[fetch_index:index]
    print("fetch index before send: " + str(index))
    #socketio.emit('earlier messages', {'messages': messages, 'startIndex': fetch_index}, to=client)
    asyncio.create_task(wsm.send(websocket=websocket, message={'route': 'earlier messages', 'content': {'messages': messages, 'startIndex': fetch_index}}))

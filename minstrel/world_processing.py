import asyncio
import re
import logging
import json
import os
from datetime import datetime, timezone, timedelta

#from event import schedule_event, EventObject, EventType
from data_store import worlds, api_keys, api_urls, default_key, default_url, default_model, context_length_char
import s3_actions
from http_client import http_client
from utility import get_ai_response, extract_broken_json, extract_json, extract_id_tag, extract_tag_name_id, extract_nested_json, get_streamed_response, get_response_value
from world_management import backup_character
from websocket_manager import websocket_manager as wsm
from world_models import Room

logger = logging.getLogger(__name__)

BUCKET = "minstrel-data"

prompt_path = 'adventure/prompts'

(narrator_or_character_pre, narrator_or_character_inst, narrator_response_pre, narrator_response_inst, character_response_pre, character_response_inst, current_location_inst,
    mentioned_locations_inst, portal_check_pre, portal_check_inst, portal_response_pre, portal_response_inst, chain_of_thought_inst, update_character_summary_inst, new_character_pre, new_character_inst, add_character_pre, add_character_inst, new_location_inst,
    add_location_pre, add_location_inst, leaving_party_inst, check_location_expert_inst,
    update_location_expert_inst, adventure_summary_inst, travel_history_inst, world_position_pre, world_position_inst, handle_nearby_parties_pre, handle_nearby_parties_inst) = \
    [open(os.path.join(prompt_path, f)).read().strip() for f in [
        'narrator or character pre.txt', 'narrator or character.txt', 'narrator response pre.txt', 'narrator response.txt',
         'character response pre.txt', 'character response.txt',
         'current location.txt', 'mentioned locations.txt', 'portal check pre.txt','portal check.txt', 'portal response pre.txt', 'portal response.txt', 'chain of thought.txt',
         'update character summary.txt', 'new character pre.txt', 'new character.txt', 'add character pre.txt', 'add character.txt',
         'new location.txt', 'add location pre.txt', 'add location.txt', 'leaving party.txt',
         'check location expert.txt',
         'update location expert.txt', 'adventure summary.txt', 'travel history.txt',
         'world position pre.txt', 'world position.txt',
         'handle nearby parties pre.txt', 'handle nearby parties.txt'
        ]
    ]


# Retries prompt based function call with text input for specified number of attempts
async def handle_agent_prompt(func, text, retries=3):
    last_exception = None
    for attempt in range(retries):
        try:
            return await func(text)
        except Exception as e:
            print(f"Prompt function call attempt: {attempt + 1} failed with error: {e}")
            last_exception = e
        if attempt < retries - 1:
            wait_time = (2 ** attempt)  # Exponential backoff
            await asyncio.sleep(wait_time)
    raise Exception(f"Max world processing retries reached: {last_exception}") from last_exception


async def choose_narrator_or_character(text):
    print(f"choose_narrator_or_character start time: {datetime.now()}")
    caller = "choose_narrator_or_character"
    prompt = narrator_or_character_pre + text + narrator_or_character_inst
    key = "responder"
    return await get_response_value(prompt, key, caller, max_tokens=100)

def get_responder(id):
    print(f"get_responder start time: {datetime.now()}")
    responder = ""
    if id:
        if id.startswith("p"):
            responder = "player"
        elif id.startswith("c"):
            responder = "character"
        elif id.startswith("r"):
            responder = "party"
        else: responder = "narrator"
    else:
        responder = "narrator"
    return responder


async def get_current_location(text):
    print(f"get_current_location start time: {datetime.now()}")
    prompt = text + current_location_inst
    #response = await get_ai_response(prompt)
    response = await get_streamed_response(prompt)
    response_received_time = datetime.now()
    logging.info(f"get_current_location response received at: {response_received_time}")
    logging.info(f"current_loc prompt: {prompt}\n")
    logging.info(f"current_loc response: {response}\n")
    response_json = extract_broken_json(response)
    location_text = response_json['location']
    location = extract_id_tag(location_text)
    return location

async def get_mentioned_locations(text):
    print(f"get_mentioned_locations start time: {datetime.now()}")
    caller = "mentioned_loc"
    prompt = text + mentioned_locations_inst
    key = 'locations_discussed'
    return await get_response_value(prompt, key, caller, process_list=True)

async def check_portal_activation(text):
    caller = "portal_activation_check"
    prompt = portal_check_pre + text + portal_check_inst
    key = "portal_id"
    return await get_response_value(prompt, key, caller)

async def get_chain_of_thought(text):
    print(f"get_chain_of_thought start time: {datetime.now()}")
    caller = "chain_of_thought"
    prompt = text + chain_of_thought_inst
    key = "details_and_planning"
    return await get_response_value(prompt, key, caller, process_list=True)

async def check_new_character(text):
    caller = "new_char"
    prompt = new_character_pre + text + new_character_inst
    key = "new_characters"
    return await get_response_value(prompt, key, caller, process_list=True)

async def tag_character(text):
    caller = "tag_char"
    prompt = add_character_pre + text + add_character_inst
    key = "entry_pair"
    return await get_response_value(prompt, key, caller)

async def update_character_summary(text):
    caller = "char_summ"
    prompt = text + update_character_summary_inst
    key = "summary"
    return await get_response_value(prompt, key, caller)

async def update_character_summary_task(world, character, character_id, character_tag, character_info, recent_conversation):
    """Background task to update character summary"""
    try:
        character_summary = await handle_agent_prompt(update_character_summary, f"Character Summary:\nName: {character}, {character_tag}\n{character_info}\n\nEvent History: {recent_conversation}\n\n")
        worlds[world]['characters'][character_id]['summary'] = character_summary
        await backup_character(world, character_id)
    except Exception as e:
        logger.error(f"Error updating character summary for {character} ({character_id}): {e}")

async def check_new_location(text):
    caller = "new_loc"
    prompt = text + new_location_inst
    key = "new_locations"
    return await get_response_value(prompt, key, caller, process_list=True)

async def tag_location(text):
    caller = "tag_loc"
    prompt = add_location_pre + text + add_location_inst
    key = "entry_pair"
    return await get_response_value(prompt, key, caller)

#how know which characters are in party? players + npc's?
async def update_adventure_summary(text):
    caller = "adv_summ"
    prompt = text + adventure_summary_inst
    key = "summary"
    return await get_response_value(prompt, key, caller)

async def update_travel_history(text):
    caller = "travel"
    prompt = text + travel_history_inst
    key = "travel_history"
    return await get_response_value(prompt, key, caller)
    # if departing players split party, won't work if don't update every turn

async def check_leaving_party(text):
    caller = "leaving_party"
    prompt = text + leaving_party_inst
    key = "leaving_party"
    return await get_response_value(prompt, key, caller)

async def update_periodic_summaries(world, room, adventure_summary, world_setting, travel_history, recent_conversation):
    turns_between_summaries = 6

    # update adventure_summary
    adv_summary_count = room.get('adventure_summary_count', 0)
    if adv_summary_count >= turns_between_summaries:
        room['adventure_summary'] = \
            await handle_agent_prompt(update_adventure_summary,
                                f"Adventure Summary:\n{adventure_summary}\n\n\nWorld Setting:\n{world_setting}\n\nEvent History:\n{recent_conversation}\n\n")
        adv_summary_count = 0
    else:
        adv_summary_count += 1
    room['adventure_summary_count'] = adv_summary_count

    # update travel history
    travel_hist_count = room.get('travel_history_count', -int(turns_between_summaries / 2))
    if travel_hist_count >= turns_between_summaries:
        room['travel_history'] = \
            await handle_agent_prompt(update_travel_history,
                                f"Travel History:\n{travel_history}\n\nWorld Setting:\n{world_setting}\n\nEvent History:\n{recent_conversation}\n\n")
        travel_hist_count = 0
    else:
        travel_hist_count += 1
    room['travel_history_count'] = travel_hist_count

async def get_world_position(text):
    caller = "world_position"
    prompt = world_position_pre + text + world_position_inst
    key = "location"
    location = await get_response_value(prompt, key, caller)
    location_id = extract_id_tag(location)
    return location_id

async def get_nearby_activity_description(text):
    caller = "nearby_activity"
    prompt = text + handle_nearby_parties_inst
    key = "description"
    return await get_response_value(prompt, key, caller)

#last active check needs to be refined, player could be active with other character. see last time party sent message.
async def handle_nearby_parties(world, room_id, player_character_id, world_position, entry_pair, context_length_char):
    room: Room = worlds[world].rooms[room_id]

    activity_window = 2 # minutes
    active_observer_parties = []

    if world_position in worlds[world].party_positions.locations:
        for party_id in worlds[world].party_positions.locations[world_position]:
            party_room = worlds[world].rooms[party_id]

            last_active = datetime.fromisoformat(party_room.last_active)
            if (datetime.now(timezone.utc) - last_active) < timedelta(minutes=activity_window):
                active_observer_parties.append(party_id)
                break
    else:
        return

    active_party_adventure_summary = room.adventure_summary
    active_party_travel_history = room.travel_history
    active_party_event_history = room.conversation_text[int(-context_length_char / 2):]

    #add to conversation?, see when reload, but don't add to conversation_text, don't want to create another version of party. need to handle interparty interactions, might need to be in conversation_text

    if len(room['characters']) > 1:
        sender = "Party " + room_id[-5:]
    else:
        sender = "Player " + player_character_id[-5:]

    tasks = []
    for party_id in active_observer_parties:
        observer_party_event_history = worlds[world].rooms[party_id].conversation_text[int(-context_length_char / 2):]
        observer_party_travel_history = worlds[world].rooms[party_id].travel_history
        observer_party_adventure_summary = worlds[world].rooms[party_id].adventure_summary

        party_info = (
            f"Party 1 Adventure Summary:\n{observer_party_adventure_summary}\n\n" 
            f"Party 1 Travel History:\n{observer_party_travel_history}\n\n" 
            f"Party 1 Event History:\n{observer_party_event_history}\n\n"
            f"Party 2 Adventure Summary:\n{active_party_adventure_summary}\n\n"
            f"Party 2 Travel History:\n{active_party_travel_history}\n\n"
            f"Party 2 Event History:\n{active_party_event_history}\n\n" 
            f"Party 2 Recent action:\n{entry_pair}\n\n"
        )

        nearby_prompt = handle_nearby_parties_pre + party_info + handle_nearby_parties_inst
        tasks.append(handle_agent_prompt(get_nearby_activity_description, nearby_prompt))

    #edit to process results without errors, if one fails, don't stop other tasks
    results = await asyncio.gather(*tasks)

    for party_id, nearby_description in zip(active_observer_parties, results):
        party_room = worlds[world].rooms[party_id]
        party_websockets = [connection['websocket'] for connection in party_room['connections']]
     
        await wsm.send_room(
            websockets=party_websockets,
            message={"route": "nearby activity",
                     "content": {"sender": sender, "party_id": party_id, "message": nearby_description}}
        )

        party_string = ""
        party_room.setdefault('characters', [])
        if len(party_room['characters']) > 1:
            party_string = "Nearby Party"
        else:
            party_string = "Nearby Player"
        #race condition? lock?
        party_room.conversation_text += f"{party_string} @@{party_id}@@: {nearby_description}\n"

        asyncio.create_task(update_conversation_history(world, party_id, sender, party_id, nearby_description))

    #append to conversation, but not conversation_text? need it to know if making action directed at party later.
    #if party is making action directed at a specific party should be detected by narrator_or_character, response created telling results, regular conversation response.

async def get_adventure_response(responder, adventure_summary, world_summary, world_instruction, world_setting, response_prompt_body, chain_of_thought, recent_conversation, world, room, room_websockets, player_character, player_character_tag, character, character_id, character_tag, user_id, prompt):
    if responder == "narrator":
        response_prompt = (
            narrator_response_pre
            + f"Adventure Summary:\n{adventure_summary}\n\n"
            + f"World Summary:\n{world_summary}\n\n"
            + f"World Instruction:\n{world_instruction}\n\n"
            + f"World Setting:\n{world_setting}\n\n"
            + response_prompt_body + "\n\n"
            + f"Chain of thought:\n{chain_of_thought}\n\n"
            + f"Event History/Conversation:\n{recent_conversation}"
                f"\n\nPlayer {player_character}, id:{player_character_tag}: {prompt}\n\n"
            + narrator_response_inst
        )

    else: 
        character_info = worlds[world]['characters'][character_id]['summary']
        character_inst = (
            worlds[world]['characters'][character_id].get(
                'instruction', 'no special processing instructions added')
        )

        response_prompt = (
            f"Character to simulate: {character} {character_tag}"
            f"\n\nCharacter Summary:\n{character_info}\n\n"
            + f"Character Instructions:\n{character_inst}\n\n"
            + f"World Summary:\n{world_summary}\n\n"
            + f"World Instruction:\n{world_instruction}\n\n"
            + f"World Setting:\n{world_setting}\n\n"
            + character_response_pre + response_prompt_body + "\n\n"
            + f"Chain of thought:\n{chain_of_thought}\n\n"
            + f"Adventure Summary:\n{adventure_summary}\n\n"
            + f"Event History/Conversation:\n{recent_conversation}"
                f"\n\nPlayer {player_character} (@@{player_character_tag}@@): {prompt}\n\n"
            + character_response_inst
        )
    
    response = await stream_request(world, room, room_websockets, response_prompt, user_id)

    logging.info(f"main prompt: {response_prompt}\n")
    logging.info(f"main response: {response}\n")
    return response

async def stream_request(world, room: Room, room_websockets, message, user_id):
    conversation_history = room.get('conversation_text')
    paying_user = None
    #use world / user_id for pay settings?
    #use user's api key unless world owner or party creator is covering costs
    """
    if worlds[world]['settings']['cover_costs']:
        cost_providers = worlds[world]['settings']['cost_providers']
        paying_user = random.choice(cost_providers)
    elif room['cost_providers']:
        #make sure to update when user changes settings
        #if multiple users have setting to cover costs choose one at random each time, make sure they are active
        paying_user = room['cost_provider']
    else:
        paying_user = user_id"""

    #api = users[paying_user]['api']
    api_key = default_key
    url = default_url
    #model = users[paying_user]['model']
    model = default_model
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    '''Could pass conversation history as list of message objects, however current method
    may help add separation to adventure history from being considered as conversation history'''
    '''Won't use name from messaage object unless added to content or processed as part of running conversation_history string as now doing'''
    payload = {
        "model": model,
        "stream": True,
        "messages": [{"role": "user", "content": message}],
    }

    response = await http_client.post_stream(url, headers=headers, json=payload)
    response.raise_for_status()  # This will raise an HTTPError if the HTTP request returned an unsuccessful status code

    ai_response = ""
    room.current_stream_text = ""

    print("send to", room_websockets)

    try:
        async for chunk in response.content:
            text_chunk = chunk.decode('utf-8')
            # Process each line
            lines = text_chunk.split('\n')
            for line in lines:
                if line.startswith("data:") and not line.endswith("[DONE]"):
                    data_content = line[len("data:"):].strip()
                    try:
                        content = json.loads(data_content)
                        chunk = content["choices"][0]["delta"].get("content", "")
                        ai_response += chunk
                        room.current_stream_text += chunk
                        await wsm.send_room(websockets=room_websockets,
                                      message={"route": "response stream", "content": {'word': chunk}})
                        print(chunk, end='', flush=True)
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON decoding error: {e}")
                        print(f"JSON decoding error: {e}")
    finally:
        await response.release()
    return ai_response

async def get_portal_response(depart_portal_id, depart_portal_description, dest_world_id, dest_portal_description, dest_portal_id, room_id, user_id):
    room = worlds[dest_world_id].rooms[room_id]
    room_websockets = [conn['websocket'] for conn in room['connections']]

    world_setting = worlds[dest_world_id]['world_setting']
    world_summary = worlds[dest_world_id]['world_summary']
    world_instruction = worlds[dest_world_id]['world_instruction']

    location_id = None
    location_description = None
    if dest_portal_id in worlds[dest_world_id]['portals']:
        portal_type = worlds[dest_world_id]['portals'][dest_portal_id]['portal_type']
        
        if portal_type == 'location':
            location_id = worlds[dest_world_id]['portals'][dest_portal_id]['location_id']
        elif portal_type == 'object':
            location_id = worlds[dest_world_id]['portals'][dest_portal_id]['location_id']
        location_description = worlds[dest_world_id]['locations'][location_id]['summary']
    
    conversation_text = room.get('conversation_text', "")
    portal_travel_prompt = (
        f"Event History: {conversation_text[-context_length_char:]}\n\n"
        f"Departure Portal Description: {depart_portal_description}\n"
        f"Arrival Portal Description: {dest_portal_description}\n"
        f"Location Description: {location_description}\n"
        f"World Setting: {world_setting}\n"
        f"World Summary: {world_summary}\n"
        f"World Instruction: {world_instruction}\n"
    )

    prompt = portal_response_pre + portal_travel_prompt + portal_response_inst

    # Notify client of sender so it can create response container
    asyncio.create_task(wsm.send_room(
        websockets=room_websockets,
        message={"route": "set response sender",
                    "content": {"sender": "narrator", "sender_id": None}}))

    response = await stream_request(dest_world_id, room, room_websockets, prompt, user_id)
    return response

async def prepare_narrator_prompt():
    pass

async def update_conversation_history(world, room_id, sender_name, character_id, response):
    print(f"updating conversation history - world: {world}, room_id: {room_id}, sender: {sender_name}, character_id: {character_id}")
    # if sender !system for simulation, may not be relevant now that message added to conversation data in user_message()

    room = worlds[world].rooms[room_id]
    
    if response:
        message = {"sender": "assistant", "name": sender_name, "character_id": character_id, "message": response}
        room['conversation'].append(message)
        prefix = f"worlds/{world}/rooms/{room_id}/"
        asyncio.create_task(s3_actions.store(BUCKET, prefix, "conversation", room['conversation']))

    # Backup entry_pair that was already added to conversation_text in process_adventure
    asyncio.create_task(s3_actions.store(BUCKET, prefix, "conversation_text", room['conversation_text']))

    


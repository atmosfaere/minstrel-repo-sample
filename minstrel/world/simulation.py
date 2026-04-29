from datetime import datetime, timezone, timedelta
from aiohttp import ClientResponseError
import traceback
import logging
import asyncio
import os

from storage.data_store import worlds, users
from utility import get_response_value
from .event import schedule_event, EventObject, EventType
from storage import s3_actions

logger = logging.getLogger(__name__)

BUCKET = "minstrel-data"

prompt_path = 'adventure/prompts'
simulation_inst = open(os.path.join(prompt_path, 'simulation.txt')).read().strip()

async def get_character_simulation_action(text):
    caller = "character_simulation_action"
    prompt = text + simulation_inst 
    key = "action"
    return await get_response_value(prompt, key, caller)

#called both when character set to simulate and when scheduled object is run
async def simulate_character(world, character_id):
    from .world_response import process_adventure
    from networking.websocket_manager import websocket_manager as wsm
    #check if character is still set as simulate
    if character_id not in worlds[world]['simulated_characters']:
        logger.error(f"Character {character_id} not found in simulated_characters for world: {world}")
        return
    character_name = worlds[world]['characters'][character_id]['name']
    character_info = worlds[world]['characters'][character_id]['summary']
    character_inst = worlds[world]['characters'][character_id].get('instruction', 'no special processing instructions added')
    world_summary = worlds[world]['world_summary']
    world_instruction = worlds[world]['world_instruction']
    world_setting = worlds[world]['world_setting']
    room_id = worlds[world]['simulated_characters'][character_id]['room_id']
    room = worlds[world].rooms[room_id]
    adventure_summary = room.get('adventure_summary', "")
    recent_conversation = room.get('conversation_text', "")
    user_id = worlds[world]['simulated_characters'][character_id]['user_id']
    
    action_prompt = (
                f"Character to simulate: {character_name} {character_id}"
                f"\n\nCharacter Summary:\n{character_info}\n\n"
                + f"Character Instructions:\n{character_inst}\n\n"
                + f"World Summary:\n{world_summary}\n\n"
                + f"World Instruction:\n{world_instruction}\n\n"
                + f"World Setting:\n{world_setting}\n\n"
                + f"Adventure Summary:\n{adventure_summary}\n\n"
                + f"Event History/Conversation:\n{recent_conversation}\n\n"
            )
    
    action = await get_character_simulation_action(action_prompt)

    room_websockets = [connection['websocket'] for connection in room['connections']]
    asyncio.create_task(
        wsm.send_room(websockets=room_websockets,
                      message={"route": 'user message',
                               "content": {'username': None, 'user_id': user_id, 'character': character_name, 'character_id': character_id, 'text': action}})
    )

    message_dict = {"sender": "player", "user_id": user_id, "name": character_name, "character_id": character_id, "party_id": room_id, "message": action}
    if 'conversation' not in room:
        room['conversation'] = []
    room['conversation'].append(message_dict)
    prefix = f"worlds/{world}/rooms/{room_id}/"
    asyncio.create_task(s3_actions.store(BUCKET, prefix, "conversation", room['conversation']))
    
    #conversation_text is updated in process_adventure

    user_id = worlds[world]['simulated_characters'][character_id]['user_id']
    room_id = worlds[world]['simulated_characters'][character_id]['room_id']
    room = worlds[world]['rooms'][room_id]
    room_websockets = [connection['websocket'] for connection in room['connections']]
    character_name = worlds[world]['characters'][character_id]['name']

    response = ""
    error_occurred = False

    room.setdefault('streaming', False)

    if room['streaming']:
        return

    try:
        response = await process_adventure(world, room, room_id, room_websockets, character_name, character_id, user_id, action)

    except ClientResponseError as e:
        logger.error(f"HTTP client error occurred while handling world response: {e}")
        room['streaming'] = False
        error_occurred = True
        # need timeout for streaming? try without, make sure all possible errors caught everywhere in code and streaming set to false

    except Exception as e:
        logging.exception(f"An error occurred handling world response: {e}")
        traceback.print_exc()
        room['streaming'] = False
        error_occurred = True

    finally:
        if not error_occurred:
            asyncio.create_task(wsm.send_room(websockets=room_websockets, message={"route": "response stream", "content": {'word': 'END_OF_STREAM'}}))
        else:
            if room['conversation']:
                room['conversation'].pop()
                #send message to client, remove last response message, replace error occurred

        room['streaming'] = False
        

    await schedule_simulation(world, character_id)
    
async def schedule_simulation(world, character_id):
    interval = worlds[world]['simulated_characters'][character_id]['interval']

    if interval == 'Continuous':
        future_time = datetime.now(timezone.utc)
    else:
        try:
            interval_minutes = float(interval)
            future_time = datetime.now(timezone.utc) + timedelta(minutes=interval_minutes)
        except (ValueError, TypeError):
            logger.error(f"Invalid interval format for character {character_id} in world {world}: '{interval}'.")
            return
            
    new_event = EventObject(
        time=future_time,
        event_type=EventType.simulated_character,
        world=world,
        id=character_id
    )
    print(f"Scheduled simulated character {character_id} for {future_time}")

    await schedule_event(new_event)
from fastapi import APIRouter, Depends, Request, Response, Query, HTTPException
import json
import logging
from datetime import datetime, timezone, timedelta
import asyncio
import copy
#from rapidfuzz import process

from storage.data_store import worlds
from storage import s3_actions
from ids import create_user_id, create_world_id, create_character_id, create_location_id, create_object_id, create_portal_id, get_player_character_tag, get_character_tag, get_location_tag, get_object_tag, get_document_tag, get_container_tag, get_party_tag
from auth.auth_client import authenticate
from .event import schedule_event, EventObject, EventType
from .world_utils import backup_world_s3, unload_world, update_world_last_activity, backup_adventure_info, update_user_character_last_activity
from .simulation import schedule_simulation
from utility import extract_id_tag
from search.world_search_elasticsearch import world_search
from networking.http_client import http_client

#process.extract(query, choices, limit=10)

BUCKET = "minstrel-data"

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/user-adventures/")
async def fetch_user_adventures(user_id=Depends(authenticate)):
    adventures_prefix = f"users/{user_id}/adventures/"
    keys = await s3_actions.list_objects(BUCKET, adventures_prefix)
    adventure_ids = [key[len(adventures_prefix):].split('/')[0] for key in keys]
    
    tasks = [get_adventure_info(user_id, adventure_id) for adventure_id in adventure_ids]
    results = await asyncio.gather(*tasks)
    results = [result for result in results if result and 'error' not in result]
    return results

async def get_adventure_info(user_id: str, adventure_id: str):
    try:
        prefix = f"users/{user_id}/adventures/{adventure_id}/"
        info_str = await s3_actions.retrieve(BUCKET, prefix, "info")
        info_json = json.loads(info_str)
        info_json['adventure_id'] = adventure_id
        return info_json
    except Exception as e:
        logging.error(f"Error fetching adventure info for {adventure_id}: {str(e)}", exc_info=True)
        return {'adventure_id': adventure_id, 'error': str(e)}
    
@router.get("/user-parties/")
async def get_user_parties(user_id: str):
    prefix = f"users/{user_id}/parties/"
    keys = await s3_actions.list_objects(BUCKET, prefix)
    party_ids = [key.rsplit('/', 1)[-1] for key in keys if '/' in key]
    tasks = [get_party_info(user_id, party_id) for party_id in party_ids]
    results = await asyncio.gather(*tasks)
    results = [result for result in results if result and 'error' not in result]
    return results

async def get_party_info(world_id: str, room_id: str):
    try:
        prefix = f"worlds/{world_id}/rooms/{room_id}/"
        info_str = await s3_actions.retrieve(BUCKET, prefix, "info")
        info_json = json.loads(info_str)
        return info_json
    except Exception as e:
        logging.error(f"Error fetching party info for {world_id} {room_id}: {str(e)}", exc_info=True)
        return {'world_id': world_id, 'room_id': room_id, 'error': str(e)}

@router.get("/user-worlds/")
async def fetch_user_worlds(user_id=Depends(authenticate)):
    worlds_prefix = f"users/{user_id}/worlds/"
    keys = await s3_actions.list_objects(BUCKET, worlds_prefix)
    world_ids = [key.rsplit('/', 1)[-1] for key in keys if '/' in key]

    tasks = [fetch_info(world_id) for world_id in world_ids]
    results = await asyncio.gather(*tasks)

    results = [result for result in results if result and 'error' not in result]
    return results

async def fetch_info(world_id: str):
    """Retrieve world info and add world_id to the JSON."""
    try:
        prefix = f"worlds/{world_id}/"
        info_str = await s3_actions.retrieve(BUCKET, prefix, "info")
        #info_json_str = json.loads(info_str)
        info_json = json.loads(info_str)
        info_json['world_id'] = world_id  # Add the world_id to the JSON data
        return info_json
    except Exception as e:  # Broad exception to catch any failure in retrieval
        logging.error(f"Error fetching world info for {world_id}: {str(e)}", exc_info=True)
        return {'world_id': world_id, 'error': str(e)}

@router.post("/world-page")
async def get_world_page(request: Request, response: Response):
    """Don't download world if just looking at page"""
    data = await request.json()
    world_id = data.get("world_id")
    character_id = data.get("character_id")
    
    try:
        user_id = await authenticate(request, response)
    except Exception:
        user_id = None

    if world_id not in worlds:
        prefix = f"worlds/{world_id}/page/"
        object_keys = await s3_actions.list_objects(BUCKET, prefix)
        #tasks = [s3_actions.retrieve(BUCKET, prefix, key[len(prefix):]) for key in object_keys]
        #world_details = await asyncio.gather(*tasks)
        world_details = {
            key[len(prefix):]: await s3_actions.retrieve(BUCKET, prefix, key[len(prefix):])
            for key in object_keys
        }

        # If character_id is provided as a parameter, use it instead of looking up current_character
        if user_id and character_id:
            name_char_prefix = f"worlds/{world_id}/users/{user_id}/characters/{character_id}/"
            try:
                character_name = await s3_actions.retrieve(BUCKET, name_char_prefix, "name")
                world_details["character_id"] = character_id
                world_details["character_name"] = character_name
            except Exception:
                logging.info(f"Character {character_id} not found for user {user_id} in world {world_id}")

        return world_details

    else:
        world_details = {}

        for key, item in worlds[world_id]['page'].items():
            world_details[key] = item

        # If character_id is provided as a parameter, use it instead of looking up current_character
        if user_id and character_id and character_id in worlds[world_id]['users'][user_id]['characters']:
            world_details["character_id"] = character_id
            character_name = worlds[world_id]['users'][user_id]['characters'][character_id]['name']
            world_details["character_name"] = character_name
        return world_details
    
@router.post("/get-world-name")
async def get_world_name(request: Request, user_id=Depends(authenticate)):
    """Get world name by ID from S3"""
    data = await request.json()
    world_id = data.get("world_id")
    
    try:
        # Try to get the world name from S3
        world_name = await s3_actions.retrieve(s3_actions.BUCKET, f"worlds/{world_id}", "name")
        if world_name:
            return {
                "world_id": world_id,
                "name": world_name.strip(),
                "exists": True
            }
        else:
            return {
                "world_id": world_id,
                "name": None,
                "exists": False
            }
    except Exception as e:
        logger.error(f"Error fetching world info for {world_id}: {e}")
        return {
            "world_id": world_id,
            "name": f"World {world_id[:8]}...",
            "exists": False
        }



@router.get("/user-party-id/")
async def get_user_party_id(world_id: str, character_id: str, user_id=Depends(authenticate)):
    """Get the current party ID (room_id) for a user's character in a world"""
    try:
        # Get character's room_id from S3
        char_prefix = f"worlds/{world_id}/users/{user_id}/characters/{character_id}/"
        try:
            party_id = await s3_actions.retrieve(BUCKET, char_prefix, "room_id")
        except Exception:
            raise HTTPException(status_code=404, detail="No party ID found for character")
        
        return {"party_id": party_id}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting party ID for user {user_id} in world {world_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

async def get_world(world):
    """Get world data from s3 in order to run world on server. Fetches data then adds to worlds dict."""
    #setup autoscaling to make a new instance if 2/3 of ram is reached
    #don't fetch world if memory is 3/4 full
    prefix = f"worlds/{world}/"
    object_keys = await s3_actions.list_objects(BUCKET, prefix)
    #print(object_keys)
    #object_keys = [obj['Key'] for obj in response['Contents']]
    tasks = [s3_actions.retrieve(BUCKET, prefix, key[len(prefix):]) for key in object_keys]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Log any errors during retrieval
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"get_world: Error loading file {object_keys[i]}: {result}")
    
    worlds[world] = {}
    s3_actions.load_nested_dict(object_keys, results, worlds)

    for room_id in worlds[world].rooms:
        worlds[world].rooms[room_id].connections = []
        worlds[world].rooms[room_id].streaming = False
        worlds[world].rooms[room_id].current_stream_text = ""

    initialize_world(world)

    for character in worlds[world]['simulated_characters']:
        await schedule_simulation(world, character)


def initialize_world(world):
    #adding everything here as properties in world models with setdefault will make this unnecessary
    worlds[world].setdefault('top_level_locations', [])
    worlds[world].setdefault('tags', {})
    worlds[world].setdefault('locations', {})
    worlds[world].setdefault('characters', {})
    worlds[world].setdefault('objects', {})
    worlds[world]['objects'].setdefault('documents', {})
    worlds[world]['objects'].setdefault('containers', {})
    worlds[world].setdefault('simulated_characters', {})
    worlds[world].setdefault('users', {})
    worlds[world].setdefault('rooms', {})
    worlds[world].setdefault('activity', {})
    worlds[world]['activity'].setdefault('last_active', datetime.now(timezone.utc).isoformat())
    worlds[world]['activity'].setdefault('active_users', [])
    worlds[world]['activity'].setdefault('active_parties', [])
    worlds[world]['activity'].setdefault('last_synced', datetime.now(timezone.utc).isoformat())
    worlds[world].setdefault('world_summary', "No Summary Yet")
    worlds[world].setdefault('world_instruction', "No Instruction Yet")
    worlds[world].setdefault('world_setting', "No Setting Yet")
    worlds[world].setdefault('party_positions', {})
    worlds[world]['party_positions'].setdefault('parties', {})
    worlds[world]['party_positions'].setdefault('locations', {})
    worlds[world].setdefault('portals', {})
    worlds[world].setdefault('settings', {})
    worlds[world]['settings'].setdefault('world_settings', {})
    worlds[world]['settings'].setdefault('player_settings', {})

@router.post("/create-world")
async def create_world(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world_name = data['world_name']
    summary = data['world_summary'].strip()
    #optional, mmo will have to provide username or id as well as character name. don't want other players seeing blank character name.
    character = data['character_name']

    character_summary = data.get('character_summary', "")

    file = data.get('file')
    if file:
        #call world building from file function
        #add user's provided world summary at bottom
        pass

    world = create_world_id(user_id)
    #Add world to worlds
    worlds[world] = {}
    if summary and summary != "":
        worlds[world]['world_summary'] = summary
    else:
        worlds[world]['world_summary'] = "No Summary Yet"

    worlds[world]['characters'] = {}
    worlds[world]['simulated_characters'] = {}
    worlds[world]['locations'] = {}
    worlds[world]['users'] = {}
    worlds[world]['rooms'] = {}

    worlds[world].main_party_id = get_party_tag()

    #Create basic world info to be fetched at world selection menu
    world_info = {}
    world_info['name'] = world_name
    world_info['last_active'] = datetime.now(timezone.utc).isoformat()
    world_info['visitors'] = ""
    world_info['creator'] = await s3_actions.get_username(user_id)
    world_info['creator_id'] = user_id
    worlds[world]['info'] = json.dumps(world_info)

    worlds[world]['page'] = {}
    worlds[world]['page']['name'] = world_name
    worlds[world]['page']['description'] = summary

    worlds[world]['locations'] = {}
    worlds[world]['data'] = {}
    worlds[world]['world_instruction'] = ""

    worlds[world]['settings'] = {}
    worlds[world]['settings']['world_settings'] = {}
    # if option set true include party in world link
    worlds[world]['settings']['world_settings']['start_party'] = data['advanced_settings']['world_settings']['add_player']
    worlds[world]['settings']['world_settings']['multiplayer'] = data['advanced_settings']['world_settings']['multiplayer']
    worlds[world]['settings']['world_settings']['portals'] = data['advanced_settings']['world_settings']['minstrel_multiverse']
    worlds[world]['settings']['world_settings']['world_entry_origins'] = data['advanced_settings']['world_settings']['world_entry_origins']
    worlds[world]['settings']['world_settings']['destination_worlds'] = data['advanced_settings']['world_settings']['destination_worlds']
    worlds[world]['settings']['world_settings']['simulation'] = data['advanced_settings']['world_settings']['simulation']
    worlds[world]['settings']['world_settings']['public'] = data['advanced_settings']['world_settings']['public']
    
    worlds[world]['settings']['player_settings'] = {}
    worlds[world]['settings']['player_settings']['world_building'] = data['advanced_settings']['player_settings']['world_building']
    worlds[world]['settings']['player_settings']['view_entries'] = data['advanced_settings']['player_settings']['view_entries']
    worlds[world]['settings']['player_settings']['discover_new_locations'] = data['advanced_settings']['player_settings']['discover_new_locations']
    worlds[world]['settings']['player_settings']['discover_new_characters'] = data['advanced_settings']['player_settings']['discover_new_characters']
    worlds[world]['settings']['player_settings']['create_portals'] = data['advanced_settings']['player_settings']['create_portals']
    worlds[world]['settings']['player_settings']['incoming_worlds'] = data['advanced_settings']['player_settings']['incoming_worlds']
    worlds[world]['settings']['player_settings']['destination_worlds'] = data['advanced_settings']['player_settings']['destination_worlds']
    worlds[world]['settings']['player_settings']['copy_world'] = data['advanced_settings']['player_settings']['copy_world']
    worlds[world]['settings']['player_settings']['set_simulation'] = data['advanced_settings']['player_settings']['set_simulation']
    worlds[world]['settings']['player_settings']['owned_locations'] = data['advanced_settings']['player_settings']['owned_locations']

    initialize_world(world)

    character_id = await add_player_character(world, user_id, character, character_summary)
    
    worlds[world]['top_level_locations'] = []

    await backup_world_s3(world)

    # add to list of user's worlds
    user_worlds_prefix = f"users/{user_id}/worlds/"
    await s3_actions.store(BUCKET, user_worlds_prefix, world, "")

    # Index world in Elasticsearch for search
    try:
        creator_name = await s3_actions.get_username(user_id)
        is_public = worlds[world]['settings']['world_settings']['public']
        await world_search.index_world({
            "world_id": world,
            "name": world_name,
            "summary": summary or "",
            "creator_id": user_id,
            "creator_name": creator_name,
            "server_url": "",#str(request.base_url).rstrip('/'),  # Current server URL
            "created_at": datetime.now().isoformat(),
            "last_active": datetime.now().isoformat(),
            "active_users": 0,
            "total_visits": 0,
            "is_public": is_public,
            "tags": []
        })
    except Exception as e:
        logger.error(f"Failed to index world in Elasticsearch: {e}")

    return {"world_id": world, "character_id": character_id}

async def add_player_character(world, user_id, character_name, character_summary, party_id=None):
    if world not in worlds:
        await get_world(world)

    character_tag = get_player_character_tag()
    character_id = create_character_id(None)
    
    worlds[world]['tags'][character_tag] = character_id

    worlds[world]['users'].setdefault(user_id, {})
    worlds[world]['users'][user_id].setdefault('characters', {})
    worlds[world]['users'][user_id]['characters'].setdefault(character_id, {})

    worlds[world]['users'][user_id]['characters'][character_id]['name'] = character_name

    room = assign_room(world, character_id, party_id)
    worlds[world]['users'][user_id]['characters'][character_id]['room_id'] = room

    # conversations will have key character_id of character speaking to, value is conversation
    # ensure characters always have an 'objects' dict for held objects/portals
    character = {
        "name": character_name,
        "summary": character_summary,
        #"inventory": {},
        "objects": {},
        "type": "player",
        "type_default": "player",
        "conversations": {},
        "tag": character_tag,
        "last_active": datetime.now(timezone.utc).isoformat()
    }

    # if player has any items listed in the user's summary, they could be added to inventory here using llm. have inventory separate field advanced character
    worlds[world]['characters'].setdefault(character_id, character)
    #tag won't be added if dict not replaced, figure out what parts of this code to make reusable, portal, persona

    #save user folder in worlds
    prefix = f"worlds/{world}/users/{user_id}/"
    asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, worlds[world]['users'][user_id]))

    asyncio.create_task(backup_character(world, character_id))

    asyncio.create_task(backup_adventure_info(world, user_id, character_id))

    return character_id


async def switch_character(world_id, character_id, user_id):
    if character_id in worlds[world_id]['characters']:
        char_dict = worlds[world_id]['characters'][character_id]
        #If character isn't currently a player character
        if char_dict['type'] != "player":
            if not char_dict.get('simulation') and not char_dict.get('default_simulation'):
                previous_character = worlds[world_id]['users'][user_id]['current_character']
                previous_char_dict = worlds[world_id].characters[previous_character]
                # set previous character back to player or npc
                previous_char_dict['type'] = previous_char_dict['type_default']
                # simulate again if simulated     (can't currently switch to simulated character)
                if 'simulation' in previous_char_dict:
                    previous_char_dict['simulation'] = previous_char_dict["default_simulation"]
                # remove from list of playable characters, gives other players a chance to use, otherwise may appear in user's list when not available
                if previous_char_dict['type'] == "npc":
                    del worlds[world_id]['users'][user_id]['characters'][previous_character]

                # Add the new character to user's character list
                worlds[world_id]['users'][user_id]['characters'][character_id] = {}
                # set as current character
                #worlds[world_id]['users'][user_id]['current_character'] = character_id
                #menu option to make new character should just create new adventure with this character if it doesn't exist
                # set character type to player
                char_dict['type'] = "player"
                return True

        #If character isn't being played by another player
        #Character shouldn't be simulated while it is being controlled
        #If user permanently retires character, it can become npc
        #only simulate character if not "active", just set simulation to false if playing.
        #active when join world, inactive if logout or 15 minutes, if in party don't simulate setting. setting simulate background activities and thoughts that don't interfere with story or party.
        #set simulation to false if play character by default
        #npc must be free to roam worlds
        #npcs can browse worlds to join, particularly character personas
    return False


def assign_room(world_id, character_id, party_id=None):
    #use world settings to add to default room, create room, random room, random selection from a few rooms
    #assign based on character race, etc.
    room_id = None

    if party_id:
        # Honor the provided party_id. Create the room if it doesn't exist yet.
        room_id = party_id

    else:
        add_player_room_setting = worlds[world_id]['settings']['world_settings'].get('start_party', None)
        main_party_id = worlds[world_id]['main_party_id']
        if add_player_room_setting == "solo_party":
            room_id = get_party_tag()
        elif add_player_room_setting == "main_party":
            room_id = main_party_id
        else:
            room_id = main_party_id

    if room_id not in worlds[world_id]['rooms']:
        worlds[world_id].rooms[room_id] = {}

    initialize_room(world_id, room_id)

    return room_id

def initialize_room(world_id, room_id):
    room = worlds[world_id].rooms[room_id]
    '''
    room.setdefault('current_stream_text', '')
    room.setdefault('connections', [])
    room.setdefault('conversation', [])
    room.setdefault('conversation_text', "")
    room.setdefault('portal_locations', {})
    room.setdefault('characters', [])
    room.setdefault('streaming', False)
    room.setdefault('users', [])
    room.setdefault('last_active', datetime.now(timezone.utc).isoformat())
    room.setdefault('active_users', []),
    room.setdefault('world_portal_data', {})'''

    room.current_stream_text = ""
    room.connections = []
    room.conversation = []
    room.conversation_text = ""
    room['world_portal_data'] = {}
    room.characters = []
    room.streaming = False
    room.users = []
    room.last_active = datetime.now(timezone.utc).isoformat()
    room.active_users = []
    room.world_portal_data = {}
    room.adventure_summary = ""
    room.travel_history = ""

'''def create_room(room_id):
    worlds[world_id]['rooms'][room_id] = {
            'current_stream': '',
            'connections': [],
            'conversation': [],
            'conversation_text': "",
            'portal_locations': {},
            'characters': [],
            'streaming': False,
            'users': [],
            'last_active': datetime.now(timezone.utc).isoformat(),
            'active_users': []
        }
'''

@router.post("/add-world")
async def add_world(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world_id = data['world_id']
    user_worlds_prefix = f"users/{user_id}/worlds/"
    await s3_actions.store(BUCKET, user_worlds_prefix, world_id, "")

'''
@router.post("/create-adventure")
async def create_adventure(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    adventure_id = get_adventure_id()
    user_adventures_prefix = f"users/{user_id}/adventures/"
    await s3_actions.store(BUCKET, user_adventures_prefix, adventure_id, "")
'''

@router.post("/create-character")
async def create_player_character(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    character = data['character_name']
    character_summary = data.get('character_summary', "")
    party_id = data.get('party_id', None)

    character_id = await add_player_character(world, user_id, character, character_summary, party_id)

    # add to list of user's worlds, checking first would use more requests
    user_worlds_prefix = f"users/{user_id}/worlds/"
    await s3_actions.store(BUCKET, user_worlds_prefix, world, "")

    return {"character_id": character_id}


async def backup_character(world, character_id):
    prefix = f"worlds/{world}/characters/{character_id}/"
    character_data = dict(worlds[world]['characters'][character_id])
    asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, character_data))

async def backup_location(world, location_id):
    prefix = f"worlds/{world}/locations/{location_id}/"
    location_data = dict(worlds[world]['locations'][location_id])
    asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, location_data))

async def backup_location_summary(world, location_id):
    prefix = f"worlds/{world}/locations/{location_id}/"
    location_summary = worlds[world]['locations'][location_id]['summary']
    asyncio.create_task(s3_actions.store(BUCKET, prefix, 'summary', location_summary))

async def backup_adventure_summary(world, room, room_id):
    if room.get('adventure_summary'):
        prefix = f"worlds/{world}/rooms/{room_id}/"
        asyncio.create_task(s3_actions.store(BUCKET, prefix, 'adventure_summary', room['adventure_summary']))

async def backup_travel_history(world, room, room_id):
    if room.get('travel_history'):
        prefix = f"worlds/{world}/rooms/{room_id}/"
        asyncio.create_task(s3_actions.store(BUCKET, prefix, 'travel_history', room['travel_history']))

async def backup_object(world, object_id, object_type=None):
    if object_type:
        prefix = f"worlds/{world}/objects/{object_type}/{object_id}/"
        object_data = dict(worlds[world]['objects'][object_type][object_id])
        asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, object_data))
    else:
        prefix = f"worlds/{world}/objects/{object_id}/"
        object_data = dict(worlds[world]['objects'][object_id])
        asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, object_data))

async def backup_room(world, room_id):
    prefix = f"worlds/{world}/rooms/{room_id}/"
    # Get room data and create a copy to avoid modifying the original
    room_data= dict(worlds[world].rooms[room_id])
    
    # Clean up connections - remove non-serializable websocket objects
    if 'connections' in room_data:
        room_data['connections'] = []
    
    # Clean up streaming data
    room_data['current_stream_text'] = ""
    room_data['streaming'] = False
    
    asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, room_data))

async def backup_user(world, user_id):
    prefix = f"worlds/{world}/users/{user_id}/"
    # Get user data and create a copy to avoid modifying the original
    user_data = dict(worlds[world]['users'][user_id])
    
    # Clean up connections - remove non-serializable websocket objects
    if 'connections' in user_data:
        user_data['connections'] = []
    
    asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, user_data))

async def add_room_connection(websocket, world, room_id, user_id, character_id):
    room = worlds[world].rooms[room_id]
    room.setdefault('connections', [])
    room['connections'].append({
        'websocket': websocket,
        'user_id': user_id,
        'character_id': character_id
    })

    worlds[world].users[user_id].setdefault('connections', [])
    worlds[world].users[user_id]['connections'].append({
        'websocket': websocket,
        'character_id': character_id,
        'room_id': room_id
    })

    if character_id not in room['characters']:
        room['characters'].append(character_id)

    #worlds[world]['users'][user_id]['characters'][character_id].setdefault('connections', [])
    #worlds[world]['users'][user_id]['characters'][character_id]['connections'].append(websocket)

    if user_id not in room['users']:
        room['users'].append(user_id)

    if user_id not in room['active_users']:
        room['active_users'].append(user_id)

    asyncio.create_task(update_world_last_activity(world))
    asyncio.create_task(update_user_character_last_activity(world, user_id, character_id))

@router.get("/character-simulation-status")
async def get_character_simulation_status(world_id: str, char_id: str, user_id=Depends(authenticate)):
    # Basic permission check: does the user have access to this world?
    # This can be expanded based on your app's permission model.
    if user_id not in worlds[world_id]['users']:
        raise HTTPException(status_code=403, detail="User does not have access to this world.")

    simulation_data = worlds[world_id].get('simulated_characters', {}).get(char_id)
    return simulation_data

@router.post("/set-character-simulation-on")
async def set_character_simulation_on(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    # Validate required fields
    for key in ("world", "character_id", "type", "interval", "visibility"):
        if key not in data:
            raise HTTPException(status_code=400, detail=f"Missing field: {key}")

    world = data['world']
    character_tag = data['character_id']
    sim_type = data['type']
    interval = data['interval']  # minutes or 'Continuous'
    visibility = data['visibility']

    character_id = worlds[world]['tags'].get(character_tag, character_tag)

    if world not in worlds:
        raise HTTPException(status_code=404, detail="World not found")
    if 'characters' not in worlds[world] or character_id not in worlds[world]['characters']:
        raise HTTPException(status_code=404, detail="Character not found in world")

    # Accept 'Continuous' or numeric (int/float) minutes
    if not (interval == 'Continuous' or isinstance(interval, (int, float))):
        raise HTTPException(status_code=400, detail="Invalid interval format. Must be a number (minutes) or 'Continuous'.")

    character_name = worlds[world]['characters'][character_id].get('name')

    #if user has permission to change character simulation setting
    worlds[world].simulated_characters.setdefault(character_id, {})
    worlds[world].simulated_characters[character_id]['name'] = character_name
    worlds[world].simulated_characters[character_id]['sim_type'] = sim_type
    worlds[world].simulated_characters[character_id]['interval'] = interval
    worlds[world].simulated_characters[character_id]['user_id'] = user_id
    worlds[world].simulated_characters[character_id]['visibility'] = visibility

    room_id = worlds[world].characters[character_id].get('own_room_id', None)
    if not room_id:
        # Create or assign a room and use the returned id
        room_id = assign_room(world, character_id, get_party_tag())
        worlds[world].characters[character_id]['own_room_id'] = room_id
        worlds[world].rooms[room_id].characters.append(character_id)
        
    worlds[world]['simulated_characters'][character_id]['room_id'] = room_id

    try:
        await schedule_simulation(world, character_id)
    except Exception:
        logger.exception("Failed to schedule simulation for character %s in world %s", character_id, world)
        raise HTTPException(status_code=500, detail="Failed to schedule simulation.")

    return {"success": True, "character_id": character_id, "interval": interval, "type": sim_type}


@router.post("/set-character-simulation-off")
async def set_character_simulation_off(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    # Validate required fields
    for key in ("world", "character_id"):
        if key not in data:
            raise HTTPException(status_code=400, detail=f"Missing field: {key}")

    world = data['world']
    character_id = data['character_id']

    if world not in worlds:
        raise HTTPException(status_code=404, detail="World not found")

    sim_chars = worlds[world].get('simulated_characters', {})
    if character_id in sim_chars:
        sim_chars.pop(character_id, None)

    return {"success": True, "character_id": character_id}

async def create_character(world_id, name, summary=None):
    character_tag = get_character_tag()
    character_id = create_character_id(None)

    worlds[world_id]['tags'][character_tag] = character_id
    worlds[world_id]['characters'][character_id] = {}
    worlds[world_id]['characters'][character_id]['name'] = name
    worlds[world_id]['characters'][character_id]['tag'] = character_tag
    worlds[world_id]['characters'][character_id]['summary'] = summary or "No Summary Yet"
    asyncio.create_task(backup_character(world_id, character_id))
    return character_tag

async def create_location(world_id, name, summary=None):
    location_tag = get_location_tag()
    location_id = create_location_id(None)
    worlds[world_id]['tags'][location_tag] = location_id
    worlds[world_id]['locations'][location_id] = {}
    worlds[world_id]['locations'][location_id]['tag'] = location_tag
    worlds[world_id]['locations'][location_id]['name'] = name
    worlds[world_id]['locations'][location_id]['summary'] = summary or "No Summary Yet"
    asyncio.create_task(backup_location(world_id, location_id))
    return location_tag

async def create_object(world_id, description):
    object_id = create_object_id(True, None)
    object_tag = get_object_tag()
    worlds[world_id]['tags'][object_tag] = object_id
    worlds[world_id]['objects'][object_id] = {}
    worlds[world_id]['objects'][object_id]['tag'] = object_tag
    worlds[world_id]['objects'][object_id]['description'] = description
    asyncio.create_task(backup_object(world_id, object_id))
    return {"tag": object_tag}

async def create_document(world_id, description, text):
    document_id = create_object_id(True, None)
    document_tag = get_document_tag()
    worlds[world_id]['tags'][document_tag] = document_id
    worlds[world_id]['objects']['documents'][document_id] = {}
    worlds[world_id]['objects']['documents'][document_id]['tag'] = document_tag
    worlds[world_id]['objects']['documents'][document_id]['description'] = description
    worlds[world_id]['objects']['documents'][document_id]['text'] = text
    asyncio.create_task(backup_object(world_id, document_id, 'documents'))
    return {"tag": document_tag}

async def create_container(world_id, description):
    container_id = create_object_id(True, None)
    container_tag = get_container_tag()
    worlds[world_id]['tags'][container_tag] = container_id
    worlds[world_id]['objects']['containers'][container_id] = {}
    worlds[world_id]['objects']['containers'][container_id]['tag'] = container_tag
    worlds[world_id]['objects']['containers'][container_id]['description'] = description
    asyncio.create_task(backup_object(world_id, container_id, 'containers'))
    return {"tag": container_tag}

async def add_to_discovered_characters(world_id, player_character_id, character_id):
    worlds[world_id]['characters'][player_character_id].setdefault('discovered', {})
    worlds[world_id]['characters'][player_character_id]['discovered'].setdefault('characters', [])
    worlds[world_id]['characters'][player_character_id]['discovered']['characters'].append(character_id)
    asyncio.create_task(backup_character(world_id, player_character_id))

async def add_to_discovered_locations(world_id, player_character_id, location_id):
    worlds[world_id]['characters'][player_character_id].setdefault('discovered', {})
    worlds[world_id]['characters'][player_character_id]['discovered'].setdefault('locations', [])
    worlds[world_id]['characters'][player_character_id]['discovered']['locations'].append(location_id)
    asyncio.create_task(backup_character(world_id, player_character_id))

async def add_to_encountered_locations(world_id, player_character_id, location_id):
    worlds[world_id]['characters'][player_character_id].setdefault('encountered', {})
    worlds[world_id]['characters'][player_character_id]['encountered'].setdefault('locations', [])
    if location_id not in worlds[world_id]['characters'][player_character_id]['encountered']['locations']:
        worlds[world_id]['characters'][player_character_id]['encountered']['locations'].append(location_id)
        asyncio.create_task(backup_character(world_id, player_character_id))

async def add_to_recent_locations(world_id, player_character_id, location_id):
    worlds[world_id]['characters'][player_character_id].setdefault('recent', {})
    worlds[world_id]['characters'][player_character_id]['recent'].setdefault('locations', [])
    if location_id in worlds[world_id]['characters'][player_character_id]['recent']['locations']:
        worlds[world_id]['characters'][player_character_id]['recent']['locations'].remove(location_id)
    worlds[world_id]['characters'][player_character_id]['recent']['locations'].insert(0, location_id)
    # Limit to 10 recent locations
    if len(worlds[world_id]['characters'][player_character_id]['recent']['locations']) > 10:
        del worlds[world_id]['characters'][player_character_id]['recent']['locations'][10:]
    asyncio.create_task(backup_character(world_id, player_character_id))

async def add_to_encountered_characters(world_id, player_character_id, character_id):
    worlds[world_id]['characters'][player_character_id].setdefault('encountered', {})
    worlds[world_id]['characters'][player_character_id]['encountered'].setdefault('characters', [])
    if character_id not in worlds[world_id]['characters'][player_character_id]['encountered']['characters']:
        worlds[world_id]['characters'][player_character_id]['encountered']['characters'].append(character_id)
        asyncio.create_task(backup_character(world_id, player_character_id))

async def add_to_recent_characters(world_id, player_character_id, character_id):
    worlds[world_id]['characters'][player_character_id].setdefault('recent', {})
    worlds[world_id]['characters'][player_character_id]['recent'].setdefault('characters', [])
    if character_id in worlds[world_id]['characters'][player_character_id]['recent']['characters']:
        worlds[world_id]['characters'][player_character_id]['recent']['characters'].remove(character_id)
    worlds[world_id]['characters'][player_character_id]['recent']['characters'].insert(0, character_id)
    # Limit to 10 recent characters
    if len(worlds[world_id]['characters'][player_character_id]['recent']['characters']) > 10:
        del worlds[world_id]['characters'][player_character_id]['recent']['characters'][10:]
    print("player character id, adding recent character", player_character_id)
    print("recent characters", worlds[world_id]['characters'][player_character_id]['recent']['characters'])
    asyncio.create_task(backup_character(world_id, player_character_id))

async def add_to_recent_objects(world_id, player_character_id, object_id):
    worlds[world_id]['characters'][player_character_id].setdefault('recent', {})
    worlds[world_id]['characters'][player_character_id]['recent'].setdefault('objects', [])
    if object_id in worlds[world_id]['characters'][player_character_id]['recent']['objects']:
        worlds[world_id]['characters'][player_character_id]['recent']['objects'].remove(object_id)
    worlds[world_id]['characters'][player_character_id]['recent']['objects'].insert(0, object_id)
    # Limit to 10 recent objects
    if len(worlds[world_id]['characters'][player_character_id]['recent']['objects']) > 10:
        del worlds[world_id]['characters'][player_character_id]['recent']['objects'][10:]
    asyncio.create_task(backup_character(world_id, player_character_id))

async def leave_party(world_id, room_id_leaving, user_id, character_id, room_id_joining=None):
    # Remove connections for this character from the room
    connections_to_remove = []
    for connection in worlds[world_id]['rooms'][room_id_leaving]['connections']:
        if connection['user_id'] == user_id and connection['character_id'] == character_id:
            connections_to_remove.append(connection)
    
    for connection in connections_to_remove:
        worlds[world_id]['rooms'][room_id_leaving]['connections'].remove(connection)
    
    #store character_id under connection, use default character_id, current_character, unless select other character when joining world.
    worlds[world_id].rooms[room_id_leaving]['users'].remove(user_id)
    worlds[world_id]['rooms'][room_id_leaving]['characters'].remove(character_id)
    #room_id now on character
    worlds[world_id]['users'][user_id]['characters'][character_id]['room_id'] = worlds[world_id]['users'][user_id]['characters'][character_id]['default_room_id']
    if room_id_joining:
        join_party(world_id, room_id_joining, user_id, character_id)
    pass

@router.get("/get_simulated_characters")
async def get_simulated_characters(world_id: str, user_id: str = Depends(authenticate)):
    try:
        if world_id not in worlds:
            await get_world(world_id)
        
        world_data = worlds.get(world_id)
        if not world_data:
            return []

        simulated_characters_list = []
        for char_id, sim_info in world_data.get('simulated_characters', {}).items():
            is_visible = sim_info.get("visibility", False)
            char_owner_id = sim_info.get("user_id")

            if is_visible or char_owner_id == user_id:
                simulated_characters_list.append({
                    "id": char_id,
                    "name": sim_info.get("name"),
                    "user_id": char_owner_id,
                    "visible": is_visible 
                })
        return simulated_characters_list
    except Exception as e:
        logging.error(f"Error getting simulated characters for world {world_id}: {e}", exc_info=True)
        return []

async def get_world_server(world_id):
    """
    Get the server URL for a given world.
    
    Args:
        world_id: The world ID to look up
    
    Returns:
        Server URL string if on a different server, None if on current server
    """
    # TODO: Implement world-to-server mapping for multi-server deployments
    # This will likely involve async database/API calls to a world registry
    # For now, all worlds are on the current server
    return None


@router.post("/copy-world")
async def copy_world(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    original_world_id = data['world_id']

    if original_world_id not in worlds:
        await get_world(original_world_id)

    new_world_id = create_world_id(user_id)
    worlds[new_world_id] = copy.deepcopy(dict(worlds[original_world_id]))

    # Reset user-specific data, only if want to wipe parties
    #worlds[new_world_id]['users'] = {}
    #worlds[new_world_id]['rooms'] = {}
    
    # Update world info for the new copy
    world_info = json.loads(worlds[new_world_id]['info'])
    world_info['name'] = f"Copy of {world_info['name']}"
    #world_info['creator'] = await s3_actions.get_username(user_id)
    world_info['last_active'] = datetime.now(timezone.utc).isoformat()
    world_info['last_visited'] = datetime.now(timezone.utc).isoformat()
    world_info['visitors'] = ""
    worlds[new_world_id]['info'] = json.dumps(world_info)

    # Update page info
    worlds[new_world_id]['page']['name'] = world_info['name']

    await backup_world_s3(new_world_id)

    user_worlds_prefix = f"users/{user_id}/worlds/"
    await s3_actions.store(BUCKET, user_worlds_prefix, new_world_id, "")

    if new_world_id in worlds:
        unload_world(new_world_id)

    return {"world_id": new_world_id}

@router.post("/remove-adventure")
async def remove_adventure(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    adventure_id = data['adventure_id']
    user_adventures_prefix = f"users/{user_id}/adventures/"
    await s3_actions.delete_path(BUCKET, user_adventures_prefix, adventure_id)
    return {"success": True}

@router.post("/remove-world")
async def remove_world(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    
    is_creator = False
    try:
        if world in worlds and 'info' in worlds[world]:
            world_info_str = worlds[world]['info']
        else:
            prefix = f"worlds/{world}/"
            world_info_str = await s3_actions.retrieve(BUCKET, prefix, "info")
        
        world_info = json.loads(world_info_str)
        creator_username = world_info.get('creator', '')
        current_username = await s3_actions.get_username(user_id)
        is_creator = (creator_username == current_username)
    except Exception as e:
        logger.error(f"Error checking world creator for {world}: {str(e)}")
        # If we can't check creator, assume not creator for safety
        is_creator = False
    
    # Only delete world from S3 if user is the creator
    if is_creator:
        prefix = f"worlds/"
        await s3_actions.delete_path(BUCKET, prefix, world)
        
        # Remove from memory if loaded
        if world in worlds:
            del worlds[world]
    
    # Always remove from user's world list (whether creator or not)
    prefix = f"users/{user_id}/worlds/"
    await s3_actions.delete_path(BUCKET, prefix, world)
    
    # Remove user's adventures that reference this world
    try:
        user_adventures_prefix = f"users/{user_id}/adventures/"
        adventure_paths = await s3_actions.list_objects(BUCKET, user_adventures_prefix)
        
        # Get unique adventure IDs (character IDs)
        adventure_ids = set()
        for path in adventure_paths:
            # Path format: "users/{user_id}/adventures/{character_id}/info"
            if path.endswith("/info"):
                # Extract character_id from path like "users/{user_id}/adventures/{character_id}/info"
                parts = path.split("/")
                if len(parts) >= 4:
                    adventure_id = parts[3]  # The character_id part
                    adventure_ids.add(adventure_id)
        
        # Check each adventure and remove if it references the deleted world
        for adventure_id in adventure_ids:
            try:
                adventure_prefix = f"users/{user_id}/adventures/{adventure_id}/"
                adventure_info_str = await s3_actions.retrieve(BUCKET, adventure_prefix, "info")
                adventure_data = json.loads(adventure_info_str)
                
                # If this adventure references the deleted world, remove the entire adventure directory
                if adventure_data.get("world_id") == world:
                    await s3_actions.delete_path(BUCKET, user_adventures_prefix, adventure_id)
                    logger.info(f"Removed adventure {adventure_id} for user {user_id} as it referenced deleted world {world}")
            except Exception as e:
                logger.warning(f"Error checking adventure {adventure_id} for user {user_id}: {str(e)}")
    except Exception as e:
        logger.warning(f"Error processing adventures for user {user_id}: {str(e)}")
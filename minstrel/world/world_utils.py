from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import JSONResponse
import os
import logging
import asyncio
import json
from PIL import Image
import io
from datetime import datetime, timezone, timedelta

from auth.ext_auth import authenticate
from storage.data_store import worlds, users
from storage import s3_actions
#don't import from world_management else it will cause circular import


logger = logging.getLogger(__name__)
router = APIRouter()

BUCKET = "minstrel-data"

worlds_failed_to_unload = []

async def backup_world_s3(world):
    # Get world data from ._data to ensure we're working with the underlying dict
    world_data = dict(worlds[world]._data)
    
    # Clean up rooms - remove non-serializable websocket objects
    if 'rooms' in world_data:
        cleaned_rooms = {}
        for room_id, room in world_data['rooms'].items():
            cleaned_room = dict(room)
            if 'connections' in cleaned_room:
                cleaned_room['connections'] = []
            cleaned_room['current_stream_text'] = ""
            cleaned_room['streaming'] = False
            cleaned_rooms[room_id] = cleaned_room
        world_data['rooms'] = cleaned_rooms
    
    # Clean up users - remove non-serializable websocket connections
    if 'users' in world_data:
        cleaned_users = {}
        for user_id, user in world_data['users'].items():
            cleaned_user = dict(user)
            if 'connections' in cleaned_user:
                cleaned_user['connections'] = []
            cleaned_users[user_id] = cleaned_user
        world_data['users'] = cleaned_users
    
    prefix = f"worlds/{world}/"
    await s3_actions.replace_nested_dict(BUCKET, prefix, world_data)

'''
async def unload_user(user_id):
    print(f"Unloading user: {user_id} from server")
    #don't check if user's worlds are active to unload, just periodically check for inactive worlds
    #users.pop(user_id, None)
'''

async def unload_world(world_id):
    try:
        logger.info(f"unloading world{world_id}")
        if world_id in worlds:
            await backup_world_s3(world_id)
            worlds.pop(world_id)
        else:
            logger.error(f"World not found while unloading, world: {world_id}")
    except Exception as e:
        worlds_failed_to_unload.append(world_id)
        logger.exception(f"Error unloading world {world_id}", e)

def remove_room_connection(websocket, world, room_id):
    if world not in worlds:
        logger.error(f"World {world} not found while removing connection")
        return
        
    if room_id in worlds[world]['rooms']:
        connections = worlds[world]['rooms'][room_id]['connections']
        for connection in connections:
            #only remove specific websocket connection, can have more than one connection per character, or multiple characters
            if connection['websocket'] == websocket:
                connections.remove(connection)
                break
    else:
        logger.error(f"Room {room_id} not found in world {world} while removing connection")

def handle_websocket_disconnect(websocket, world_id, room_id, user_id):
    remove_room_connection(websocket, world_id, room_id)

    num_user_party_connections = 0
    for connection in worlds[world_id]['rooms'][room_id]['connections']:
        if connection['user_id'] == user_id:
            num_user_party_connections += 1
    
    if num_user_party_connections == 0:
        worlds[world_id]['rooms'][room_id]['active_users'].remove(user_id)
        asyncio.create_task(backup_party_info(world_id, room_id))

    for connection in worlds[world_id]['users'][user_id]['connections']:
        if connection['websocket'] == websocket:
            worlds[world_id]['users'][user_id]['connections'].remove(connection)

    num_user_world_connections = len(worlds[world_id]['users'][user_id]['connections'])

    if num_user_world_connections == 0:
        if user_id in worlds[world_id]['activity']['active_users']:
            worlds[world_id]['activity']['active_users'].remove(user_id)


async def update_world_last_activity(world_id):
    """Update the last_active timestamp for a world to current UTC time as ISO format"""
    if world_id in worlds:
        # info is stored as a JSON string in memory
        #start temp world info fix, need to solve root problem, bad data may have been fixed
        world_info_str = worlds[world_id].get('info', '{}')
        
        try:
            world_info = json.loads(world_info_str)
            # Check if we need to parse again (in case it's double-encoded)
            if isinstance(world_info, str):
                print(f"After first parse, still a string: {world_info[:100]}")
                world_info = json.loads(world_info)
            
            if not isinstance(world_info, dict):
                logger.error(f"world_info is not a dict after parsing, type: {type(world_info)}, value: {str(world_info)[:100]}")
                return
                
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse world info for {world_id}: {e}, value: {world_info_str[:100] if world_info_str else 'empty'}")
            return
            
        #end temp world info fix, need to solve root problem
        world_info['last_active'] = datetime.now(timezone.utc).isoformat()
        world_info['active_users'] = len(worlds[world_id]['activity']['active_users'])
        worlds[world_id]['info'] = json.dumps(world_info)
        logger.info(f"Updated last_active for world {world_id} to {world_info['last_active']}")
        
        # Save to S3 immediately so it persists
        asyncio.create_task(backup_world_info(world_id))
    else:
        logger.warning(f"Attempted to update last_active for non-existent world {world_id}")

async def update_user_character_last_activity(world_id: str, user_id: str, character_id: str):
    if user_id in users:
        character_id = worlds[world_id].tags.get(character_id, character_id)
        if character_id in worlds[world_id]['characters']:
            worlds[world_id]['characters'][character_id]['last_active'] = datetime.now(timezone.utc).isoformat()
            asyncio.create_task(backup_adventure_info(world_id, user_id, character_id))
        else:
            logger.warning(f"Attempted to update last_active for non-existent character {character_id} in world {world_id}")
    else:
        logger.warning(f"Attempted to update last_active for non-existent user {user_id}")

async def update_party_last_activity(world_id, room_id):
    if room_id in worlds[world_id]['rooms']:
        worlds[world_id]['rooms'][room_id]['last_active'] = datetime.now(timezone.utc).isoformat()
        asyncio.create_task(backup_party_info(world_id, room_id))
    else:
        logger.warning(f"Attempted to update last_active for non-existent room {room_id} in world {world_id}")

async def backup_adventure_info(world_id, user_id, character_id):
    try:
        prefix = f"users/{user_id}/adventures/{character_id}/"
        last_active = worlds[world_id]['characters'][character_id].get('last_active', datetime.now(timezone.utc).isoformat())
        character_name = worlds[world_id]['characters'][character_id]['name']
        
        # Get world name from memory - info is a JSON string that needs to be parsed
        world_name = "Unknown World"
        try:
            world_info_str = worlds[world_id].get('info', '{}')
            world_info = json.loads(world_info_str)
            world_name = world_info.get('name', 'Unknown World')
        except Exception as e:
            logger.warning(f"Could not parse world info for {world_id}: {e}")
        
        data = {
            "world_id": world_id,
            "character_name": character_name,
            "world_name": world_name,
            "last_active": last_active,
        }
        adventure_info_string = json.dumps(data)
        await s3_actions.store(BUCKET, prefix, "info", adventure_info_string)
    except Exception as e:
        logger.error(f"Error updating adventure info for character {character_id} in world {world_id}: {e}", exc_info=True)


async def backup_world_info(world_id):
    """Save world info to S3, but only if it hasn't been updated in the last 60 seconds"""
    try:
        current_time = datetime.now(timezone.utc)
        
        # Check if this world was updated in the last 60 seconds
        if world_id in worlds:
            last_update_time = datetime.fromisoformat(worlds[world_id]['activity']['last_synced'])
            time_since_last_update = current_time - last_update_time
            if time_since_last_update.total_seconds() < 60:
                return
        
        prefix = f"worlds/{world_id}/"
        # info is already stored as a JSON string in memory
        world_info_string = worlds[world_id]['info']
        asyncio.create_task(s3_actions.store(BUCKET, prefix, "info", world_info_string))
        worlds[world_id]['activity']['last_synced'] = current_time.isoformat()
        logger.info(f"Saved world info to S3 for world {world_id}")
    except Exception as e:
        logger.error(f"Error saving world info to S3 for world {world_id}: {e}")

async def backup_party_info(world_id, room_id):
    try:
        prefix = f"worlds/{world_id}/rooms/{room_id}/"
        last_active = worlds[world_id]['rooms'][room_id]['last_active']
        num_active_users = len(worlds[world_id]['rooms'][room_id]['active_users'])
        party_size = len(worlds[world_id]['rooms'][room_id]['users'])
        party_info = {
            last_active: last_active,
            num_active_users: num_active_users,
            party_size: party_size
        }
        party_info_string = json.dumps(party_info)
        asyncio.create_task(s3_actions.store(BUCKET, prefix, "info", party_info_string))
        logger.info(f"Saved party info to S3 for room {room_id} in world {world_id}")

        if num_active_users != 0:
            if room_id not in worlds[world_id]['activity']['active_parties']:
                worlds[world_id]['activity']['active_parties'].append(room_id)
        else:
            if room_id in worlds[world_id]['activity']['active_parties']:
                worlds[world_id]['activity']['active_parties'].remove(room_id)
        asyncio.create_task(backup_world_info(world_id))
    except Exception as e:
        logger.error(f"Error saving party info to S3 for room {room_id} in world {world_id}: {e}")

async def backup_main_party_id(world_id, main_party_id):
    try:
        prefix = f"worlds/{world_id}/"
        asyncio.create_task(s3_actions.store(BUCKET, prefix, "main_party_id", main_party_id))
        logger.info(f"Saved main party ID to S3 for world {world_id}")
    except Exception as e:
        logger.error(f"Error saving main party ID to S3 for world {world_id}: {e}")



def location_has_portal(world, location_id):
    if location_id in worlds[world]['locations']:
        portals = worlds[world]['locations'][location_id].get('portals', {})
        outgoing_portals = portals.get('outgoing')
        if outgoing_portals:
            return True
    return False


@router.post("/upload-character-icon")
async def upload_character_icon(request: Request, user_id: str = Depends(authenticate)):
    from fastapi import UploadFile, File, Form
    import shutil
    
    form = await request.form()
    icon_file = form.get('icon')
    character_id = form.get('character_id')
    world_id = form.get('world')
    
    if not icon_file or not character_id:
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    # Validate file type
    if not icon_file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Validate file size (5MB limit)
    max_size = 5 * 1024 * 1024  # 5MB
    file_content = await icon_file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size too large")
    
    try:
        # Process and resize image using PIL
        image = Image.open(io.BytesIO(file_content))
        
        # Convert to RGB if necessary (handles RGBA, etc.)
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize to reasonable dimensions (max 200x200)
        max_dimension = 200
        if image.width > max_dimension or image.height > max_dimension:
            image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        
        # Save as PNG to maintain quality
        output_buffer = io.BytesIO()
        image.save(output_buffer, format='PNG', optimize=True)
        processed_content = output_buffer.getvalue()
        
        # Save to static/images directory
        filename = f"{character_id}.png"
        file_path = os.path.join("static", "images", filename)
        
        # Ensure the directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Write the processed image
        with open(file_path, 'wb') as f:
            f.write(processed_content)
        
        logging.info(f"Character icon uploaded successfully for character {character_id}")
        
        return JSONResponse(content={
            "success": True,
            "message": "Icon uploaded successfully",
            "icon_url": f"/static/images/{filename}"
        })
        
    except Exception as e:
        logging.error(f"Error processing image: {e}")
        raise HTTPException(status_code=500, detail="Error processing image")
    
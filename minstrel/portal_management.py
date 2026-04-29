# noinspection PyInterpreter
import json
from fastapi import APIRouter, Depends, Request, Response, Query, HTTPException

from portal_search_elasticsearch import portal_search
from data_store import worlds, context_length_char
import s3_actions
import asyncio
import logging
from world_management import get_world, get_world_server, backup_location, backup_character, backup_room, backup_object, backup_user, initialize_room
from world_processing import get_portal_response, update_conversation_history
from world_utils import backup_adventure_info, backup_main_party_id
from ext_auth import authenticate
from ip_security import validate_internal_request
from ids import create_portal_id, get_party_tag
from http_client import http_client
from websocket_manager import websocket_manager as wsm

router = APIRouter()
logger = logging.getLogger(__name__)

BUCKET = "minstrel-data"

@router.post("/create-new-portal")
async def create_new_portal(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world_id = data['world_id']
    portal_direction = data.get('portal_direction', data.get('incoming_outgoing'))
    portal_type = data['portal_type']
    location_tag = data['location_tag']
    location_id = worlds[world_id]['tags'].get(location_tag, location_tag)
    object_id = data.get('object_id', None)
    
    portal_id = create_portal_id()
    worlds[world_id]['portals'][portal_id] = {}
    worlds[world_id]['portals'][portal_id]['id'] = portal_id
    worlds[world_id]['portals'][portal_id]['portal_direction'] = portal_direction
    worlds[world_id]['portals'][portal_id]['portal_type'] = portal_type 
    worlds[world_id]['portals'][portal_id]['location_id'] = location_id
    worlds[world_id]['portals'][portal_id]['creator_id'] = user_id

    if portal_type == 'object':
        worlds[world_id]['portals'][portal_id]['object_id'] = object_id
        if portal_direction == 'outgoing':
            await _save_outgoing_object_portal(
                world=world_id,
                portal_id=portal_id,
                destinations=[],
                description='',
                object_tag=object_id,
                user_id=user_id
            )
        elif portal_direction == 'incoming':
            await _save_incoming_object_portal(
                world=world_id,
                portal_id=portal_id,
                whitelisted_portals_received=[],
                description='',
                object_tag=object_id,
                user_id=user_id
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid portal direction")
    elif portal_type == 'location':
    # Automatically save the portal with blank description and empty destinations/connected portals
        if portal_direction == 'outgoing':
            await _save_outgoing_location_portal(
                world=world_id,
                portal_id=portal_id,
                destinations=[],
                description='',
                location_tag=location_tag,
                user_id=user_id
            )
        else:  # incoming
            await _save_incoming_location_portal(
                world=world_id,
                portal_id=portal_id,
                whitelisted_portals_received=[],
                whitelisted_worlds_received=[],
                description='',
                location_tag=location_tag,
                user_id=user_id
            )
    
    return {"id": portal_id}

async def send_character_portal(depart_world_id, dest_world_id, dest_portal_id, room_id, user_id, character_id):
    if depart_world_id not in worlds:
        logging.error(f"World {depart_world_id} not loaded when portal activated")
        raise ValueError(f"World {depart_world_id} not loaded")
    
    if character_id not in worlds[depart_world_id]['characters']:
        raise ValueError(f"Character {character_id} not found when portal activated")
    dest_server_url = await get_world_server(dest_world_id)
    
    #worlds[depart_world_id]['characters'][character_id]['world'] = dest_world_id
    #await backup_character(depart_world_id, character_id)

    #worlds[depart_world_id]['characters'][character_id]['location'] = #New_location
    character_data = worlds[depart_world_id]['characters'][character_id]
    
    # Get character's objects and their full data from the world's objects registry
    character_objects = character_data.get('objects', {})
    object_ids = list(character_objects.keys())
    
    # Collect full object data from world's objects registry
    objects_data = {}
    for object_id in object_ids:
        if object_id in worlds[depart_world_id]['objects']:
            objects_data[object_id] = worlds[depart_world_id]['objects'][object_id]
    
    # If destination is on a different server, make HTTP request
    if dest_server_url and dest_server_url.strip():
        try:
            # Prepare the payload for the receive-character-portal endpoint
            payload = {
                'depart_world_id': depart_world_id,
                'dest_world_id': dest_world_id,
                'character_id': character_id,
                'portal_id': dest_portal_id,
                'character_data': json.dumps(character_data),
                'user_id': user_id,
                'room_id': room_id,
                'object_ids': object_ids,
                'objects_data': json.dumps(objects_data)
            }

            request_url = f"{dest_server_url.rstrip('/')}/receive-character-portal"
            
            response = await http_client.post(request_url, json=payload)
            logging.info(f"Successfully sent character {character_id} to {dest_world_id} at {dest_server_url}")
            
            return {"success": True, "destination_server": dest_server_url, "destination_world": dest_world_id}
            
        except Exception as e:
            logging.error(f"Failed to send character to external server: {e}")
            # Revert character's world reference on failure
            worlds[depart_world_id]['characters'][character_id]['world'] = depart_world_id
            await backup_character(depart_world_id, character_id)
            raise RuntimeError(f"Failed to transfer character to external server: {str(e)}")
    
    # If destination is on the same server (current default behavior), handle locally
    else:
        if dest_world_id not in worlds:
            try:
                await get_world(dest_world_id)
            except Exception as e:
                logging.error(f"Failed to load destination world {dest_world_id}: {e}")
                # Revert character's world reference
                #worlds[depart_world_id]['characters'][character_id]['world'] = depart_world_id
                #await backup_character(depart_world_id, character_id)
                raise ValueError(f"Destination world {dest_world_id} not found")
        
        await _receive_character_portal(
            depart_world_id=depart_world_id,
            dest_world_id=dest_world_id,
            character_id=character_id,
            dest_portal_id=dest_portal_id,
            character_data=character_data,
            user_id=user_id,
            room_id=room_id,
            objects_data=objects_data
        )


@router.post('/receive-character-portal')
async def receive_character_portal(request: Request, client_ip: str = Depends(validate_internal_request)):
    data = await request.json()

    depart_world_id = data['depart_world_id']
    dest_world_id = data['dest_world_id']
    character_id = data['character_id']
    dest_portal_id = data['portal_id']
    character_data_json = data['character_data']
    user_id = data['user_id']
    room_id = data['room_id']
    #object_ids = data.get('object_ids', [])
    objects_data_json = data.get('objects_data', '{}')

    character_data = json.loads(character_data_json)
    objects_data = json.loads(objects_data_json)

    await _receive_character_portal(
        depart_world_id=depart_world_id,
        dest_world_id=dest_world_id,
        character_id=character_id,
        dest_portal_id=dest_portal_id,
        character_data=character_data,
        user_id=user_id,
        room_id=room_id,
        objects_data=objects_data
    )

async def _receive_character_portal(depart_world_id, dest_world_id, character_id, dest_portal_id, character_data, user_id, room_id, objects_data):
    if dest_world_id not in worlds:
        await get_world(dest_world_id)

    # Add the objects to the destination world's objects registry
    for object_id, object_data in objects_data.items():
        worlds[dest_world_id]['objects'][object_id] = object_data
        await backup_object(dest_world_id, object_id)

        object_portals = object_data.get('portals', {})
        if object_portals.get('incoming') or object_portals.get('outgoing'):
            await update_object_portal_world(depart_world_id, dest_world_id, object_id)

    worlds[dest_world_id]['characters'][character_id] = character_data

    location_id = worlds[dest_world_id]['portals'][dest_portal_id]['location_id']
    worlds[dest_world_id]['characters'][character_id]['location'] = location_id
    await backup_character(dest_world_id, character_id)

    worlds[dest_world_id]['users'].setdefault(user_id, {})
    worlds[dest_world_id]['users'][user_id].setdefault('characters', {})
    worlds[dest_world_id]['users'][user_id]['characters'].setdefault(character_id, {})
    worlds[dest_world_id]['users'][user_id]['characters'][character_id]['name'] = character_data['name']
    worlds[dest_world_id]['users'][user_id]['characters'][character_id]['room_id'] = room_id
    await backup_user(dest_world_id, user_id)


async def send_party_portal(depart_world_id, depart_portal_id, dest_portal_id, room_id, user_id):
    dest_portal_info = await portal_search.get_portal_by_id(dest_portal_id)
    if not dest_portal_info:
        logging.error(f"Destination portal {dest_portal_id} not found")
        raise ValueError(f"Destination portal {dest_portal_id} not found")
    dest_world_id = dest_portal_info.get('world_id') 

    party_users = worlds[depart_world_id].rooms[room_id].users
    for user_id in party_users:
        #user may have been more recently active with a character in a different party or may have multiple characters in party
        for character_id in worlds[depart_world_id]['users'][user_id]['characters']:
            if worlds[depart_world_id]['users'][user_id]['characters'][character_id]['room_id'] == room_id:
                await send_character_portal(depart_world_id, dest_world_id, dest_portal_id, room_id, user_id, character_id)

    depart_portal_type = worlds[depart_world_id]['portals'][depart_portal_id]['portal_type']
    room_data = worlds[depart_world_id].rooms[room_id]
    depart_portal_description = ""
    if depart_portal_type == 'location':
        location_id = worlds[depart_world_id]['portals'][depart_portal_id]['location_id']
        depart_portal_description = worlds[depart_world_id].locations[location_id].portals.outgoing[depart_portal_id].description
    elif depart_portal_type == 'object':
        object_id = worlds[depart_world_id]['portals'][depart_portal_id]['object_id']
        depart_portal_description = worlds[depart_world_id].objects[object_id].portals.outgoing[depart_portal_id].description
    
    dest_server_url = await get_world_server(dest_world_id)

    # If destination is on a different server, make HTTP request
    if dest_server_url and dest_server_url.strip():
        try:
            payload = {
                'dest_world_id': dest_world_id,
                'room_id': room_id,
                'room_data': json.dumps(room_data),
                'depart_portal_id': depart_portal_id,
                'depart_portal_description': depart_portal_description,
                'dest_portal_id': dest_portal_id,
                'dest_portal_description': dest_portal_description,
                'user_id': user_id
            }

            request_url = f"{dest_server_url.rstrip('/')}/receive-party-portal"
                
            portal_response = await http_client.post(request_url, json=payload)
            logging.info(f"Successfully sent room {room_id} data to {dest_world_id} at {dest_server_url}")
            
            return dest_world_id, portal_response
            
        except Exception as e:
            logging.error(f"Failed to send room data to external server: {e}")
            raise RuntimeError(f"Failed to transfer room data to external server: {str(e)}")
    
    # If destination is on the same server (current default behavior), handle locally
    else:
        print("destination is on the same server - send_party_portal")
        if dest_world_id not in worlds:
            try:
                await get_world(dest_world_id)
            except Exception as e:
                logging.error(f"Failed to load destination world {dest_world_id}: {e}")
                raise ValueError(f"Destination world not found: {dest_world_id}")
        
        print("past checking/loading world")
        dest_portal_type = worlds[dest_world_id]['portals'][dest_portal_id]['portal_type']
        print("past checking/loading portal type")
        dest_portal_description = ""
        if dest_portal_type == 'location':
            location_id = worlds[dest_world_id]['portals'][dest_portal_id]['location_id']
            print("at location_id: ", location_id)
            dest_portal_description = worlds[dest_world_id].locations[location_id].portals.incoming[dest_portal_id].description
            print("at dest_portal_description: ", dest_portal_description)
        elif dest_portal_type == 'object':
            object_id = worlds[dest_world_id]['portals'][dest_portal_id]['object_id']
            dest_portal_description = worlds[dest_world_id].objects[object_id].portals.incoming[dest_portal_id].description

        print("past dest_portal_description: ", dest_portal_description)
        await _receive_party_portal(
            depart_world_id=depart_world_id,
            dest_world_id=dest_world_id,
            room_id=room_id,
            room_data=room_data,
            depart_portal_id=depart_portal_id,
            depart_portal_description=depart_portal_description,
            dest_portal_id=dest_portal_id,
            dest_portal_description=dest_portal_description,
            user_id=user_id
        )
    

@router.post("/receive-party-portal")
async def receive_party_portal(request: Request, client_ip: str = Depends(validate_internal_request)):
    data = await request.json()
    depart_world_id = data['depart_world_id']
    dest_world_id = data['dest_world_id']
    room_id = data['room_id']
    room_data_json = data['room_data']
    depart_portal_id = data['depart_portal_id']
    depart_portal_description = data['depart_portal_description']
    dest_portal_id = data['dest_portal_id']
    user_id = data['user_id']
    
    if dest_world_id not in worlds:
        await get_world(dest_world_id)

    dest_portal_type = worlds[dest_world_id]['portals'][dest_portal_id]['portal_type']
    dest_portal_description = ""
    if dest_portal_type == 'location':
        dest_portal_description = worlds[dest_world_id]['locations'][dest_portal_id]['description']
    elif dest_portal_type == 'object':
        dest_portal_description = worlds[dest_world_id]['objects'][dest_portal_id]['description']

    room_data = json.loads(room_data_json)

    await _receive_party_portal(
        depart_world_id=depart_world_id,
        dest_world_id=dest_world_id,
        room_id=room_id,
        room_data=room_data,
        depart_portal_id=depart_portal_id,
        depart_portal_description=depart_portal_description,
        dest_portal_id=dest_portal_id,
        dest_portal_description=dest_portal_description,
        user_id=user_id
    )
    

async def _receive_party_portal(depart_world_id, dest_world_id, room_id, room_data, depart_portal_id, depart_portal_description, dest_portal_id, dest_portal_description, user_id):
    
    if dest_world_id not in worlds:
        await get_world(dest_world_id)

    worlds[dest_world_id].rooms[room_id] = room_data
    await backup_room(dest_world_id, room_id)

    room_websockets = [connection['websocket'] for connection in room_data['connections']]

    # Send set_world message to all websockets in the room after successful transfer
    await wsm.send_room(
        message={'route': 'set world', 'content': {'world_id': dest_world_id}},
        websockets=room_websockets
    )
    # Update WebSocket manager's internal tracking of world for each connection
    for connection in room_data['connections']:
        websocket = connection['websocket']
        wsm.set_world_id(websocket, dest_world_id)
    try:
        portal_response = await get_portal_response(
            depart_portal_id=depart_portal_id,
            depart_portal_description=depart_portal_description,
            dest_world_id=dest_world_id,
            dest_portal_description=dest_portal_description,
            dest_portal_id=dest_portal_id,
            room_id=room_id,
            user_id=user_id
        )
    except Exception as e:
        logging.error(f"Error getting portal response: {e}")

    # update travel history?

    #update world in adventure info for all party members
    for user_id in room_data['users']:
        for character_id in worlds[dest_world_id]['users'][user_id]['characters']:
            if worlds[dest_world_id]['users'][user_id]['characters'][character_id]['room_id'] == room_id:
                print("updating adventure info for user: ", user_id, " character: ", character_id)
                await backup_adventure_info(dest_world_id, user_id, character_id)

    await update_conversation_history(dest_world_id, room_id, "narrator", None, portal_response)

    dest_server_url = await get_world_server(dest_world_id)
    if dest_server_url and dest_server_url.strip():
        try:
            payload = {
                'depart_world_id': depart_world_id,
                'room_id': room_id
            }
            request_url = f"{dest_server_url.rstrip('/')}/finalize-transferred-party"
            response = await http_client.post(request_url, json=payload)
            logging.info(f"Successfully sent room {room_id} data for cleaning up party transfer to {dest_world_id} at {dest_server_url}")
            return response
        except Exception as e:
            logging.error(f"Failed to send room data to external server: {e}")
            raise RuntimeError(f"Failed to transfer room data to external server: {str(e)}")
    else:
        await _finalize_transferred_party(depart_world_id, room_id)

@router.post("/finalize-transferred-party")
async def finalize_transferred_party(request: Request, client_ip: str = Depends(validate_internal_request)):
    data = await request.json()
    depart_world_id = data['depart_world_id']
    room_id = data['room_id']

    await _finalize_transferred_party(depart_world_id, room_id)

async def _finalize_transferred_party(depart_world_id, room_id):
    if depart_world_id not in worlds:
        await get_world(depart_world_id)
    user_ids = worlds[depart_world_id].rooms[room_id]['users']

    for user_id in user_ids:
        # Create a list of character IDs to avoid modifying dict during iteration
        character_ids = list(worlds[depart_world_id]['users'][user_id]['characters'].keys())
        for character_id in character_ids:
            if worlds[depart_world_id]['users'][user_id]['characters'][character_id]['room_id'] == room_id:
                worlds[depart_world_id]['users'][user_id]['characters'].pop(character_id)
        await backup_user(depart_world_id, user_id)

    # initialize room incase it is default room
    # clear conversation from world data
    initialize_room(depart_world_id, room_id)

    if worlds[depart_world_id].main_party_id == room_id:
        new_main_party_id = get_party_tag()
        initialize_room(depart_world_id, new_main_party_id)
        worlds[depart_world_id].main_party_id = new_main_party_id
        asyncio.create_task(backup_main_party_id(depart_world_id, new_main_party_id))
    logging.info(f"Finalized party transfer for room {room_id} in world {depart_world_id}")
        

async def notify_portal_connection(dest_server_url, world_id, portal_id, portal_direction, portal_type, connected_portal_id, entity_id):
    try:
        payload = {
            'world_id': world_id,
            'portal_id': portal_id,
            'portal_direction': portal_direction,
            'portal_type': portal_type,
            'connected_portal_id': connected_portal_id,
            'entity_id': entity_id
        }
        
        notify_url = f"{dest_server_url.rstrip('/')}/portal-connected"
        response = await http_client.post(notify_url, json=payload)
        logger.info(f"Successfully notified server {dest_server_url} about portal connection {connected_portal_id} -> {portal_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to notify server {dest_server_url} about portal connection: {e}")
        return False

async def notify_portal_disconnection(dest_server_url, world_id, portal_id, portal_direction, portal_type, disconnected_portal_id, entity_id):
    """Notify another server that a portal connection has been removed
    
    Args:
        dest_server_url: URL of the destination server
        world_id: World ID containing the portal
        portal_id: ID of the portal being disconnected
        portal_direction: 'incoming' or 'outgoing'
        portal_type: 'location' or 'object'
        disconnected_portal_id: ID of the portal being disconnected from this one
        entity_id: location_id or object_id depending on portal_type
    """
    try:
        payload = {
            'world_id': world_id,
            'portal_id': portal_id,
            'portal_direction': portal_direction,
            'portal_type': portal_type,
            'disconnected_portal_id': disconnected_portal_id,
            'entity_id': entity_id
        }
        
        notify_url = f"{dest_server_url.rstrip('/')}/portal-disconnected"
        response = await http_client.post(notify_url, json=payload)
        logger.info(f"Successfully notified server {dest_server_url} about portal disconnection {disconnected_portal_id} -X-> {portal_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to notify server {dest_server_url} about portal disconnection: {e}")
        return False

@router.post("/portal-connected")
async def portal_connected(request: Request, client_ip: str = Depends(validate_internal_request)):
    """Receive notification from another server that a portal has been connected"""
    data = await request.json()
    world_id = data['world_id']
    portal_id = data['portal_id']
    portal_direction = data.get('portal_direction')
    portal_type = data.get('portal_type')
    connected_portal_id = data['connected_portal_id']
    entity_id = data.get('entity_id')
    
    try:
        # Load world if not in memory
        if world_id not in worlds:
            await get_world(world_id)
        
        # Determine the correct path based on portal_type
        if portal_type == 'location':
            entity_dict = worlds[world_id]['locations'][entity_id]
        elif portal_type == 'object':
            entity_dict = worlds[world_id]['objects'][entity_id]
        else:
            raise HTTPException(status_code=400, detail=f"Invalid portal_type: {portal_type}")
        
        # Update the connection status
        if portal_direction == 'outgoing':
            entity_dict['portals']['outgoing'][portal_id]['destinations'][connected_portal_id]['connected'] = True
            logger.info(f"Updated {portal_type} outgoing portal {portal_id} destination {connected_portal_id} to connected=True")
        elif portal_direction == 'incoming':
            entity_dict['portals']['incoming'][portal_id]['whitelisted_portals'][connected_portal_id]['connected'] = True
            logger.info(f"Updated {portal_type} incoming portal {portal_id} connected portal {connected_portal_id} to connected=True")
        
        # Backup the entity
        if portal_type == 'location':
            await backup_location(world_id, entity_id)
        
        if portal_type == 'object':
            await backup_object(world_id, entity_id)
        
        return {"success": True, "message": "Portal connection updated"}
    except Exception as e:
        logger.error(f"Error updating portal connection: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update portal connection: {str(e)}")

@router.post("/portal-disconnected")
async def portal_disconnected(request: Request, client_ip: str = Depends(validate_internal_request)):
    """Receive notification from another server that a portal has been disconnected"""
    data = await request.json()
    world_id = data['world_id']
    portal_id = data['portal_id']
    portal_direction = data.get('portal_direction')
    portal_type = data.get('portal_type')
    disconnected_portal_id = data['disconnected_portal_id']
    entity_id = data.get('entity_id')
    
    try:
        # Load world if not in memory
        if world_id not in worlds:
            await get_world(world_id)
        
        # Determine the correct path based on portal_type
        if portal_type == 'location':
            entity_dict = worlds[world_id]['locations'][entity_id]
        elif portal_type == 'object':
            entity_dict = worlds[world_id]['objects'][entity_id]
        else:
            raise HTTPException(status_code=400, detail=f"Invalid portal_type: {portal_type}")
        
        # Update the disconnection status
        if portal_direction == 'outgoing':
            if portal_id in entity_dict.get('portals', {}).get('outgoing', {}):
                if disconnected_portal_id in entity_dict['portals']['outgoing'][portal_id].get('destinations', {}):
                    entity_dict['portals']['outgoing'][portal_id]['destinations'][disconnected_portal_id]['connected'] = False
                    logger.info(f"Updated {portal_type} outgoing portal {portal_id} destination {disconnected_portal_id} to connected=False")
        elif portal_direction == 'incoming':
            if portal_id in entity_dict.get('portals', {}).get('incoming', {}):
                if disconnected_portal_id in entity_dict['portals']['incoming'][portal_id].get('whitelisted_portals', {}):
                    entity_dict['portals']['incoming'][portal_id]['whitelisted_portals'][disconnected_portal_id]['connected'] = False
                    logger.info(f"Updated {portal_type} incoming portal {portal_id} connected portal {disconnected_portal_id} to connected=False")
        
        # Backup the entity
        if portal_type == 'location':
            await backup_location(world_id, entity_id)
        if portal_type == 'object':
            await backup_object(world_id, entity_id)
        
        return {"success": True, "message": "Portal disconnection updated"}
    except Exception as e:
        logger.error(f"Error updating portal disconnection: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update portal disconnection: {str(e)}")


async def _save_outgoing_location_portal(world, portal_id, destinations, description, location_tag, user_id):
    """Internal function to handle the logic of saving an outgoing portal"""
    location_id = worlds[world]['tags'].get(location_tag, location_tag)
    

    worlds[world]['locations'][location_id].setdefault('portals', {})
    worlds[world]['locations'][location_id]['portals'].setdefault('outgoing', {})
    worlds[world]['locations'][location_id]['portals']['outgoing'].setdefault(portal_id, {})
    
    # Save description
    worlds[world]['locations'][location_id]['portals']['outgoing'][portal_id]['description'] = description
    
    # Get existing destinations to preserve connected: True status
    existing_destinations = worlds[world]['locations'][location_id]['portals'].get('outgoing', {}).get(portal_id, {}).get('destinations', {})
    
    worlds[world]['locations'][location_id]['portals']['outgoing'][portal_id]['destinations'] = {}
    
    # Build destination dict with connection status
    destination_portal_ids = []
    for dest_portal_id in destinations:
        worlds[world]['locations'][location_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id] = {
            'connected': existing_destinations.get(dest_portal_id, {}).get('connected', False)
        }
        destination_portal_ids.append(dest_portal_id)
    
    # Reindex this portal with updated portal_list
    try:
        # Get world info
        world_info_str = worlds[world]['info']
        world_info = json.loads(world_info_str)
        world_creator_name = world_info.get('creator', 'Unknown')
        world_creator_id = world_info.get('creator_id', user_id)
        world_name = world_info.get('name', 'Unknown World')
        
        # Get portal creator
        portal_creator_id = user_id
        portal_creator_name = await s3_actions.get_username(portal_creator_id)
        
        # Check if world is public
        is_public = worlds[world].get('settings', {}).get('world_settings', {}).get('public', False)
        
        # Index with portal_list
        await portal_search.index_portal({
            "portal_id": portal_id,
            "world_id": world,
            "world_name": world_name,
            "world_creator_id": world_creator_id,
            "world_creator_name": world_creator_name,
            "creator_name": portal_creator_name,
            "location_id": location_id,
            "portal_direction": "outgoing",
            "portal_type": "location",
            "portal_list": destination_portal_ids,
            "is_public": is_public,
            "tags": []
        })
        
        # Check each destination to see if they have this portal in their portal_list
        for dest_portal_id in destination_portal_ids:
            if not worlds[world]['locations'][location_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id].get('connected', False):
                try:
                    # Get destination portal directly by ID
                    dest_portal = await portal_search.get_portal_by_id(dest_portal_id)
                    if dest_portal:
                        dest_portal_list = dest_portal.get('portal_list', [])
                        dest_world_list = dest_portal.get('world_list', [])
                        
                        # Change from False to True if found in destination's portal_list
                        if portal_id in dest_portal_list or world in dest_world_list:
                            worlds[world]['locations'][location_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id]['connected'] = True
                            
                            # Update the destination portal about the connection
                            dest_world_id = dest_portal.get('world_id')
                            dest_location_id = dest_portal.get('location_id')
                            dest_portal_type = dest_portal.get('portal_type')
                            dest_object_id = dest_portal.get('object_id')
                            dest_server_url = await get_world_server(dest_world_id)
                            
                            if dest_portal_type == 'object':
                                dest_entity_id = dest_object_id
                            elif dest_portal_type == 'location':
                                dest_entity_id = dest_location_id
                            
                            dest_portal_type_directory = dest_portal_type + 's'
                            
                            if dest_server_url is None: # Same server - update directly
                                if dest_world_id not in worlds:
                                    await get_world(dest_world_id)
                                if dest_world_id in worlds and dest_entity_id in worlds[dest_world_id].get(dest_portal_type_directory, {}):
                                    worlds[dest_world_id][dest_portal_type_directory][dest_entity_id].setdefault('portals', {})
                                    worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals'].setdefault('incoming', {})
                                    if dest_portal_id in worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals']['incoming']:
                                        worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals']['incoming'][dest_portal_id].setdefault('whitelisted_portals', {})
                                        worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals']['incoming'][dest_portal_id]['whitelisted_portals'][portal_id] = {'connected': True}
                                        logger.info(f"Updated connection for portal {dest_portal_id} after it was added to whitelist for outgoing location portal {portal_id}")
                                        if dest_portal_type == 'object':
                                            asyncio.create_task(backup_object(dest_world_id, dest_entity_id))
                                        else:
                                            asyncio.create_task(backup_location(dest_world_id, dest_entity_id))
                            else:
                                # Different server - notify via HTTP
                                asyncio.create_task(notify_portal_connection(
                                    dest_server_url,
                                    dest_world_id,
                                    dest_portal_id,
                                    'incoming',  # From destination's perspective, it's incoming
                                    dest_portal_type,  # Portal type
                                    portal_id,  # Our portal is the one connecting to it
                                    dest_entity_id
                                ))
                            
                except Exception as e:
                    logger.error(f"Error checking destination portal {dest_portal_id}: {e}")
        
        # Handle removed destinations - set their connected status to False
        removed_destinations = set(existing_destinations.keys()) - set(destination_portal_ids)
        for removed_dest_id in removed_destinations:
            try:
                # Get the removed destination portal
                removed_portal = await portal_search.get_portal_by_id(removed_dest_id)
                if removed_portal:
                    removed_world_id = removed_portal.get('world_id')
                    removed_location_id = removed_portal.get('location_id')
                    removed_object_id = removed_portal.get('object_id')
                    removed_portal_type = removed_portal.get('portal_type')
                    removed_server_url = await get_world_server(removed_world_id)
                    
                    if removed_portal_type == 'object':
                        removed_entity_id = removed_object_id
                    elif removed_portal_type == 'location':
                        removed_entity_id = removed_location_id
                    
                    # Create directory variable for consistency
                    removed_portal_type_directory = removed_portal_type + 's'
                    
                    if removed_server_url is None:
                        # Same server - update directly
                        if removed_world_id not in worlds:
                            await get_world(removed_world_id)
                        if removed_entity_id in worlds[removed_world_id].get(removed_portal_type_directory, {}):
                            if removed_dest_id in worlds[removed_world_id][removed_portal_type_directory][removed_entity_id].get('portals', {}).get('incoming', {}):
                                if portal_id in worlds[removed_world_id][removed_portal_type_directory][removed_entity_id]['portals']['incoming'][removed_dest_id].get('whitelisted_portals', {}):
                                    worlds[removed_world_id][removed_portal_type_directory][removed_entity_id]['portals']['incoming'][removed_dest_id]['whitelisted_portals'][portal_id]['connected'] = False
                                    logger.info(f"Updated connection for portal {removed_dest_id} after it was removed from white list for outgoing location portal {portal_id}")
                                    if removed_portal_type == 'object':
                                        asyncio.create_task(backup_object(removed_world_id, removed_entity_id))
                                    else:
                                        asyncio.create_task(backup_location(removed_world_id, removed_entity_id))
                    else:
                        # Different server - notify via HTTP
                        asyncio.create_task(notify_portal_disconnection(
                            removed_server_url,
                            removed_world_id,
                            removed_dest_id,
                            'incoming',  # From removed portal's perspective, it's incoming
                            removed_portal_type,  # Portal type
                            portal_id,  # Our portal was connecting to it
                            removed_entity_id
                        ))
            except Exception as e:
                logger.error(f"Error updating removed destination portal {removed_dest_id}: {e}")
                
        logger.info(f"Saved outgoing portal {portal_id} with {len(destination_portal_ids)} destinations")
        
    except Exception as e:
        logger.error(f"Error indexing portal {portal_id}: {e}")
    
    # Backup location
    asyncio.create_task(backup_location(world, location_id))
    
    # Return connection status for each destination
    connections = {}
    for dest_portal_id in destination_portal_ids:
        connections[dest_portal_id] = worlds[world]['locations'][location_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id].get('connected', False)
    
    return {"success": True, "connections": connections, "portal_id": portal_id}

@router.post("/save-outgoing-location-portal")
async def save_outgoing_location_portal(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    portal_id = data['id']
    destinations = data['destinations']  # List of portal IDs to connect to
    description = data.get('description', '')  # Portal description
    location_tag = data['location_tag']

    if not str(description).strip():
        raise HTTPException(status_code=422, detail="Outgoing portals require activation description.")

    return await _save_outgoing_location_portal(world, portal_id, destinations, description, location_tag, user_id)

async def _save_incoming_location_portal(world, portal_id, whitelisted_portals_received, whitelisted_worlds_received, description, location_tag, user_id):
    logger.info(f"_save_incoming_location_portal called: portal_id={portal_id}, world={world}, location_tag={location_tag}")
    location_id = worlds[world]['tags'].get(location_tag, location_tag)
    
    worlds[world]['locations'][location_id].setdefault('portals', {})
    worlds[world]['locations'][location_id]['portals'].setdefault('incoming', {})
    worlds[world]['locations'][location_id]['portals']['incoming'].setdefault(portal_id, {})
    
    # Save description
    worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['description'] = description
    
    # Get existing connections to preserve connected: True status
    existing_portal_connections = worlds[world]['locations'][location_id]['portals'].get('incoming', {}).get(portal_id, {}).get('whitelisted_portals', {})
    existing_world_connections = worlds[world]['locations'][location_id]['portals'].get('incoming', {}).get(portal_id, {}).get('whitelisted_worlds', {})
    
    worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['whitelisted_portals'] = {}
    
    # Build connected portals dict with connection status
    whitelisted_portal_ids = []
    for whitelisted_portal_id in whitelisted_portals_received:
        # Preserve existing connected status if it was True
        worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id] = {
            'connected': existing_portal_connections.get(whitelisted_portal_id, {}).get('connected', False)
        }
        whitelisted_portal_ids.append(whitelisted_portal_id)

    worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['whitelisted_worlds'] = {}
    
    whitelisted_world_ids = []
    for connected_world_id in whitelisted_worlds_received: 
        worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['whitelisted_worlds'][connected_world_id] = {
            'connected': existing_world_connections.get(connected_world_id, {}).get('connected', False)
        }
        whitelisted_world_ids.append(connected_world_id)
    
    # Reindex this portal with updated portal_list
    try:
        # Get world info
        world_info_str = worlds[world]['info']
        world_info = json.loads(world_info_str)
        world_creator_name = world_info.get('creator', 'Unknown')
        world_creator_id = world_info.get('creator_id', user_id)
        world_name = world_info.get('name', 'Unknown World')
        
        # Get portal creator
        portal_creator_id = user_id
        portal_creator_name = await s3_actions.get_username(portal_creator_id)
        
        # Check if world is public
        is_public = worlds[world].get('settings', {}).get('world_settings', {}).get('public', False)
        
        # Index with portal_list
        await portal_search.index_portal({
            "portal_id": portal_id,
            "world_id": world,
            "world_name": world_name,
            "world_creator_id": world_creator_id,
            "world_creator_name": world_creator_name,
            "creator_name": portal_creator_name,
            "location_id": location_id,
            "portal_direction": "incoming",
            "portal_type": "location",
            "portal_list": whitelisted_portal_ids,
            "world_list": whitelisted_world_ids,
            "is_public": is_public,
            "tags": []
        })
        
        # Check each connected portal to see if they have this portal in their portal_list
        for whitelisted_portal_id in whitelisted_portal_ids:
            # Only check if connection currently False
            if not worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id].get('connected', False):
                try:
                    # Get whitelisted portal directly by ID
                    whitelisted_portal = await portal_search.get_portal_by_id(whitelisted_portal_id)
                    if whitelisted_portal:
                        allowed_portal_connections = whitelisted_portal.get('portal_list', [])
                        
                        # Change from False to True if found in connected portal's portal_list
                        if portal_id in allowed_portal_connections:
                            worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id]['connected'] = True
                            
                            # Update the connected portal's server about the connection
                            conn_world_id = whitelisted_portal.get('world_id')
                            conn_location_id = whitelisted_portal.get('location_id')
                            conn_portal_direction = whitelisted_portal.get('portal_direction')
                            conn_portal_type = whitelisted_portal.get('portal_type')
                            conn_object_id = whitelisted_portal.get('object_id')

                            if conn_portal_type == 'object':
                                conn_entity_id = conn_object_id
                            elif conn_portal_type == 'location':
                                conn_entity_id = conn_location_id
                            conn_server_url = await get_world_server(conn_world_id)
                            
                            if conn_server_url is None:
                                # Same server - update directly
                                if conn_world_id not in worlds:
                                    await get_world(conn_world_id)

                                portal_type_directory = conn_portal_type + 's'

                                if conn_entity_id in worlds[conn_world_id].get(portal_type_directory, {}):
                                    worlds[conn_world_id][portal_type_directory][conn_entity_id].setdefault('portals', {})
                                    worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals'].setdefault('outgoing', {})
                                    if whitelisted_portal_id in worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals']['outgoing']:
                                        worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals']['outgoing'][whitelisted_portal_id].setdefault('destinations', {})
                                        worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals']['outgoing'][whitelisted_portal_id]['destinations'][portal_id] = {'connected': True}
                                        logger.info(f"Updated connection for portal {whitelisted_portal_id} after it was added to the whitelist for portal {portal_id}")
                                        if conn_portal_type == 'object':
                                            asyncio.create_task(backup_object(conn_world_id, conn_entity_id))
                                        elif conn_portal_type == 'location':
                                            asyncio.create_task(backup_location(conn_world_id, conn_entity_id))
 
                            else:
                                # Different server - notify via HTTP
                                asyncio.create_task(notify_portal_connection(
                                    conn_server_url,
                                    conn_world_id,
                                    whitelisted_portal_id,
                                    'outgoing',  # From connected portal's perspective, it's outgoing
                                    conn_portal_type,
                                    portal_id,  # Outgoing portal being saved is the destination
                                    conn_location_id
                                ))
                            
                except Exception as e:
                    logger.error(f"Error checking connected portal {whitelisted_portal_id}: {e}")

        new_world_connections = set(whitelisted_world_ids) - set(existing_world_connections.keys())
        for new_world_id in new_world_connections:
            try:
                # Get all portals from the newly added world that whitelist this portal_id in their portal_list
                new_world_portals = await portal_search.get_world_portals_whitelisting_portal(new_world_id, portal_id)
                
                for new_world_portal in new_world_portals:
                    new_world_portal_id = new_world_portal.get('portal_id')
                    new_world_portal_direction = new_world_portal.get('portal_direction')
                    new_world_location_id = new_world_portal.get('location_id')
                    new_world_portal_type = new_world_portal.get('portal_type')
                    new_world_object_id = new_world_portal.get('object_id')

                    if new_world_portal_type == 'object':
                        new_world_entity_id = new_world_object_id
                    elif new_world_portal_type == 'location':
                        new_world_entity_id = new_world_location_id

                    # Skip if already connected (already in connected_portals with connected=True)
                    if new_world_portal_id in existing_portal_connections and existing_portal_connections[new_world_portal_id].get('connected', False):
                        logger.info(f"Skipping connection for portal {new_world_portal_id} - already connected")
                        continue
                    
                    # Set connection to True for this portal
                    new_server_url = await get_world_server(new_world_id)
                    
                    if new_server_url is None:
                        # Same server - update directly
                        if new_world_id not in worlds:
                            await get_world(new_world_id)

                        portal_type_directory = new_world_portal_type + 's'

                        if new_world_entity_id in worlds[new_world_id].get(portal_type_directory, {}):
                            worlds[new_world_id][portal_type_directory][new_world_entity_id].setdefault('portals', {})
                            worlds[new_world_id][portal_type_directory][new_world_entity_id]['portals'].setdefault('outgoing', {})
                            if new_world_portal_id in worlds[new_world_id][portal_type_directory][new_world_entity_id]['portals']['outgoing']:
                                worlds[new_world_id][portal_type_directory][new_world_entity_id]['portals']['outgoing'][new_world_portal_id].setdefault('destinations', {})
                                if portal_id in worlds[new_world_id][portal_type_directory][new_world_entity_id]['portals']['outgoing'][new_world_portal_id]['destinations']:
                                    worlds[new_world_id][portal_type_directory][new_world_entity_id]['portals']['outgoing'][new_world_portal_id]['destinations'][portal_id]['connected'] = True
                                    logger.info(f"Updated connection for portal {new_world_portal_id} after world {new_world_id} was added to whitelist for incoming location portal {portal_id}")
                                    if new_world_portal_type == 'object':
                                        asyncio.create_task(backup_object(new_world_id, new_world_entity_id))
                                    else:
                                        asyncio.create_task(backup_location(new_world_id, new_world_entity_id))
                    else:
                        # Different server - notify via HTTP
                        asyncio.create_task(notify_portal_connection(
                            new_server_url,
                            new_world_id,
                            new_world_portal_id,
                            new_world_portal_direction,
                            new_world_portal_type,
                            portal_id,  # This incoming portal is now connectable
                            new_world_location_id
                        ))
            except Exception as e:
                logger.error(f"Error updating portals in newly added world {new_world_id}: {e}")
        
        # Handle removed connected portals - set their connected status to False
        removed_portal_connections = set(existing_portal_connections.keys()) - set(whitelisted_portal_ids)
        for removed_conn_id in removed_portal_connections:
            try:
                # Get the removed connected portal
                removed_portal = await portal_search.get_portal_by_id(removed_conn_id)
                if removed_portal:
                    removed_world_id = removed_portal.get('world_id')
                    removed_location_id = removed_portal.get('location_id')
                    removed_object_id = removed_portal.get('object_id')
                    removed_portal_type = removed_portal.get('portal_type')
                    removed_server_url = await get_world_server(removed_world_id)

                    if removed_portal_type == 'object':
                        removed_entity_id = removed_object_id
                    elif removed_portal_type == 'location':
                        removed_entity_id = removed_location_id
                    
                    # Create directory variable for consistency
                    removed_portal_type_directory = removed_portal_type + 's'
                    
                    if removed_server_url is None:
                        if removed_world_id not in worlds:
                            await get_world(removed_world_id)

                        portal_type_directory = removed_portal_type_directory

                        # Same server - update directly
                        if removed_entity_id in worlds[removed_world_id].get(portal_type_directory, {}):
                                    worlds[removed_world_id][portal_type_directory][removed_entity_id].setdefault('portals', {})
                                    worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals'].setdefault('outgoing', {})
                                    if removed_conn_id in worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing']:
                                        worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing'][removed_conn_id].setdefault('destinations', {})
                                        worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing'][removed_conn_id]['destinations'][portal_id] = {'connected': False}
                                        logger.info(f"Updated connection for portal {removed_conn_id} after it was removed from whitelist for incoming location portal {portal_id}")
                                        if removed_portal_type == 'object':
                                            asyncio.create_task(backup_object(removed_world_id, removed_entity_id))
                                        elif removed_portal_type == 'location':
                                            asyncio.create_task(backup_location(removed_world_id, removed_entity_id))
                    else:
                        # Different server - notify via HTTP
                        asyncio.create_task(notify_portal_disconnection(
                            removed_server_url,
                            removed_world_id,
                            removed_conn_id,
                            'outgoing',  # From removed portal's perspective, it's outgoing
                            removed_portal_type,
                            portal_id,  # Incoming portal being saved is the destination
                            removed_location_id
                        ))
            except Exception as e:
                logger.error(f"Error updating removed connected portal {removed_conn_id}: {e}")

        removed_world_connections = set(existing_world_connections.keys()) - set(whitelisted_world_ids)
        for removed_world_id in removed_world_connections:
            try:
                # Get only portals from the removed world that whitelist this portal_id in their portal_list
                removed_world_portals = await portal_search.get_world_portals_whitelisting_portal(removed_world_id, portal_id)
                
                for removed_world_portal in removed_world_portals:
                    removed_world_portal_id = removed_world_portal.get('portal_id')
                    removed_world_location_id = removed_world_portal.get('location_id')
                    removed_world_portal_type = removed_world_portal.get('portal_type')
                    removed_world_object_id = removed_world_portal.get('object_id')

                    if removed_world_portal_id in whitelisted_portal_ids:
                        logger.info(f"Skipping disconnection for portal {removed_world_portal_id} - still in portal_list")
                        continue
                    
                    # Determine the entity ID based on portal type
                    if removed_world_portal_type == 'object':
                        removed_entity_id = removed_world_object_id
                    elif removed_world_portal_type == 'location':
                        removed_entity_id = removed_world_location_id
                    else:
                        # Skip if portal type is not supported
                        continue
                    
                    removed_server_url = await get_world_server(removed_world_id)
                    
                    if removed_server_url is None:
                        if removed_world_id not in worlds:
                            await get_world(removed_world_id)
                        # Same server - update directly
                        if removed_world_id in worlds:
                            portal_type_directory = removed_world_portal_type + 's'
                            
                            if removed_entity_id in worlds[removed_world_id].get(portal_type_directory, {}):
                                worlds[removed_world_id][portal_type_directory][removed_entity_id].setdefault('portals', {})
                                worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals'].setdefault('outgoing', {})
                                if removed_world_portal_id in worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing']:
                                    if portal_id in worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing'][removed_world_portal_id].get('destinations', {}):
                                        worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing'][removed_world_portal_id]['destinations'][portal_id]['connected'] = False
                                        logger.info(f"Updated connection for portal {removed_world_portal_id} after world {removed_world_id} was removed from whitelist for incoming location portal {portal_id}")
                                        if removed_world_portal_type == 'object':
                                            asyncio.create_task(backup_object(removed_world_id, removed_entity_id))
                                        elif removed_world_portal_type == 'location':
                                            asyncio.create_task(backup_location(removed_world_id, removed_entity_id))
                                
                    else:
                        # Different server - notify via HTTP
                        asyncio.create_task(notify_portal_disconnection(
                            removed_server_url,
                            removed_world_id,
                            removed_world_portal_id,
                            'outgoing',
                            removed_world_portal_type,
                            portal_id,  
                            removed_world_location_id
                        ))
            except Exception as e:
                logger.error(f"Error updating portals in removed world {removed_world_id}: {e}")
                
        logger.info(f"Saved incoming portal {portal_id} with {len(whitelisted_portal_ids)} whitelisted portals")
        
    except Exception as e:
        logger.error(f"Error indexing portal {portal_id}: {e}")
    
    # Backup location
    asyncio.create_task(backup_location(world, location_id))
    
    # Return connection status for each connected portal
    connections = {}
    for whitelisted_portal_id in whitelisted_portal_ids:
        connections[whitelisted_portal_id] = worlds[world]['locations'][location_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id].get('connected', False)
    
    return {"success": True, "connections": connections, "portal_id": portal_id}

@router.post("/save-incoming-location-portal")
async def save_incoming_location_portal(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    portal_id = data['id']
    connected_portals = data['whitelisted_portals']  # List of portal IDs that can be connected to this one
    connected_worlds = data.get('whitelisted_worlds', [])  # List of world IDs that can be connected to this one
    description = data.get('description', '')  # Portal description
    location_tag = data['location_tag']
    
    return await _save_incoming_location_portal(world, portal_id, connected_portals, connected_worlds, description, location_tag, user_id)

async def _save_incoming_object_portal(world, portal_id, whitelisted_portals_received, description, object_tag, user_id):
    # Get object ID and Location ID from tags
    object_id = worlds[world]['tags'].get(object_tag, object_tag)

    
    worlds[world]['objects'][object_id].setdefault('portals', {})
    worlds[world]['objects'][object_id]['portals'].setdefault('incoming', {})
    worlds[world]['objects'][object_id]['portals']['incoming'].setdefault(portal_id, {})
    
    # Save description and location ID
    worlds[world]['objects'][object_id]['portals']['incoming'][portal_id]['description'] = description
    
    existing_portal_connections = worlds[world]['objects'][object_id]['portals'].get('incoming', {}).get(portal_id, {}).get('whitelisted_portals', {})
    
    worlds[world]['objects'][object_id]['portals']['incoming'][portal_id]['whitelisted_portals'] = {}
    
    # Build connected portals dict with connection status
    whitelisted_portal_ids = []
    for whitelisted_portal_id in whitelisted_portals_received:
        # Preserve existing connected status if it was True
        worlds[world]['objects'][object_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id] = {
            'connected': existing_portal_connections.get(whitelisted_portal_id, {}).get('connected', False)
        }
        whitelisted_portal_ids.append(whitelisted_portal_id)
    
    # Reindex this portal with updated portal_list
    try:
        # Get world info
        world_info_str = worlds[world]['info']
        world_info = json.loads(world_info_str)
        world_creator_name = world_info.get('creator', 'Unknown')
        world_creator_id = world_info.get('creator_id', user_id)
        world_name = world_info.get('name', 'Unknown World')
        
        # Get portal creator
        portal_creator_id = user_id
        portal_creator_name = await s3_actions.get_username(portal_creator_id)
        
        # Check if world is public
        is_public = worlds[world].get('settings', {}).get('world_settings', {}).get('public', False)
        
        # Index with portal_list
        await portal_search.index_portal({
            "portal_id": portal_id,
            "world_id": world,
            "world_name": world_name,
            "world_creator_id": world_creator_id,
            "world_creator_name": world_creator_name,
            "creator_name": portal_creator_name,
            "object_id": object_id,
            "portal_direction": "incoming",
            "portal_type": "object",
            "portal_list": whitelisted_portal_ids,
            "is_public": is_public,
            "tags": []
        })
        
        # Check each connected portal to see if they have this portal in their portal_list
        for whitelisted_portal_id in whitelisted_portal_ids:
            # Only check if connection currently False
            if not worlds[world]['objects'][object_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id].get('connected', False):
                try:
                    # Get whitelisted portal directly by ID
                    whitelisted_portal = await portal_search.get_portal_by_id(whitelisted_portal_id)
                    if whitelisted_portal:
                        allowed_portal_connections = whitelisted_portal.get('portal_list', [])
                        
                        # Change from False to True if found in connected portal's portal_list
                        if portal_id in allowed_portal_connections:
                            worlds[world]['objects'][object_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id]['connected'] = True
                            
                            # Update the connected portal's server about the connection
                            conn_world_id = whitelisted_portal.get('world_id')
                            conn_portal_type = whitelisted_portal.get('portal_type')
                            conn_location_id = whitelisted_portal.get('location_id')
                            conn_object_id = whitelisted_portal.get('object_id')
                            conn_server_url = await get_world_server(conn_world_id)

                            if conn_portal_type == 'object':
                                conn_entity_id = conn_object_id
                            elif conn_portal_type == 'location':
                                conn_entity_id = conn_location_id
                            
                            if conn_server_url is None:
                                # Same server - update directly
                                if conn_world_id not in worlds:
                                    await get_world(conn_world_id)

                                portal_type_directory = conn_portal_type + 's'

                                if conn_entity_id in worlds[conn_world_id].get(portal_type_directory, {}):
                                    worlds[conn_world_id][portal_type_directory][conn_entity_id].setdefault('portals', {})
                                    worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals'].setdefault('outgoing', {})
                                    if whitelisted_portal_id in worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals']['outgoing']:
                                        worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals']['outgoing'][whitelisted_portal_id].setdefault('destinations', {})
                                        worlds[conn_world_id][portal_type_directory][conn_entity_id]['portals']['outgoing'][whitelisted_portal_id]['destinations'][portal_id] = {'connected': True}
                                        logger.info(f"Updated connection for {whitelisted_portal_id} after being added to whitelist for incoming object portal {portal_id}")
                                        if conn_portal_type == 'object':
                                            asyncio.create_task(backup_object(conn_world_id, conn_entity_id))
                                        elif conn_portal_type == 'location':
                                            asyncio.create_task(backup_location(conn_world_id, conn_entity_id))

                            else:
                                # Different server - notify via HTTP
                                asyncio.create_task(notify_portal_connection(
                                    conn_server_url,
                                    conn_world_id,
                                    whitelisted_portal_id,
                                    'outgoing',  # From connected portal's perspective, it's outgoing
                                    conn_portal_type,
                                    portal_id,  # Outgoing portal being saved is the destination
                                    conn_location_id
                                ))
                            
                except Exception as e:
                    logger.error(f"Error checking connected portal {whitelisted_portal_id}: {e}")

        # Handle removed connected portals - set their connected status to False
        removed_portal_connections = set(existing_portal_connections.keys()) - set(whitelisted_portal_ids)
        for removed_conn_id in removed_portal_connections:
            try:
                # Get the removed connected portal
                removed_portal = await portal_search.get_portal_by_id(removed_conn_id)
                if removed_portal:
                    removed_world_id = removed_portal.get('world_id')
                    removed_location_id = removed_portal.get('location_id')
                    removed_object_id = removed_portal.get('object_id')
                    removed_portal_type = removed_portal.get('portal_type')
                    removed_server_url = await get_world_server(removed_world_id)

                    if removed_portal_type == 'object':
                        removed_entity_id = removed_object_id
                    elif removed_portal_type == 'location':
                        removed_entity_id = removed_location_id
                    
                    # Create directory variable for consistency
                    removed_portal_type_directory = removed_portal_type + 's'
                    
                    if removed_server_url is None:
                        if removed_world_id not in worlds:
                            await get_world(removed_world_id)
                        # Same server - update directly

                        portal_type_directory = removed_portal_type_directory

                        if removed_entity_id in worlds[removed_world_id].get(portal_type_directory, {}):
                                    worlds[removed_world_id][portal_type_directory][removed_entity_id].setdefault('portals', {})
                                    worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals'].setdefault('outgoing', {})
                                    if removed_conn_id in worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing']:
                                        worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing'][removed_conn_id].setdefault('destinations', {})
                                        worlds[removed_world_id][portal_type_directory][removed_entity_id]['portals']['outgoing'][removed_conn_id]['destinations'][portal_id] = {'connected': False}
                                        logger.info(f"Updated connection for portal {removed_conn_id} after being removed from whitelist for incoming object portal {portal_id}")
                                        if removed_portal_type == 'object':
                                            asyncio.create_task(backup_object(removed_world_id, removed_entity_id))
                                        elif removed_portal_type == 'location':
                                            asyncio.create_task(backup_location(removed_world_id, removed_entity_id))
                    else:
                        # Different server - notify via HTTP
                        asyncio.create_task(notify_portal_disconnection(
                            removed_server_url,
                            removed_world_id,
                            removed_conn_id,
                            'outgoing',  # From removed portal's perspective, it's outgoing
                            removed_portal_type,
                            portal_id,  # Incoming portal being saved is the destination
                            removed_location_id
                        ))
            except Exception as e:
                logger.error(f"Error updating removed connected portal {removed_conn_id}: {e}")
                
        logger.info(f"Saved incoming portal {portal_id} with {len(whitelisted_portal_ids)} whitelisted portals")
        
    except Exception as e:
        logger.error(f"Error indexing portal {portal_id}: {e}")
    
    # Backup location
    asyncio.create_task(backup_object(world, object_id))
    
    # Return connection status for each connected portal
    connections = {}
    for whitelisted_portal_id in whitelisted_portal_ids:
        connections[whitelisted_portal_id] = worlds[world]['objects'][object_id]['portals']['incoming'][portal_id]['whitelisted_portals'][whitelisted_portal_id].get('connected', False)
    
    return {"success": True, "connections": connections, "portal_id": portal_id}

@router.post("/save-incoming-object-portal")
async def save_incoming_object_portal(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    portal_id = data['id']
    whitelisted_portals = data['whitelisted_portals']
    description = data.get('description', '')
    object_tag = data['object_tag']
    
    return await _save_incoming_object_portal(world, portal_id, whitelisted_portals, description, object_tag, user_id)

async def _save_outgoing_object_portal(world, portal_id, destinations, description, object_tag, user_id):
    # Get object ID and Location ID from tags
    object_id = worlds[world]['tags'].get(object_tag, object_tag)
    
    worlds[world]['objects'][object_id].setdefault('portals', {})
    worlds[world]['objects'][object_id]['portals'].setdefault('outgoing', {})
    worlds[world]['objects'][object_id]['portals']['outgoing'].setdefault(portal_id, {})
    
    # Save description and location ID
    worlds[world]['objects'][object_id]['portals']['outgoing'][portal_id]['description'] = description
    
    # Get existing destinations to preserve connected: True status
    existing_destinations = worlds[world]['objects'][object_id]['portals'].get('outgoing', {}).get(portal_id, {}).get('destinations', {})
    
    worlds[world]['objects'][object_id]['portals']['outgoing'][portal_id]['destinations'] = {}
    
    # Build destination dict with connection status
    destination_portal_ids = []
    for dest_portal_id in destinations:
        worlds[world]['objects'][object_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id] = {
            'connected': existing_destinations.get(dest_portal_id, {}).get('connected', False)
        }
        destination_portal_ids.append(dest_portal_id)
    
    # Reindex this portal with updated portal_list
    try:
        # Get world info
        world_info_str = worlds[world]['info']
        world_info = json.loads(world_info_str)
        world_creator_name = world_info.get('creator', 'Unknown')
        world_creator_id = world_info.get('creator_id', user_id)
        world_name = world_info.get('name', 'Unknown World')
        
        # Get portal creator
        portal_creator_id = user_id
        portal_creator_name = await s3_actions.get_username(portal_creator_id)
        
        # Check if world is public
        is_public = worlds[world].get('settings', {}).get('world_settings', {}).get('public', False)
        
        # Index with portal_list
        await portal_search.index_portal({
            "portal_id": portal_id,
            "world_id": world,
            "world_name": world_name,
            "world_creator_id": world_creator_id,
            "world_creator_name": world_creator_name,
            "creator_name": portal_creator_name,
            "object_id": object_id,
            "portal_direction": "outgoing",
            "portal_type": "object",
            "portal_list": destination_portal_ids,
            "is_public": is_public,
            "tags": []
        })
        
        # Check each destination to see if they have this portal in their portal_list
        for dest_portal_id in destination_portal_ids:
            # Only check if currently False
            if not worlds[world]['objects'][object_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id].get('connected', False):
                try:
                    # Get destination portal directly by ID
                    dest_portal = await portal_search.get_portal_by_id(dest_portal_id)
                    if dest_portal:
                        dest_portal_list = dest_portal.get('portal_list', [])
                        
                        # Change from False to True if found in destination's portal_list
                        if portal_id in dest_portal_list:
                            worlds[world]['objects'][object_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id]['connected'] = True
                            
                            # Update the destination portal about the connection
                            dest_world_id = dest_portal.get('world_id')
                            dest_location_id = dest_portal.get('location_id')
                            dest_object_id = dest_portal.get('object_id')
                            dest_portal_type = dest_portal.get('portal_type')
                            dest_server_url = await get_world_server(dest_world_id)
                            
                            if dest_portal_type == 'object':
                                dest_entity_id = dest_object_id
                            elif dest_portal_type == 'location':
                                dest_entity_id = dest_location_id

                            dest_portal_type_directory = dest_portal_type + 's'
                            
                            if dest_server_url is None: # Same server - update directly
                                logger.info(f"Trying to update portal connection on same server for portal {dest_portal_id} after being added to whitelist for outgoing portal {portal_id}")
                                if dest_world_id not in worlds:
                                    await get_world(dest_world_id)
                                if dest_world_id in worlds and dest_entity_id in worlds[dest_world_id].get(dest_portal_type_directory, {}):
                                    worlds[dest_world_id][dest_portal_type_directory][dest_entity_id].setdefault('portals', {})
                                    worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals'].setdefault('incoming', {})
                                    if dest_portal_id in worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals']['incoming']:
                                        worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals']['incoming'][dest_portal_id].setdefault('whitelisted_portals', {})
                                        worlds[dest_world_id][dest_portal_type_directory][dest_entity_id]['portals']['incoming'][dest_portal_id]['whitelisted_portals'][portal_id] = {'connected': True}
                                        logger.info(f"Updated portal connection on same server for portal {dest_portal_id} after being added to whitelist for outgoing portal {portal_id}")
                                        if dest_portal_type == 'object':
                                            asyncio.create_task(backup_object(dest_world_id, dest_entity_id))
                                        else:
                                            asyncio.create_task(backup_location(dest_world_id, dest_entity_id))
                                    else:
                                        logger.warning(f"entity {dest_entity_id} not found in world {dest_world_id} in directory {dest_portal_type_directory} or world not found")
                            else:
                                # Different server - notify via HTTP
                                asyncio.create_task(notify_portal_connection(
                                    dest_server_url,
                                    dest_world_id,
                                    dest_portal_id,
                                    'incoming',  # From destination's perspective, it's incoming
                                    dest_portal_type,  # Portal type
                                    portal_id,  # Our portal is the one connecting to it
                                    dest_entity_id
                                ))
                            
                except Exception as e:
                    logger.error(f"Error checking destination portal {dest_portal_id}: {e}")
        
        # Handle removed destinations - set their connected status to False
        removed_destinations = set(existing_destinations.keys()) - set(destination_portal_ids)
        for removed_dest_id in removed_destinations:
            try:
                # Get the removed destination portal
                removed_portal = await portal_search.get_portal_by_id(removed_dest_id)
                if removed_portal:
                    removed_world_id = removed_portal.get('world_id')
                    removed_location_id = removed_portal.get('location_id')
                    removed_object_id = removed_portal.get('object_id')
                    removed_portal_type = removed_portal.get('portal_type')
                    removed_server_url = await get_world_server(removed_world_id)
                    
                    if removed_portal_type == 'object':
                        removed_entity_id = removed_object_id
                    elif removed_portal_type == 'location':
                        removed_entity_id = removed_location_id
                    
                    # Create directory variable for consistency
                    removed_portal_type_directory = removed_portal_type + 's'
                    
                    if removed_server_url is None:
                        # Same server - update directly
                        if removed_world_id not in worlds:
                            await get_world(removed_world_id)
                        if removed_entity_id in worlds[removed_world_id].get(removed_portal_type_directory, {}):
                            if removed_dest_id in worlds[removed_world_id][removed_portal_type_directory][removed_entity_id].get('portals', {}).get('incoming', {}):
                                if portal_id in worlds[removed_world_id][removed_portal_type_directory][removed_entity_id]['portals']['incoming'][removed_dest_id].get('whitelisted_portals', {}):
                                    worlds[removed_world_id][removed_portal_type_directory][removed_entity_id]['portals']['incoming'][removed_dest_id]['whitelisted_portals'][portal_id]['connected'] = False
                                    logger.info(f"Updated connection for portal on same server after portal {removed_dest_id} was removed from whitelist - set connection for portal {portal_id} to False")
                                    if removed_portal_type == 'object':
                                        asyncio.create_task(backup_object(removed_world_id, removed_entity_id))
                                    else:
                                        asyncio.create_task(backup_location(removed_world_id, removed_entity_id))
                    else:
                        # Different server - notify via HTTP
                        asyncio.create_task(notify_portal_disconnection(
                            removed_server_url,
                            removed_world_id,
                            removed_dest_id,
                            'incoming',  # From removed portal's perspective, it's incoming
                            removed_portal_type,  # Portal type
                            portal_id,  # Our portal was connecting to it
                            removed_entity_id
                        ))
            except Exception as e:
                logger.error(f"Error updating removed destination portal {removed_dest_id}: {e}")
                
        logger.info(f"Saved outgoing object portal {portal_id} with {len(destination_portal_ids)} destinations")
        
    except Exception as e:
        logger.error(f"Error indexing portal {portal_id}: {e}")
    
    # Backup object
    asyncio.create_task(backup_object(world, object_id))
    
    # Return connection status for each destination
    connections = {}
    for dest_portal_id in destination_portal_ids:
        connections[dest_portal_id] = worlds[world]['objects'][object_id]['portals']['outgoing'][portal_id]['destinations'][dest_portal_id].get('connected', False)
    
    return {"success": True, "connections": connections, "portal_id": portal_id}

@router.post("/save-outgoing-object-portal")
async def save_outgoing_object_portal(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    portal_id = data['id']
    destinations = data['destinations']
    description = data.get('description', '')
    object_tag = data['object_tag']

    if not str(description).strip():
        raise HTTPException(status_code=422, detail="Outgoing portals require activation description.")

    return await _save_outgoing_object_portal(world, portal_id, destinations, description, object_tag, user_id)

@router.post("/get-portal-details")
async def get_portal_details(request: Request, user_id=Depends(authenticate)):
    """Get portal info by ID from Elasticsearch"""
    data = await request.json()
    portal_id = data.get("portal_id")
    
    try:
        # Get portal from Elasticsearch
        portal_info = await portal_search.get_portal_by_id(portal_id)
        if portal_info:
            portal_direction = portal_info.get('portal_direction')
            portal_type = portal_info.get('portal_type')
            return {
                "portal_id": portal_id,
                "name": None,
                "world_id": portal_info.get('world_id'),
                "portal_direction": portal_direction,
                "portal_type": portal_type,
                "exists": True
            }
        else:
            return {
                "portal_id": portal_id,
                "name": None,
                "world_id": None,
                "exists": False
            }
    except Exception as e:
        logger.error(f"Error fetching portal info for {portal_id}: {e}")
        return {
            "portal_id": portal_id,
            "name": f"Portal {portal_id[:8]}...",
            "world_id": None,
            "exists": False
        }

@router.post("/delete-location-portal")
async def delete_portal(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    portal_id = data['id']
    location_tag = data['location_tag']
    portal_direction = data.get('portal_direction')

    location_id = worlds[world]['tags'].get(location_tag, location_tag)
    
    # Delete from world portals registry
    if portal_id in worlds[world]['portals']:
        del worlds[world]['portals'][portal_id]
    
    # Delete from location's portal list
    if 'portals' in worlds[world]['locations'][location_id] and portal_direction in worlds[world]['locations'][location_id]['portals']:
        if portal_id in worlds[world]['locations'][location_id]['portals'][portal_direction]:
            del worlds[world]['locations'][location_id]['portals'][portal_direction][portal_id]
    
    # Unindex portal from Elasticsearch
    await portal_search.delete_portal(portal_id)
    
    await backup_location(world, location_id)
    
    return {"success": True, "message": f"Portal {portal_id} deleted successfully"}

@router.post("/delete-object-portal")
async def delete_object_portal(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world_id = data['world']
    portal_id = data['id']
    object_tag = data['object_tag']
    portal_direction = data.get('portal_direction')

    object_id = worlds[world_id]['tags'].get(object_tag, object_tag)

    if portal_id in worlds[world_id]['portals']:
        worlds[world_id]['portals'].pop(portal_id)

    if 'portals' in worlds[world_id]['objects'][object_id] and portal_direction in worlds[world_id]['objects'][object_id]['portals']:
        if portal_id in worlds[world_id]['objects'][object_id]['portals'][portal_direction]:
            del worlds[world_id]['objects'][object_id]['portals'][portal_direction][portal_id]
    else:
        logger.warning(f"Portal {portal_id} not found in object {object_id} portals")

    await portal_search.delete_portal(portal_id)

    asyncio.create_task(backup_portals_directory(world_id))

    return {"success": True, "message": f"Portal {portal_id} deleted successfully"}
    

async def cleanup_object_portal_leaving_world(world_id: str, portal_id: str):
    worlds[world_id]['portals'].pop(portal_id)


async def update_object_portal_world(depart_world_id: str, dest_world_id: str, object_id: str):
    # if they are holding object with portal reindex them with this function?
    #call from receive character on new server
    #called once for incoming portal on object and once for outgoing portal on object
    try:
        if depart_world_id not in worlds:
            await get_world(depart_world_id)
        if depart_portal_id not in worlds[depart_world_id]['portals']:
            error_msg = f"Portal {portal_id} not found in world registry"
            logger.warning(error_msg)
            raise ValueError(error_msg)
        
        portal_info = worlds[depart_world_id]['portals'][portal_id]

        portal_type = portal_info.get('portal_type')
        portal_direction = portal_info.get('portal_direction')
        #object_id = portal_info.get('object_id')
        user_id = portal_info.get('creator_id')
        
        # Verify this is an object portal
        if portal_type != 'object':
            error_msg = f"Portal {portal_id} is not an object portal (type: {portal_type})"
            logger.warning(error_msg)
            raise ValueError(error_msg)
        
        if not object_id:
            error_msg = f"Portal {portal_id} has no object_id"
            logger.warning(error_msg)
            raise ValueError(error_msg)

        worlds[dest_world_id]['portals'][portal_id] = {}
        worlds[world_id]['portals'][portal_id]['id'] = portal_id
        worlds[world_id]['portals'][portal_id]['portal_direction'] = portal_direction  # 'incoming' or 'outgoing'
        worlds[world_id]['portals'][portal_id]['portal_type'] = portal_type
        worlds[world_id]['portals'][portal_id]['creator_id'] = user_id
        worlds[world_id]['portals'][portal_id]['object_id'] = object_id
        
        # Get existing portal data from the object
        if object_id not in worlds[world_id]['objects']:
            error_msg = f"Object {object_id} not found"
            logger.warning(error_msg)
            raise ValueError(error_msg)
        
        object_portals = worlds[world_id]['objects'][object_id].get('portals', {})
        direction_portals = object_portals.get(portal_direction, {})
        
        if portal_id not in direction_portals:
            error_msg = f"Portal {portal_id} not found in object {object_id}"
            logger.warning(error_msg)
            raise ValueError(error_msg)
        
        # Get existing portal data to preserve connections
        existing_portal_data = direction_portals[portal_id]
        description = existing_portal_data.get('description', '')
        
        # Call the appropriate helper function to reindex and update
        if portal_direction == 'incoming':
            # Get existing whitelisted portals
            whitelisted_portals = list(existing_portal_data.get('whitelisted_portals', {}).keys())
            
            result = await _save_incoming_object_portal(
                world=world_id,
                portal_id=portal_id,
                whitelisted_portals_received=whitelisted_portals,
                description=description,
                object_tag=object_id,  # Pass object_id directly as it's already an ID
                user_id=user_id
            )
        elif portal_direction == 'outgoing':
            # Get existing destinations
            destinations = list(existing_portal_data.get('destinations', {}).keys())
            
            result = await _save_outgoing_object_portal(
                world=world_id,
                portal_id=portal_id,
                destinations=destinations,
                description=description,
                object_tag=object_id,  # Pass object_id directly as it's already an ID
                user_id=user_id
            )
        else:
            error_msg = f"Invalid portal direction: {portal_direction}"
            logger.warning(error_msg)
            raise ValueError(error_msg)
        
        logger.info(f"Updated object portal {portal_id} world to {world_id}")
        return
    
    except (ValueError, KeyError) as e:
        # Re-raise validation errors without logging (already logged above)
        raise
    except Exception as e:
        # Log unexpected errors with full traceback
        logger.error(f"Unexpected error updating object portal location for portal {portal_id}: {e}", exc_info=True)
        raise

async def backup_portals_directory(world_id: str):
    prefix = f"worlds/{world_id}/portals/"
    asyncio.create_task(s3_actions.replace_nested_dict(BUCKET, prefix, worlds[world_id]['portals']))


@router.post("/portals/search")
async def search_portals_endpoint(request: Request, user_id=Depends(authenticate)):
    """Search for portals using Elasticsearch"""
    data = await request.json()
    query = data.get('query', '')
    limit = data.get('limit', 50)
    portal_direction = data.get('portal_direction', None)  # Optional: 'incoming', 'outgoing', or None for all
    portal_type = data.get('portal_type', None)  # Optional: 'location', 'object', or None for all
    
    # Perform search
    results = await portal_search.search_portals(query, user_id, limit, portal_direction, portal_type)
    return results

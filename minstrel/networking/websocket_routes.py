from fastapi import WebSocket, WebSocketDisconnect
import json
from .websocket_manager import websocket_manager as wsm
from world import world_management
from world import world_response
from chat import chat_response
from .note_websocket_routes import route_note_message
from storage.data_store import worlds, chats
import logging

logger = logging.getLogger()

async def route_message(websocket: WebSocket, data):
    #data = json.loads(data)
    content = data["content"]
    channel = data.get("channel", None)
    
    user_id = wsm.get_user_id(websocket)

    if channel == 'adventure':
        if data['route'] == 'heartbeat':
            world = wsm.get_world_id(websocket)
            character_id = wsm.get_character_id(websocket)
            room_id = wsm.get_room_id(websocket, "adventure")
            await handle_heartbeat(websocket, world, user_id, character_id, room_id)
            
        elif data['route'] == 'retrieve earlier messages':
            index = data["content"]["index"]

            print("route retrieve ealier, index: ", index)
            room_id = wsm.get_room_id(websocket, "adventure")
            await world_response.serve_extended_conversation(websocket, room_id, index)

        elif data['route'] == 'message':
            print(content)
            character_id = wsm.get_character_id(websocket)
            room_id = wsm.get_room_id(websocket, "adventure")
            await world_response.handle_world_response(websocket=websocket, user_id=user_id, room_id=room_id, character_id=character_id, content=content)

        elif data['route'] == 'leave party':
            world = wsm.get_world_id(websocket)
            room_id = wsm.get_room_id(websocket, "adventure")
            await world_management.leave_party(world, room_id, user_id)

        elif data['route'] =='get world chat':
            room_id = wsm.get_room_id(websocket, "adventure")
            world_response.get_world_chat(websocket, room_id)

        elif data['route'] == 'get party id':
            await get_party_id(websocket)

        elif data['route'] == 'check friend':
            target_user_id = content.get('user_id')
            await check_friend_status(websocket, target_user_id)

        elif data['route'] == "adventure connect":
            user_id = wsm.get_user_id(websocket)
            world_id = content.get("world")
            character_id = content.get("character")

            if world_id not in worlds:
                logging.info(f"World {world} not found in memory when connecting to adventure. Getting world...")
                await world_management.get_world(world_id)

            wsm.initialize_adventure_module(websocket, user_id, world_id, character_id)
            room_id = wsm.get_room_id(websocket, "adventure")
            
            await world_management.add_room_connection(websocket, world_id, room_id, user_id, character_id)

            await world_response.serve_conversation(websocket, world_id, room_id)

    if channel == "chat":
        if data['route'] == 'retrieve earlier messages':
            index = data["content"]["index"]
            room_id = wsm.get_room_id(websocket, "chat")
            await chat_response.serve_extended_conversation(websocket, room_id)
        
        elif data['route'] == 'chat connect':
            room_id = data.get("room_id")
            #wsm.initialize_chat_module()
            #add room connection
            #serve conversation

    if channel == 'notes':
        await route_note_message(websocket, data)



async def join_room(websocket: WebSocket, data):
    pass

async def get_party_id(websocket: WebSocket):
    """Get the party ID (room_id) for the players character"""
    try:
        world_id = wsm.get_world_id(websocket)
        party_id = wsm.get_room_id(websocket, "adventure")
            
        response = {
            'channel': 'conversation',
            'route': 'party id response',
            'content': {
                'party_id': party_id
            }
        }
        await wsm.send(message=response, websocket=websocket)

    except Exception as e:
        print(f"Error getting party ID: {e}")

async def check_friend_status(websocket: WebSocket, target_user_id: str = None):
    """Check if a target user is a friend of the current user"""
    try:
        current_user_id = wsm.get_user_id(websocket)
        
        is_friend = False

        response = {
            'channel': 'conversation',
            'route': 'friend status response',
            'content': {
                'is_friend': is_friend,
                'target_user_id': target_user_id
            }
        }
        await wsm.send(message=response, websocket=websocket)
    except Exception as e:
        print(f"Error checking friend status: {e}")

async def handle_heartbeat(websocket: WebSocket, world_id: str, user_id: str, character_id: str, room_id: str):
    """Handle activity heartbeat from client"""
    
    try:
        #update_user_activity_in_world(world_id, user_id, character_id, room_id)
        pass
    except Exception as e:
        print(f"Error handling heartbeat: {e}")

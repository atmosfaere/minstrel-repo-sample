from fastapi import WebSocket, WebSocketDisconnect
import json
from .websocket_manager import websocket_manager as wsm
from world.world_management import leave_party
from world import world_response
from world.world_response import handle_world_response, get_world_chat
from chat import chat_response

async def route_message(websocket: WebSocket, data):
    #data = json.loads(data)
    mode = wsm.get_mode(websocket)
    content = data["content"]
    user_id = wsm.get_user_id(websocket)
    room_id = wsm.get_room_id(websocket)

    if data['route'] == 'heartbeat':
        if mode == "world":
            world = wsm.get_world(websocket)
            character_id = wsm.get_character_id(websocket)
            await handle_heartbeat(websocket, world, user_id, character_id, room_id)
        
    elif data['route'] == 'retrieve earlier messages':
        if mode == "world":
            index = data["content"]["index"]
            print("route retrieve ealier, index: ", index)
            await world_response.serve_extended_conversation(websocket, room_id, index)
        elif mode == "chat":
            await chat_response.serve_extended_conversation()
    elif data['route'] == 'message':
        if mode == "world":
            print(content)
            character_id = wsm.get_character_id(websocket)
            await handle_world_response(websocket=websocket, user_id=user_id, room_id=room_id, character_id=character_id, content=content)

    elif data['route'] == 'leave party':
        world = wsm.get_world(websocket)
        await leave_party(world, room_id, user_id)

    elif data['route'] =='get world chat':
        #need to create separate chat room for party
        get_world_chat(websocket, room_id)

    elif data['route'] == 'get party id':
        await get_party_id(websocket)

    elif data['route'] == 'check friend':
        target_user_id = content.get('user_id')
        await check_friend_status(websocket, target_user_id)
            

        # await websocket.send_text(f"Chat: {message['content']}")
        #await wsm.send("message", websocket=websocket)



async def join_room(websocket: WebSocket, data):
    pass

async def get_party_id(websocket: WebSocket):
    """Get the party ID (room_id) for the players character"""
    try:
        world = wsm.get_world(websocket)
        party_id = wsm.get_room_id(websocket)
            
        response = {
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

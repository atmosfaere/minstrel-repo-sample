import logging

from fastapi import APIRouter, Depends, Request
from storage.data_store import chats

router = APIRouter()
logger = logging.getLogger(__name__)

def add_to_room(websocket, room_id):
    #creates room if it isn't present
    room = chats.setdefault(room_id, {'currently_streaming': False, 'connections': []})
    room['connections'].append(websocket)

def remove_connection(websocket, room_id):
    if room_id in chats:
        connections = chats[room_id]['connections']
        if websocket in connections:
            connections.remove(websocket)
            logging.info(f"Removed websocket from room {room_id} in chat {room_id}.")
        else:
            logging.error(f"Websocket not found in chat room {room_id} connections while removing connection")
    else:
        logging.error(f"Room {room_id} not found in chats dict while removing connection")

import logging
import asyncio
import json
from starlette.websockets import WebSocketState

from storage.data_store import worlds, chats
from world import world_utils
from chat import chat_management

logger = logging.getLogger(__name__)
class WebSocketManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, user_id, websocket):
        self.active_connections.setdefault(websocket, {})
        self.active_connections[websocket]['user_id'] = user_id
        self.active_connections[websocket].setdefault('active_modules', [])

    async def disconnect(self, websocket):
        # Remove from room connections first (before closing websocket)
        if websocket in self.active_connections:
            if "adventure" in self.active_connections[websocket]['active_modules']:
                world_utils.handle_websocket_disconnect(websocket, self.get_world_id(websocket), self.get_room_id(websocket, "adventure"), self.get_user_id(websocket))
            if "chat" in self.active_connections[websocket]['active_modules']:
                chat_management.remove_connection(websocket, self.get_room_id(websocket, "chat"))

            if websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await websocket.close(code=1000)  # Standard 'normal closure' code
                except Exception as e:
                    logger.debug(f"Error closing websocket (may already be closed): {e}")
            
            del self.active_connections[websocket]


    async def send(self, message, websocket):
        try:
            json_message = json.dumps(message)
            await websocket.send_text(json_message)
        except Exception as e:
            logger.info(f"Error sending message to websocket {websocket}: {e}")

            if websocket in self.active_connections:
                if "adventure" in self.active_connections[websocket]['active_modules']:
                    world_utils.handle_websocket_disconnect(websocket, self.get_world_id(websocket), self.get_room_id(websocket, "adventure"), self.get_user_id(websocket))
                if "chat" in self.active_connections[websocket]['active_modules']:
                    chat_management.remove_connection(websocket, self.get_room_id(websocket, "chat"), self.get_user_id(websocket))
                del self.active_connections[websocket]

    async def send_room(self, message, websockets):
        tasks = [self.send(message, websocket) for websocket in websockets]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.info(f"Failed to send room message to websocket : {result}")

    def get_user_id(self, websocket):
        return self.active_connections.get(websocket, {}).get('user_id', None)

    def get_world_id(self, websocket):
        return self.active_connections.get(websocket, {}).get('world_id', None)

    def get_character_id(self, websocket):
        return self.active_connections.get(websocket, {}).get('character_id', None)


    def get_room_id(self, websocket, module):
        """Room ID changes when player leaves/joins parties. Don't store unless plan on setting it when it changes using list of connections in room"""
        if module == "adventure":
            world = self.get_world_id(websocket)
            user_id = self.get_user_id(websocket)
            character = self.get_character_id(websocket)
            #room_id must be stored with character, as it changes as character joins and leaves parties,
            #and player may have multiple playable characters on a world at once
            if world not in worlds:
                raise ValueError(f"World '{world}' is not loaded on server while trying to get room_id of websocket")
            else:
                if user_id not in worlds[world]['users']:
                    raise ValueError(f"User '{user_id}' not found in world '{world}' while trying to get room_id")
                if character not in worlds[world]['users'][user_id]['characters']:
                    raise ValueError(f"Character '{character}' not found for user '{user_id}' in world '{world}' while trying to get room_id")
                room_id = worlds[world]['users'][user_id]['characters'][character]['room_id']
                return room_id
        elif module == "simulation":
            world = self.get_world_id(websocket)
            character = self.get_character_id(websocket)
            room_id = worlds[world]['simulated_characters'][character]['room_id']
            return room_id
        elif module == "chat":
            user_id = self.get_user_id(websocket)
            chat = self.get_chat(websocket)
            room_id = chats[chat]['users'][user_id]['room_id']
            return room_id

    def set_world_id(self, websocket, world_id):
        self.active_connections[websocket]['world_id'] = world_id

    def initialize_adventure_module(self, websocket, user_id, world_id, character_id):
        self.active_connections.setdefault(websocket, {})
        self.active_connections[websocket]['user_id'] = user_id
        self.active_connections[websocket]['world_id'] = world_id
        self.active_connections[websocket]['character_id'] = character_id
        
        self.active_connections[websocket].setdefault('active_modules', [])
        if "adventure" not in self.active_connections[websocket]['active_modules']:
            self.active_connections[websocket]['active_modules'].append("adventure")

websocket_manager = WebSocketManager()
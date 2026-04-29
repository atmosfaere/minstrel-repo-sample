import logging
import asyncio
import json
from starlette.websockets import WebSocketState

from data_store import worlds, chats
import world_utils
import chat_management

logger = logging.getLogger(__name__)
class WebSocketManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, user_id, websocket, mode=None, world=None, character_id=None):
        #await websocket.accept()
        self.active_connections[websocket] = \
            {'user_id': user_id, 'mode': mode, 'world': world, 'character_id': character_id}

    async def disconnect(self, websocket):
        # Remove from room connections first (before closing websocket)
        if websocket in self.active_connections:
            if self.get_mode(websocket) == "world":
                world_utils.handle_websocket_disconnect(websocket, self.get_world(websocket), self.get_room_id(websocket), self.get_user_id(websocket))
            elif self.get_mode(websocket) == "chat":
                chat_management.remove_connection(websocket, self.get_room_id(websocket))

            if websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await websocket.close(code=1000)  # Standard 'normal closure' code
                except Exception as e:
                    logger.debug(f"Error closing websocket (may already be closed): {e}")
            
            del self.active_connections[websocket]


    async def send(self, message, websocket):
        """
        # Check if websocket is still connected before trying to send
        if websocket.client_state != WebSocketState.CONNECTED:
            logger.debug(f"Cannot send message to disconnected websocket")
            # Clean up the connection if it's not already cleaned up
            if websocket in self.active_connections:
                await self.disconnect(websocket)
            return"""
            
        try:
            json_message = json.dumps(message)
            await websocket.send_text(json_message)
        except Exception as e:
            logger.info(f"Error sending message to websocket {websocket}: {e}")
            # Don't call disconnect recursively, just clean up
            if websocket in self.active_connections:
                if self.get_mode(websocket) == "world":
                    world_utils.handle_websocket_disconnect(websocket, self.get_room_id(websocket))
                elif self.get_mode(websocket) == "chat":
                    chat_management.remove_connection(websocket, self.get_world(websocket), self.get_room_id(websocket), self.get_user_id(websocket))
                del self.active_connections[websocket]

    async def send_room(self, message, websockets):
        tasks = [self.send(message, websocket) for websocket in websockets]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.info(f"Failed to send room message to websocket : {result}")

    def get_mode(self, websocket):
        return self.active_connections.get(websocket, {}).get('mode', None)

    def get_user_id(self, websocket):
        return self.active_connections.get(websocket, {}).get('user_id', None)

    def get_world(self, websocket):
        return self.active_connections.get(websocket, {}).get('world', None)

    def get_character_id(self, websocket):
        return self.active_connections.get(websocket, {}).get('character_id', None)

    def get_room_id(self, websocket):
        """Room ID changes when player leaves/joins parties. Don't store unless plan on setting it when it changes using list of connections in room"""
        if self.get_mode(websocket) == "world":
            world = self.get_world(websocket)
            user_id = self.get_user_id(websocket)
            character = self.get_character_id(websocket)
            #room_id must be stored with character, as it changes as character joins and leaves parties,
            #and player may have multiple playable characters on a world at once
            if world not in worlds:
                raise ValueError(f"World '{world}' is not loaded on server while trying to get room_id of websocket")
            else:
                """
                # Check if character exists in the world data
                if user_id not in worlds[world]['users']:
                    raise ValueError(f"User '{user_id}' not found in world '{world}' while trying to get room_id")
                if character not in worlds[world]['users'][user_id]['characters']:
                    raise ValueError(f"Character '{character}' not found for user '{user_id}' in world '{world}' while trying to get room_id")
                    """
                room_id = worlds[world]['users'][user_id]['characters'][character]['room_id']
                return room_id
        elif self.get_mode(websocket) == "simulation":
            world = self.get_world(websocket)
            character = self.get_character_id(websocket)
            room_id = worlds[world]['simulated_characters'][character]['room_id']
            return room_id
        elif self.get_mode(websocket) == "chat":
            return self.active_connections.get(websocket, {}).get('room_id', None)

    def set_world_id(self, websocket, world_id):
        self.active_connections[websocket]['world'] = world_id


    #prefer to iterate over room['connections'] find connections of user
    #can use wsm.get_user_id(websocket) on each websocket to find connections belonging to user
    '''
    def get_websockets_from_user_id(self, user_id):
        websockets = []
        for websocket in self.active_connections:
            if self.active_connections[websocket][user_id] == user_id:
                websockets.append(websocket)

        return websockets'''



    """    async def send_room(self, message, websockets):
        tasks = [self.send(message, websocket) for websocket in websockets]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                #logger.info(f"Failed to send room message to websocket : {result}")
                pass"""
    #updated to automatically get room connections but more memory access
    '''    async def send_room(self, message, websocket):
        websockets = None
        if self.get_mode(websocket) == "world":
            world = self.get_world(websocket)
            room = worlds[world]['rooms'][self.get_room_id(websocket)]
            websockets = room['connections']

        elif self.get_mode(websocket) == "chat":
            room_id = self.get_room_id(websocket)
            websockets = chats[room_id]['connections']

        tasks = [self.send(message, websocket) for websocket in websockets]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                #logger.info(f"Failed to send room message to websocket : {result}")
                pass
'''


    '''
        async def broadcast(self, message):
            for connection in self.active_connections.keys():
                await connection.send_text(message)'''

websocket_manager = WebSocketManager()
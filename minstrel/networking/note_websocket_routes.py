from fastapi import WebSocket, WebSocketDisconnect
from .websocket_manager import websocket_manager as wsm
from note import edit_text_note, fetch_note

async def route_note_message(websocket: WebSocket, data):
    content = data["content"]
    
    user_id = wsm.get_user_id(websocket)

    if data['route'] == 'edit note':
        if content['type'] == 'text':
            edit_text_note(websocket, user_id, content)

    if data['route'] == 'fetch note':
        fetch_note(websocket, user_id, content)

    if data['route'] == 'sync notes':
        pass

    if data['route'] == 'delete note':
        pass
from fastapi import WebSocket, WebSocketDisconnect
from .websocket_manager import websocket_manager as wsm
from note import save_text_note

async def route_note_message(websocket: WebSocket, data):
    content = data["content"]
    channel = data.get("channel", None)
    
    user_id = wsm.get_user_id(websocket)

    if data['route'] == 'save note':
        if content['type'] == 'text':
            save_text_note(user_id, content)

    if data['route'] == 'sync notes':
        pass

    if data['route'] == 'delete note':
        pass
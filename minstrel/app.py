import sys, os
import logging
import time
from logging.handlers import RotatingFileHandler
from fastapi import FastAPI, Request, Response, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import WS_1008_POLICY_VIOLATION
from contextlib import asynccontextmanager
import asyncio
import secrets
import json
import requests

# Rate limiting imports
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from datetime import datetime, timedelta, timezone
#from web_searcher import websearch, fetch_pages
#from json_extractor import extract_broken_json
from world import world_response
from world import world_management
from world.world_management import get_world, router as world_management_router
from portal.portal_management import router as portal_management_router
from world.world_index import router as world_index_router
from world.world_utils import router as world_utils_router
from chat import chat_management
from chat import chat_response
from world import event_processing
from storage.data_store import users, worlds, chats
from storage import s3_actions
from networking.websocket_routes import route_message
from networking.websocket_manager import websocket_manager
#from adventure_endpoints import adventure_router
from aiohttp import ClientResponseError
import traceback

from networking.http_client import http_client
from auth.auth_client import authenticate
from auth.login_registration import router as sign_in_router
from search.world_search_elasticsearch import world_search
from search.portal_search_elasticsearch import portal_search

import importlib.util, sys, os

def _register_sibling_package(name):
    """Import a sibling repo package by path without adding repo root to sys.path."""
    pkg_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', name))
    spec = importlib.util.spec_from_file_location(
        name,
        os.path.join(pkg_dir, '__init__.py'),
        submodule_search_locations=[pkg_dir]  # enables submodule imports (notes.router etc.)
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)

_register_sibling_package('notes')
from notes.router import router as notes_router


# Configure logging only if not already configured by uvicorn
# This prevents conflicts during hot reloads
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.DEBUG,  # Consider setting this to logging.INFO in production
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

# Add file handler if not already present
logger = logging.getLogger()
if not any(isinstance(h, RotatingFileHandler) for h in logger.handlers):
    log_file_handler = RotatingFileHandler(
        'app.log',
        mode='a',
        maxBytes=40*1024*1024,
        backupCount=5,
        encoding='utf-8', delay=False
    )
    log_file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(log_file_handler)

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        def generate_csp_nonce():
            return secrets.token_urlsafe(16)

        nonce = generate_csp_nonce()
        request.state.nonce = nonce
        response = await call_next(request)

        #forces https
        #response.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        #temporary disable, stops inline scripts and styles
        #response.headers['Content-Security-Policy'] = "default-src 'self';"
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' https://accounts.google.com https://appleid.cdn-apple.com; "
            f"style-src 'self' 'nonce-{nonce}' https://accounts.google.com 'sha256-f4HQaD+NpkjxARuDdQGRxOo2ppAliUcSVMnYbNcYEJ0='; "
            "frame-src 'self' https://accounts.google.com https://appleid.apple.com; "
            "connect-src 'self' https://accounts.google.com https://appleid.cdn-apple.com; "
            "img-src 'self' https://appleid.cdn-apple.com https://minstrel-images.s3.us-west-1.amazonaws.com/icons;")
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        #response.headers['Permissions-Policy'] = 'geolocation=(self)'
        return response

#ALLOWED_ORIGINS = ["https://minstrelai.com"]
ALLOWED_ORIGINS = ["https://minstrelai.com", "http://127.0.0.1:5004"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await http_client.start_session()
    await world_search.initialize()
    await portal_search.initialize()

    asyncio.create_task(event_processing.process_events())
    #asyncio.create_task(event_processing.check_world_activity())
    yield
    # Shutdown
    # Backup all worlds before shutting down
    if worlds:
        logging.info(f"Backing up {len(worlds)} worlds before shutdown...")
        backup_tasks = []
        for world_id in worlds.keys():
            if world_id != 'failed_to_unload':  # Skip the special key
                backup_tasks.append(world_management.backup_world_s3(world_id))
        
        if backup_tasks:
            try:
                await asyncio.gather(*backup_tasks)
                logging.info("All worlds backed up successfully")
            except Exception as e:
                logging.error(f"Error backing up worlds during shutdown: {e}")
    
    await http_client.close_session()

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

app.add_middleware(SecurityHeadersMiddleware)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


_NOTES_STATIC = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'notes', 'static'))
app.mount("/static/notes", StaticFiles(directory=_NOTES_STATIC), name="notes-static")

@app.get("/static/{file_path:path}")
@limiter.limit("60/minute")
async def serve_static_files(request: Request, file_path: str):
    """Rate-limited static file serving"""
    static_path = os.path.join("static", file_path)
    if os.path.exists(static_path) and os.path.isfile(static_path):
        response = FileResponse(static_path)
        
        # Add cache control headers for .js, .css files
        if file_path.endswith(('.js', '.css')):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response
    else:
        raise HTTPException(status_code=404, detail="File not found")

# Keep the mount for url_for to work, but rate-limited route above takes precedence
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

#aiohttp session
#app.session = ClientSession()

app.include_router(sign_in_router)
app.include_router(world_management_router)
app.include_router(portal_management_router)
app.include_router(world_index_router)
app.include_router(world_utils_router)
app.include_router(notes_router)
"""
app.include_router(adventure_router)
app.include_router(chat_router)
app.include_router(image_gen_router)
"""

#sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=['https://minstrelai.com'])
#socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

@app.get("/manifest.json")
async def manifest():
    return FileResponse("manifest.json", media_type="application/manifest+json")


@app.get("/service-worker.js")
async def service_worker():
    return FileResponse("service-worker.js", media_type="application/javascript")


@app.get("/robots.txt")
async def robots_txt():
    return FileResponse("robots.txt", media_type="text/plain")


@app.get("/sitemap.xml")
async def sitemap_xml():
    return FileResponse("sitemap.xml", media_type="application/xml")


@app.get("/")
@limiter.limit("30/minute")
async def home(request: Request, response: Response):

    nonce = request.state.nonce
    timestamp = int(time.time())
    template_response = templates.TemplateResponse("index.html", {"request": request, "nonce": nonce, "timestamp": timestamp})
    
    # Add cache control headers for HTML files
    template_response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    template_response.headers["Pragma"] = "no-cache"
    template_response.headers["Expires"] = "0"
    
    return template_response

@app.get("/world-invite")
@limiter.limit("20/minute")
def invite_page(request: Request):
    nonce = request.state.nonce
    timestamp = int(time.time())
    # Return the same index.html to let the SPA handle the route
    template_response = templates.TemplateResponse("index.html", {"request": request, "nonce": nonce, "timestamp": timestamp})
    
    # Add cache control headers for HTML files
    template_response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    template_response.headers["Pragma"] = "no-cache"
    template_response.headers["Expires"] = "0"
    
    return template_response


async def authenticate_websocket(websocket: WebSocket):
    #'''
    cookie_header = "; ".join([f"{key}={value}" for key, value in websocket.cookies.items()])
    headers = {"Cookie": cookie_header}
    try:
        # Get the base URL from environment variable or build from websocket
        if 'AUTH_SERVER_URL' in os.environ:
            verify_url = os.getenv('AUTH_SERVER_URL') + '/verify'
        else:
            # Build URL from the websocket connection
            scheme = 'https' if websocket.url.scheme == 'wss' else 'http'
            host = websocket.headers.get('host', websocket.url.hostname)
            #if websocket.url.port and websocket.url.port not in [80, 443]:
                #host = f"{host}:{websocket.url.port}"
            verify_url = f"{scheme}://{host}/verify"
        
        auth_data = await http_client.post(verify_url, headers=headers)
        user_id = auth_data.get('user_id')

        if user_id is None:
            raise HTTPException(status_code=403, detail="Websocket authentication failed: No user_id in auth_response")
        return user_id
    except ClientResponseError as e:
        logging.info("Websocket authentication failed")
        raise HTTPException(status_code=e.status, detail="Websocket authentication failed")
#'''
    #user_id = "jake"
    return user_id

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    #if "origin" in request.headers and request.headers["origin"] in ALLOWED_ORIGINS:
    try:
        user_id = await authenticate_websocket(websocket)

        await websocket.accept()
        connect_data = await websocket.receive_json()

        #only for chat
        room_id = connect_data.get("room_id")

        mode = connect_data["mode"]

        if not mode:
            await websocket.close(code=4000)
            return

        if mode == "world":
            world = connect_data.get("world")
            character_id = connect_data.get("character")

            if world not in worlds:
                await get_world(world)

            await websocket_manager.connect(user_id, websocket=websocket, mode=mode, world=world, character_id=character_id)
            room_id = websocket_manager.get_room_id(websocket)
            await world_management.add_room_connection(websocket, world, room_id, user_id, character_id)

            await world_response.serve_conversation(websocket, world, room_id)

        if mode == "chat":
            await websocket_manager.connect(user_id, websocket=websocket, mode=mode, room_id=room_id)
            #chat_management.add_room_connection(websocket, room_id)
            #await chat_response.serve_conversation(websocket)

        if mode == "simulation":
            world = connect_data.get("world")
            character_id = connect_data.get("character")
            await websocket_manager.connect(user_id, websocket=websocket, mode=mode, world=world, character_id=character_id)
            room_id = websocket_manager.get_room_id(websocket)
            world_management.add_room_connection(websocket, world, room_id, user_id, character_id)
            await world_response.serve_conversation(websocket, world, room_id)


        """if room_id not in rooms:
            if mode == "world":
                rooms[room_id] = {"world": world}
            elif mode == "chat":
                rooms[room_id] = {"chat": room_id}"""

        while True:
            data = await websocket.receive_json()
            await route_message(websocket, data)

    except HTTPException as e:
        try:
            await websocket.close(code=WS_1008_POLICY_VIOLATION)
        except Exception:
            # WebSocket might already be closed
            pass
        logging.info(f"Authentication failed: {e.detail}")
    except WebSocketDisconnect:
        user_id = websocket_manager.get_user_id(websocket)
        # Only disconnect if still in active connections to avoid duplicate cleanup
        if websocket in websocket_manager.active_connections:
            await websocket_manager.disconnect(websocket)
        logging.info(f"User ID: {user_id}, WebSocket disconnected")
    except Exception as e:
        logging.error("Unexpected error in WebSocket endpoint:\n%s", traceback.format_exc())
        user_id = websocket_manager.get_user_id(websocket)
        # Only disconnect if still in active connections to avoid duplicate cleanup
        if user_id and websocket in websocket_manager.active_connections:
            await websocket_manager.disconnect(websocket)


@app.get("/worlds/search")
async def search_worlds_api(q: str = "", user_id=Depends(authenticate), limit: int = 50):
    """Search worlds for portal configuration"""
    results = await world_search.search_worlds(q, user_id, limit)
    user_worlds_count = sum(1 for r in results["results"] if r["is_owned"])
    return {
        "results": results["results"],
        "total": results["total"],
        "user_worlds_count": user_worlds_count
    }

@app.get("/worlds/suggestions")
async def get_world_suggestions(q: str, user_id=Depends(authenticate)):
    """Get autocomplete suggestions for world search"""
    suggestions = await world_search.get_suggestions(q, 10)
    return {"suggestions": suggestions}

@app.get("/{page_name}")
@limiter.limit("20/minute")
async def get_page(request: Request, page_name: str):
    """Enables fetching page specific html files. Declared last so other endpoints take precedence."""

    try:
        timestamp = int(time.time())
        response = templates.TemplateResponse(f"{page_name}.html", {"request": request, "timestamp": timestamp})
        
        # Add cache control headers for HTML files
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        
        return response
    except Exception as e:
        logging.info(f"Page not found: {page_name}, {e}")
        return JSONResponse(content={"message": "404 Not Found - The page does not exist."}, status_code=404)

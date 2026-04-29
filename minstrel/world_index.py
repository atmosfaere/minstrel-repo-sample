from fastapi import APIRouter, Depends, Request, Response, Query, HTTPException
import logging
import asyncio

from data_store import worlds
import s3_actions
from ids import create_location_id, create_character_id, create_object_id, get_location_tag, get_character_tag, get_document_tag, get_container_tag, get_object_tag
from world_management import backup_location, backup_character, backup_object, add_to_discovered_characters, add_to_discovered_locations, add_to_encountered_locations, add_to_recent_locations, add_to_encountered_characters, add_to_recent_characters, add_to_recent_objects, create_character, create_location, create_object, create_document, create_container
from ext_auth import authenticate
from utility import extract_id_tag


BUCKET = "minstrel-data"

router = APIRouter()

logger = logging.getLogger(__name__)


def get_edit_permission(world_id, loc_id, user_id, discovered, encountered):
    return True

def get_view_permission(world_id, loc_id, user_id, discovered, encountered):
    return True
    if worlds[world_id]['settings']['permissions']['no_restrictions']:
        return True

    if worlds[world_id]['settings']['permissions']['view_permission'] == 'discovered':
        if discovered:
            return True
        else:
            return False
    #check user permission /

@router.get("/location-index")
async def get_location_index(world_id: str, loc_id: str, character_id: str, user_id=Depends(authenticate)):
    if loc_id in worlds[world_id]['tags']:
        loc_id = worlds[world_id]['tags'][loc_id]

    worlds[world_id]['characters'][character_id].setdefault('discovered', {})
    worlds[world_id]['characters'][character_id].setdefault('encountered', {})
    worlds[world_id]['characters'][character_id]['discovered'].setdefault('locations', [])
    worlds[world_id]['characters'][character_id]['encountered'].setdefault('locations', [])

    if loc_id in worlds[world_id]['characters'][character_id]['discovered']['locations']:
        discovered = True
    else:
        discovered = False

    if loc_id in worlds[world_id]['characters'][character_id]['encountered']['locations']:
        encountered = True
    else:
        encountered = False

    view_permission = get_view_permission(world_id, loc_id, user_id, discovered, encountered)
    edit_permission = get_edit_permission(world_id, loc_id, user_id, discovered, encountered)
    name = worlds[world_id]['locations'][loc_id].get('name', '')
    summary = worlds[world_id]['locations'][loc_id].get('summary', '')
    instruction = worlds[world_id]['locations'][loc_id].get('instruction', '')
    parent_location = worlds[world_id]['locations'][loc_id].get('parent_location', '')
    child_locations = worlds[world_id]['locations'][loc_id].get('child_locations', [])
    #objects = worlds[world_id]['locations'][loc_id]['objects']
    characters = worlds[world_id]['locations'][loc_id].get('characters', [])
    #simulation = worlds[world_id]['locations'][loc_id]['simulation']
    
    # Get portal data
    portals = worlds[world_id]['locations'][loc_id].get('portals', {})
    outgoing_portals = portals.get('outgoing', {})
    incoming_portals = portals.get('incoming', {})

    shown_child_locations = []
    for child_location in child_locations:
        child_view_permission = get_view_permission(world_id, child_location, user_id, discovered, encountered)
        if child_view_permission:
            shown_child_locations.append(child_location)
    
    return {
        "name": name,
        "summary": summary,
        "instruction": instruction,
        "parent_location": parent_location,
        "child_locations": shown_child_locations,
        "characters": characters,
        "view_permission": view_permission,
        "edit_permission": edit_permission,
        "outgoing_portals": outgoing_portals,
        "incoming_portals": incoming_portals
    }

@router.get("/character-index")
async def get_character_index(world_id: str, char_id: str, user_id=Depends(authenticate)):
    if char_id in worlds[world_id]['tags']:
        char_id = worlds[world_id]['tags'][char_id]
    
    view_permission = True
    edit_permission = True

    name = worlds[world_id]['characters'][char_id].get('name', '')
    summary = worlds[world_id]['characters'][char_id].get('summary', '')
    instruction = worlds[world_id]['characters'][char_id].get('instruction', '')
    location = worlds[world_id]['characters'][char_id].get('location', '')
    parent_location = worlds[world_id]['characters'][char_id].get('parent_location', '')
    simulation = worlds[world_id]['characters'][char_id].get('simulation', None)
    
    return {
        "name": name,
        "summary": summary,
        "instruction": instruction,
        "location": location,
        #"parent_location": parent_location,
        "simulation": simulation,
        "view_permission": view_permission,
        "edit_permission": edit_permission
    }

@router.get("/object-index")
async def get_object_index(world_id: str, object_id: str, user_id=Depends(authenticate)):
    if object_id in worlds[world_id]['tags']:
        object_id = worlds[world_id]['tags'][object_id]
    
    view_permission = True
    edit_permission = True

    name = worlds[world_id]['objects'][object_id].get('name', '')
    summary = worlds[world_id]['objects'][object_id].get('summary', '')
    instruction = worlds[world_id]['objects'][object_id].get('instruction', '')
    holding_feature_tag = worlds[world_id]['objects'][object_id].get('held_by', '')
    
    # Get portal data
    portals = worlds[world_id]['objects'][object_id].get('portals', {})
    outgoing_portals = portals.get('outgoing', {})
    incoming_portals = portals.get('incoming', {})
    
    return {
        "name": name,
        "summary": summary,
        "instruction": instruction,
        "holding_feature_tag": holding_feature_tag,
        "view_permission": view_permission,
        "edit_permission": edit_permission,
        "outgoing_portals": outgoing_portals,
        "incoming_portals": incoming_portals
    }

@router.get("/document-index")
async def get_document_index(world_id: str, doc_id: str, user_id=Depends(authenticate)):
    if doc_id in worlds[world_id]['tags']:
        doc_id = worlds[world_id]['tags'][doc_id]
    
    view_permission = True
    edit_permission = True

    name = worlds[world_id]['objects']['documents'][doc_id].get('name', '')
    summary = worlds[world_id]['objects']['documents'][doc_id].get('summary', '')
    instruction = worlds[world_id]['objects']['documents'][doc_id].get('instruction', '')
    location_held = worlds[world_id]['objects']['documents'][doc_id].get('location_held', '')
    document_text = worlds[world_id]['objects']['documents'][doc_id].get('document_text', '')
    
    return {
        "name": name,
        "summary": summary,
        "instruction": instruction,
        "location_held": location_held,
        "document_text": document_text,
        "view_permission": view_permission,
        "edit_permission": edit_permission
    }

@router.get("/main-index")
async def get_main_index(world_id: str, character_id: str, user_id=Depends(authenticate)):
    current_character = worlds[world_id]['characters'][character_id]

    current_character.setdefault('recent', {})
    current_character['recent'].setdefault('characters', [])
    current_character['recent'].setdefault('locations', [])

    recent_characters = [
        {"tag": worlds[world_id]['characters'][char_id].get('tag', char_id), "name": worlds[world_id]['characters'][char_id]['name']}
        for char_id in current_character['recent']['characters']
    ]
    recent_locations = [
        {"tag": worlds[world_id]['locations'][loc_id].get('tag', loc_id), "name": worlds[world_id]['locations'][loc_id]['name']}
        for loc_id in current_character['recent']['locations'] if loc_id in worlds[world_id]['locations']
    ]
    print("world id", world_id)
    print("top level locations", worlds[world_id]['top_level_locations'])
    top_level_locations = [
        {"tag": worlds[world_id]['locations'][loc_id].get('tag', loc_id), "name": worlds[world_id]['locations'][loc_id]['name']}
        for loc_id in worlds[world_id]['top_level_locations']
    ]
    
    world_name = worlds[world_id]['page']['name']
    
    return {
        "world_name": world_name,
        "recent_characters": recent_characters, 
        "recent_locations": recent_locations, 
        "top_level_locations": top_level_locations
    }

@router.get("/world-index")
async def get_world_index(world_id: str, user_id=Depends(authenticate)):
    view_permission = True
    edit_permission = True

    world_name = worlds[world_id]['page']['name']

    return {
        "world_name": world_name,
        "summary": worlds[world_id].get('world_summary', ''),
        "instruction": worlds[world_id].get('world_instruction', ''),
        "world_setting": worlds[world_id].get('world_setting', ''),
        "view_permission": view_permission,
        "edit_permission": edit_permission
    }

@router.get("/get-new-character")
async def get_new_character(world_id: str, user_id=Depends(authenticate)):
    empty_name = ''
    character_tag = await create_character(world_id, empty_name)
    return {"tag": character_tag}

@router.get("/get-new-location")
async def get_new_location(world_id: str, user_id=Depends(authenticate)):
    empty_name = ''
    location_tag = await create_location(world_id, empty_name)
    return {"tag": location_tag}

@router.get("/get-new-object")
async def get_new_object(world_id: str, user_id=Depends(authenticate)):
    object_tag = await create_object(world_id, '')
    return {"tag": object_tag}

@router.get("/get-new-document")
async def get_new_document(world_id: str, user_id=Depends(authenticate)):
    document_tag= await create_document(world_id, '', '')
    return {"tag": document_tag}

@router.get("/get-new-container")
async def get_new_container(world_id: str, user_id=Depends(authenticate)):
    container_tag = await create_container
    return {"tag": container_tag}

@router.post("/add-character-summary")
async def add_character_summary(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    summary = data['summary']
    world = data['world']
    character_id = data['character_id']

    if world in worlds:
        worlds[world]['characters'][character_id]['summary'] = summary
    else:
        prefix = f"worlds/{world}/users/{user_id}/characters/{character_id}/"
        await s3_actions.store(BUCKET, prefix, "summary", summary)


@router.post("/add-world-instruction")
async def add_world_instruction(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    instruction = data['instruction']

    world = data['world']
    if world in worlds:
        worlds[world]['world_instruction'] = instruction
    else:
        user_worlds_prefix = f"worlds/{world}/users/{user_id}/"
        await s3_actions.store(BUCKET, user_worlds_prefix, "instruction", instruction)


#used to display existing characters to insert into world index summaries etc.
@router.get("/get-character-list")
async def get_characters(world_id: str, user_id=Depends(authenticate)):
    #Return only non-player characters that have an id starting with c, filter out characters that weren't actually created and saved that are missing name
    character_list = [
        {"tag": worlds[world_id]['characters'][char_id].get('tag', char_id), "name": worlds[world_id]['characters'][char_id]['name']}
        for char_id in worlds[world_id]['characters']
        if char_id.startswith('c') and worlds[world_id]['characters'][char_id].get('name')
    ]
    
    return character_list

@router.get("/get-location-list")
async def get_locations(world_id: str, user_id=Depends(authenticate)):
    # Return only locations that were saved, by filtering to locations with a name.
    location_list = [
        {"tag": worlds[world_id]['locations'][loc_id].get('tag', loc_id), "name": worlds[world_id]['locations'][loc_id]['name']}
        for loc_id in worlds[world_id]['locations']
        if worlds[world_id]['locations'][loc_id].get('name')
    ]
    
    return location_list

@router.get("/get-document-list")
async def get_document_list(world_id: str, user_id=Depends(authenticate)):
    # Return only documents that were saved, by filtering to documents with a name.
    document_list = [
        {"tag": worlds[world_id]['objects']['documents'][doc_id].get('tag', doc_id), "name": worlds[world_id]['objects']['documents'][doc_id]['name']}
        for doc_id in worlds[world_id]['objects']['documents']
        if worlds[world_id]['objects']['documents'][doc_id].get('name')
    ]

    return document_list

#overlaps save-location
@router.post("/move-character")
async def move_character(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    character_id = data['character_id']
    location_id = data['location_id']
    
    # Remove character from current location first
    current_location = worlds[world]['characters'][character_id].get('location')
    if current_location and current_location in worlds[world]['locations']:
        if character_id in worlds[world]['locations'][current_location].get('characters', []):
            worlds[world]['locations'][current_location]['characters'].remove(character_id)
            asyncio.create_task(backup_location(world, current_location))
    
    # Add character to new location
    worlds[world]['characters'][character_id]['location'] = location_id
    worlds[world]['locations'][location_id].setdefault('characters', [])
    if character_id not in worlds[world]['locations'][location_id]['characters']:
        worlds[world]['locations'][location_id]['characters'].append(character_id)
    asyncio.create_task(backup_location(world, location_id))

@router.post("/add-object-to-container")
async def add_object_to_container(request: Request, user_id=Depends(authenticate)):
    data = await request.json
    world_id = data['world']
    container_id = data['container']
    object_id = data['object']

    container_objects = worlds[world_id]['objects']['containers'][container_id].setdefault('held_objects', [])

    if object_id not in container_objects:
        container_objects.append(object_id)


# not being used
@router.post("/add-child-location")
async def add_child_location(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    location_id = data['location_id']
    child_location = data['child_location']
    worlds[world]['locations'][location_id].setdefault('child_locations', [])
    worlds[world]['locations'][location_id]['child_locations'].append(child_location)
    asyncio.create_task(backup_location(world, location_id))

'''
#don't think this is used save-parent-location was added instead.
@router.post("/add-parent-location")
async def add_parent_location(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    location_id = data['location_id']
    parent_location = data['parent_location']
    worlds[world]['locations'][location_id]['parent_location'] = parent_location
    asyncio.create_task(backup_location(world, location_id))'''

@router.post("/save-summary")
async def save_summary(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    summary = data['summary']
    feature_tag = data['tag']
    feature_id = worlds[world]['tags'].get(feature_tag, feature_tag)
    
    # Check if world is loaded in memory
    if world not in worlds:
        raise HTTPException(status_code=404, detail="World not found")
    
    if feature_id == world:
        worlds[world]['world_summary'] = summary
        prefix = f"worlds/{world}/"
        asyncio.create_task(s3_actions.store(BUCKET, prefix, 'world_summary', summary))
    elif feature_tag.startswith('c'):
        if feature_id not in worlds[world]['characters']:
            raise HTTPException(status_code=404, detail="Character not found")
        worlds[world]['characters'][feature_id]['summary'] = summary
        await backup_character(world, feature_id)
    elif feature_tag.startswith('l'):
        if feature_id not in worlds[world]['locations']:
            raise HTTPException(status_code=404, detail="Location not found")
        worlds[world]['locations'][feature_id]['summary'] = summary
        await backup_location(world, feature_id)
    elif feature_tag.startswith('d'):
        if feature_id not in worlds[world]['objects']['documents']:
            raise HTTPException(status_code=404, detail="Document not found")
        worlds[world]['objects']['documents'][feature_id]['summary'] = summary
        await backup_object(world, feature_id, 'documents')
    elif feature_tag.startswith('s'):
        if feature_id not in worlds[world]['objects']['containers']:
            raise HTTPException(status_code=404, detail="Container not found")
        worlds[world]['objects']['containers'][feature_id]['summary'] = summary
        await backup_object(world, feature_id, 'containers')
    elif feature_tag.startswith('o'):
        if feature_id not in worlds[world]['objects']:
            raise HTTPException(status_code=404, detail="Object not found")
        worlds[world]['objects'][feature_id]['summary'] = summary
        await backup_object(world, feature_id)
    
    return {"status": "success", "message": "Summary saved successfully"}

@router.post("/save-instruction")
async def save_instruction(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    instruction = data['instruction']
    feature_tag = data['tag']
    feature_id = worlds[world]['tags'].get(feature_tag, feature_tag)

    if feature_id == world:
        if world not in worlds:
            raise HTTPException(status_code=404, detail="World not found")
        worlds[world]['world_instruction'] = instruction
        prefix = f"worlds/{world}/"
        asyncio.create_task(s3_actions.store(BUCKET, prefix, 'world_instruction', instruction))
    if feature_tag.startswith('c'):
        if feature_id not in worlds[world]['characters']:
            raise HTTPException(status_code=404, detail="Character not found")
        worlds[world]['characters'][feature_id]['instruction'] = instruction
        await backup_character(world, feature_id)
    elif feature_tag.startswith('l'):
        if feature_id not in worlds[world]['locations']:
            raise HTTPException(status_code=404, detail="Location not found")
        worlds[world]['locations'][feature_id]['instruction'] = instruction
        await backup_location(world, feature_id)
    elif feature_tag.startswith('d'):
        if feature_id not in worlds[world]['objects']['documents']:
            raise HTTPException(status_code=404, detail="Document not found")
        worlds[world]['objects']['documents'][feature_id]['instruction'] = instruction
        await backup_object(world, feature_id, 'documents')
    elif feature_tag.startswith('s'):
        if feature_id not in worlds[world]['objects']['containers']:
            raise HTTPException(status_code=404, detail="Container not found")
        worlds[world]['objects']['containers'][feature_id]['instruction'] = instruction
        await backup_object(world, feature_id, 'containers')
    elif feature_tag.startswith('o'):
        if feature_id not in worlds[world]['objects']:
            raise HTTPException(status_code=404, detail="Object not found")
        worlds[world]['objects'][feature_id]['instruction'] = instruction
        await backup_object(world, feature_id)

@router.post("/save-world-setting")
async def save_world_setting(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    setting = data['world_setting']

    if world not in worlds:
        raise HTTPException(status_code=404, detail="World not found")
    worlds[world]['world_setting'] = setting
    prefix = f"worlds/{world}/"
    asyncio.create_task(s3_actions.store(BUCKET, prefix, 'world_setting', setting))

@router.post("/save-name")
async def save_name(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    feature_tag = data['tag']
    name = data['name']
    feature_id = worlds[world]['tags'].get(feature_tag, feature_tag)
    player_character_id = data['character_id']

    if feature_tag.startswith('c'):
        if feature_id not in worlds[world]['characters']:
            raise HTTPException(status_code=404, detail="Character not found")
        worlds[world]['characters'][feature_id]['name'] = name
        await add_to_recent_characters(world, player_character_id, feature_id)
        await backup_character(world, feature_id)

    elif feature_tag.startswith('l'):
        if feature_id not in worlds[world]['locations']:
            raise HTTPException(status_code=404, detail="Location not found")
        worlds[world]['locations'][feature_id]['name'] = name
        await add_to_recent_locations(world, player_character_id, feature_id)
        await backup_location(world, feature_id)

    elif feature_tag.startswith('d'):
        if feature_id not in worlds[world]['objects']['documents']:
            raise HTTPException(status_code=404, detail="Document not found")
        worlds[world]['objects']['documents'][feature_id]['name'] = name
        await add_to_recent_objects(world, player_character_id, feature_id)
        await backup_object(world, feature_id, 'documents')

    elif feature_tag.startswith('s'):
        if feature_id not in worlds[world]['objects']['containers']:
            raise HTTPException(status_code=404, detail="Container not found")
        worlds[world]['objects']['containers'][feature_id]['name'] = name
        await add_to_recent_objects(world, player_character_id, feature_id)
        await backup_object(world, feature_id, 'containers')

    elif feature_tag.startswith('o'):
        if feature_id not in worlds[world]['objects']:
            raise HTTPException(status_code=404, detail="Object not found")
        worlds[world]['objects'][feature_id]['name'] = name
        await add_to_recent_objects(world, player_character_id, feature_id)
        await backup_object(world, feature_id)
        
@router.post("/delete-feature")
async def delete_feature(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    feature_tag = data['tag']
    feature_id = worlds[world]['tags'].get(feature_tag, feature_tag)

    if feature_tag.startswith('c'):
        if feature_id not in worlds[world]['characters']:
            raise HTTPException(status_code=404, detail="Character not found")

        #remove character from any location it is in
        await _save_location(world, feature_id, None)
        del worlds[world]['characters'][feature_id]
        
        # Remove from all characters' discovered, encountered, and recent lists
        for character_id, character_data in worlds[world]['characters'].items():
            # Remove from discovered characters
            if 'discovered' in character_data and 'characters' in character_data['discovered']:
                if feature_id in character_data['discovered']['characters']:
                    character_data['discovered']['characters'].remove(feature_id)
            
            # Remove from encountered characters
            if 'encountered' in character_data and 'characters' in character_data['encountered']:
                if feature_id in character_data['encountered']['characters']:
                    character_data['encountered']['characters'].remove(feature_id)
            
            # Remove from recent characters
            if 'recent' in character_data and 'characters' in character_data['recent']:
                if feature_id in character_data['recent']['characters']:
                    character_data['recent']['characters'].remove(feature_id)
        
        # Remove from users' recent and encountered lists
        for user_data in worlds[world]['users'].values():
            # Remove from recent characters
            if 'recent' in user_data and 'characters' in user_data['recent']:
                if feature_id in user_data['recent']['characters']:
                    user_data['recent']['characters'].remove(feature_id)
            
            # Remove from encountered characters
            if 'encountered' in user_data and 'characters' in user_data['encountered']:
                if feature_id in user_data['encountered']['characters']:
                    user_data['encountered']['characters'].remove(feature_id)

        # Delete character data from disk
        try:
            prefix = f"worlds/{world}/characters/"
            await s3_actions.delete_path(BUCKET, prefix, feature_id)
        except Exception as e:
            logger.error(f"Error deleting character path for {feature_id} in world {world}: {e}")
        
        return {"success": True, "message": f"Character {feature_id} deleted successfully"}

    elif feature_tag.startswith('l'):
        if feature_id not in worlds[world]['locations']:
            raise HTTPException(status_code=404, detail="Location not found")
        
        #remove location from any parent location
        await _save_location(world, feature_id, None)
        del worlds[world]['locations'][feature_id]
        
        # Remove from top_level_locations if present
        if 'top_level_locations' in worlds[world] and feature_id in worlds[world]['top_level_locations']:
            worlds[world]['top_level_locations'].remove(feature_id)
        
        # Remove from all characters' discovered, encountered, and recent lists
        for character_id, character_data in worlds[world]['characters'].items():
            # Remove from discovered locations
            if 'discovered' in character_data and 'locations' in character_data['discovered']:
                if feature_id in character_data['discovered']['locations']:
                    character_data['discovered']['locations'].remove(feature_id)
            
            # Remove from encountered locations
            if 'encountered' in character_data and 'locations' in character_data['encountered']:
                if feature_id in character_data['encountered']['locations']:
                    character_data['encountered']['locations'].remove(feature_id)
            
            # Remove from recent locations
            if 'recent' in character_data and 'locations' in character_data['recent']:
                if feature_id in character_data['recent']['locations']:
                    character_data['recent']['locations'].remove(feature_id)
        
        # Remove from users' recent and encountered lists
        for user_data in worlds[world]['users'].values():
            # Remove from recent locations
            if 'recent' in user_data and 'locations' in user_data['recent']:
                if feature_id in user_data['recent']['locations']:
                    user_data['recent']['locations'].remove(feature_id)
            
            # Remove from encountered locations
            if 'encountered' in user_data and 'locations' in user_data['encountered']:
                if feature_id in user_data['encountered']['locations']:
                    user_data['encountered']['locations'].remove(feature_id)

        # Delete location data from disk
        try:
            prefix = f"worlds/{world}/locations/"
            await s3_actions.delete_path(BUCKET, prefix, feature_id)
        except Exception as e:
            logger.error(f"Error deleting location path for {feature_id} in world {world}: {e}")

        return {"success": True, "message": f"Location {feature_id} deleted successfully"}

    elif feature_tag.startswith('d'):
        if feature_id not in worlds[world]['objects']['documents']:
            raise HTTPException(status_code=404, detail="Document not found")
        
        #remove document from holding feature
        await _save_object_holder(world, feature_id, None)
        del worlds[world]['objects']['documents'][feature_id]
        
        # Remove from all characters' recent objects lists
        for character_id, character_data in worlds[world]['characters'].items():
            # Remove from recent objects
            if 'recent' in character_data and 'objects' in character_data['recent']:
                if feature_id in character_data['recent']['objects']:
                    character_data['recent']['objects'].remove(feature_id)

        # Delete document data from disk
        try:
            prefix = f"worlds/{world}/objects/documents/"
            await s3_actions.delete_path(BUCKET, prefix, feature_id)
        except Exception as e:
            logger.error(f"Error deleting document path for {feature_id} in world {world}: {e}")

        return {"success": True, "message": f"Document {feature_id} deleted successfully"}

    elif feature_tag.startswith('s'):
        if feature_id not in worlds[world]['objects']['containers']:
            raise HTTPException(status_code=404, detail="Container not found")

        #remove container from holding feature
        await _save_object_holder(world, feature_id, None)
        del worlds[world]['objects']['containers'][feature_id]

        # Remove from all characters' recent objects lists
        for character_id, character_data in worlds[world]['characters'].items():
            # Remove from recent objects
            if 'recent' in character_data and 'objects' in character_data['recent']:
                if feature_id in character_data['recent']['objects']:
                    character_data['recent']['objects'].remove(feature_id)

        # Delete container data from disk
        try:
            prefix = f"worlds/{world}/objects/containers/"
            await s3_actions.delete_path(BUCKET, prefix, feature_id)
        except Exception as e:
            logger.error(f"Error deleting container path for {feature_id} in world {world}: {e}")

        return {"success": True, "message": f"Container {feature_id} deleted successfully"}

    elif feature_tag.startswith('o'):
        if feature_id not in worlds[world]['objects']:
            raise HTTPException(status_code=404, detail="Object not found")

        #remove object from holding feature
        await _save_object_holder(world, feature_id, None)
        del worlds[world]['objects'][feature_id]
        
        # Remove from all characters' recent objects lists
        for character_id, character_data in worlds[world]['characters'].items():
            # Remove from recent objects
            if 'recent' in character_data and 'objects' in character_data['recent']:
                if feature_id in character_data['recent']['objects']:
                    character_data['recent']['objects'].remove(feature_id)

        # Delete object data from disk
        try:
            prefix = f"worlds/{world}/objects/"
            await s3_actions.delete_path(BUCKET, prefix, feature_id)
        except Exception as e:
            logger.error(f"Error deleting object path for {feature_id} in world {world}: {e}")

        return {"success": True, "message": f"Object {feature_id} deleted successfully"}

    else:
        raise HTTPException(status_code=400, detail="Invalid feature ID format")


@router.post("/save-location")
async def save_location(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    feature_id = data['id']
    location_feature = data['location']
    await _save_location(world, feature_id, location_feature)


async def _save_location(world: str, feature_identifier: str, location_feature: str):
    """
    Helper for updating a feature's location/parent-location that can be called
    both from this router endpoint and from other backend code.

    `feature_identifier` can be either a tag or a canonical feature id.
    `location_feature` is the full bracket/@@id@@ string or plain text.
    """
    # Resolve feature id from tag if needed
    feature_id = worlds[world]['tags'].get(feature_identifier, feature_identifier)

    # Resolve target location id (if any) from the provided location feature text
    location_tag = extract_id_tag(location_feature)
    location_id = worlds[world]['tags'].get(location_tag, location_tag)

    # If feature_id belongs to a character, update the character's location
    if feature_id in worlds[world].get('characters', {}):
        # Safety check
        if feature_id not in worlds[world]['characters']:
            raise HTTPException(status_code=404, detail="Character not found")

        # Remove character from previous location's characters list
        current_location = extract_id_tag(worlds[world]['characters'][feature_id].get('location'))
        if current_location and current_location in worlds[world]['locations']:
            if feature_id in worlds[world]['locations'][current_location].get('characters', []):
                worlds[world]['locations'][current_location]['characters'].remove(feature_id)
                asyncio.create_task(backup_location(world, current_location))

        # Update character's location and add to new location's characters list
        # add name @@id@@ to feature's 'location' and plain id to location's 'characters'
        worlds[world]['characters'][feature_id]['location'] = location_feature
        if location_id and location_id in worlds[world]['locations']:
            worlds[world]['locations'][location_id].setdefault('characters', [])
            if feature_id not in worlds[world]['locations'][location_id]['characters']:
                worlds[world]['locations'][location_id]['characters'].append(feature_id)
                asyncio.create_task(backup_location(world, location_id))

        await backup_character(world, feature_id)

    # If feature_id belongs to a location, update its parent/child relationship
    elif feature_id in worlds[world].get('locations', {}):
        if feature_id not in worlds[world]['locations']:
            raise HTTPException(status_code=404, detail="Location not found")

        # Remove location from previous parent's child_locations list
        current_parent = extract_id_tag(worlds[world]['locations'][feature_id].get('parent_location'))
        if current_parent and current_parent in worlds[world]['locations']:
            if feature_id in worlds[world]['locations'][current_parent].get('child_locations', []):
                worlds[world]['locations'][current_parent]['child_locations'].remove(feature_id)
                asyncio.create_task(backup_location(world, current_parent))
        # Remove from top_level_locations if it was a top-level location
        elif not current_parent and feature_id in worlds[world].get('top_level_locations', []):
            worlds[world]['top_level_locations'].remove(feature_id)

        # Add location to new parent's child_locations list
        # add name @@id@@ to feature's 'parent_location' and plain id to location's 'child_locations'
        worlds[world]['locations'][feature_id]['parent_location'] = location_feature
        if location_id and location_id in worlds[world]['locations']:
            worlds[world]['locations'][location_id].setdefault('child_locations', [])
            if feature_id not in worlds[world]['locations'][location_id]['child_locations']:
                worlds[world]['locations'][location_id]['child_locations'].append(feature_id)
                asyncio.create_task(backup_location(world, location_id))

        else:
            # No parent specified – treat as a top-level location
            worlds[world].setdefault('top_level_locations', [])
            if feature_id not in worlds[world]['top_level_locations']:
                worlds[world]['top_level_locations'].append(feature_id)

        await backup_location(world, feature_id)

    else:
        raise HTTPException(status_code=404, detail="Feature not found")

@router.post("/save-parent-location")
async def save_parent_location(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    feature_tag = data['tag']
    parent_location_feature = data['parent_location']
    await _save_parent_location(world, feature_tag, parent_location_feature)


async def _save_parent_location(world: str, feature_identifier: str, parent_location_feature: str):
    """
    Helper for updating a location's parent that can be called from other
    backend code. `feature_identifier` can be a tag or a canonical id.
    """
    feature_id = worlds[world]['tags'].get(feature_identifier, feature_identifier)

    parent_location_tag = extract_id_tag(parent_location_feature)
    parent_location_id = worlds[world]['tags'].get(parent_location_tag, parent_location_tag)

    if feature_id not in worlds[world]['locations']:
        raise HTTPException(status_code=404, detail="Location not found")

    # Remove location from previous parent's child_locations list
    current_parent = extract_id_tag(worlds[world]['locations'][feature_id].get('parent_location'))
    if current_parent and current_parent in worlds[world]['locations']:
        if feature_id in worlds[world]['locations'][current_parent].get('child_locations', []):
            worlds[world]['locations'][current_parent]['child_locations'].remove(feature_id)
            asyncio.create_task(backup_location(world, current_parent))
    # Remove from top_level_locations if it was a top-level location
    elif not current_parent and feature_id in worlds[world].get('top_level_locations', []):
        worlds[world]['top_level_locations'].remove(feature_id)

    # Add Parent Location
    worlds[world]['locations'][feature_id]['parent_location'] = parent_location_feature

    # Add location to new parent's child_locations list
    if parent_location_id and parent_location_id in worlds[world]['locations']:
        worlds[world]['locations'][parent_location_id].setdefault('child_locations', [])
        if feature_id not in worlds[world]['locations'][parent_location_id]['child_locations']:
            worlds[world]['locations'][parent_location_id]['child_locations'].append(feature_id)
            asyncio.create_task(backup_location(world, parent_location_id))
    else:
        # No parent specified – treat as a top-level location
        worlds[world].setdefault('top_level_locations', [])
        if feature_id not in worlds[world]['top_level_locations']:
            worlds[world]['top_level_locations'].append(feature_id)

    await backup_location(world, feature_id)

@router.post("/save-object-location")
async def save_object_location(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    object_tag = data['tag']
    object_id = worlds[world]['tags'].get(object_tag, object_tag)
    holding_feature_tag = data['location_held']

    holding_feature_id = worlds[world]['tags'].get(holding_feature_tag, holding_feature_tag)

    await _save_object_holder(world, object_id, holding_feature_id)

async def _save_object_holder(world_id: str, object_id: str, holding_feature_id: str):
    old_holding_feature_id = worlds[world_id]['objects'][object_id].get('held_by', None)

    if old_holding_feature_id in worlds[world_id]['locations']:
        worlds[world_id]['locations'][old_holding_feature_id]['objects'].remove(object_id)
        await backup_location(world_id, old_holding_feature_id)

    elif old_holding_feature_id in worlds[world_id]['characters']:
        worlds[world_id]['characters'][old_holding_feature_id]['objects'].remove(object_id)
        await backup_character(world_id, old_holding_feature_id)

    elif old_holding_feature_id in worlds[world_id]['objects']['containers']:
        worlds[world_id]['objects']['containers'][old_holding_feature_id]['objects'].remove(object_id)
        await backup_object(world_id, old_holding_feature_id, 'containers')
    
    else:
        logging.info(f"Old holding feature {old_holding_feature_id} not found in world {world_id}")

    if holding_feature_id:
        if holding_feature_id in worlds[world_id]['locations']:
            worlds[world_id]['locations'][holding_feature_id]['objects'].append(object_id)
            await backup_location(world_id, holding_feature_id)
        elif holding_feature_id in worlds[world_id]['characters']:
            worlds[world_id]['characters'][holding_feature_id]['objects'].append(object_id)
            await backup_character(world_id, holding_feature_id)
        elif holding_feature_id in worlds[world_id]['objects']['containers']:
            worlds[world_id]['objects']['containers'][holding_feature_id]['objects'].append(object_id)
            await backup_object(world_id, holding_feature_id, 'containers')
        else:
            logging.error(f"Holding feature {holding_feature_id} not found in world {world_id}")
            return

    if object_id in worlds[world_id]['objects']:
        worlds[world_id]['objects'][object_id]['held_by'] = holding_feature_id
        await backup_object(world_id, object_id)
    elif object_id in worlds[world_id]['objects']['documents']:
        worlds[world_id]['objects']['documents'][object_id]['held_by'] = holding_feature_id
        await backup_object(world_id, object_id, 'documents')
    elif object_id in worlds[world_id]['objects']['containers']:
        worlds[world_id]['objects']['containers'][object_id]['held_by'] = holding_feature_id
        await backup_object(world_id, object_id, 'containers')
    else:
        logging.error(f"Object {object_id} not found in world {world_id}")

@router.post("/save-document-text")
async def save_document_text(request: Request, user_id=Depends(authenticate)):
    data = await request.json()
    world = data['world']
    document_tag = data['tag']
    document_id = worlds[world]['tags'].get(document_tag, document_tag)
    document_text = data['document_text']

    if not document_tag.startswith('d'):
        raise HTTPException(status_code=400, detail="Invalid document tag")
    
    if document_id not in worlds[world]['objects']['documents']:
        raise HTTPException(status_code=404, detail="Document not found")
    
    worlds[world]['objects']['documents'][document_id]['document_text'] = document_text
    await backup_object(world, document_id, 'documents')
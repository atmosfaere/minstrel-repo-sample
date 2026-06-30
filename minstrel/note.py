from datetime import datetime, timezone

import storage.s3_actions
from storage.data_store import notes
from networking.websocket_manager import websocket_manager as wsm
from ids import uuid

BUCKET = 'minstrel-notes'

class SyncEditNotFound(Exception):
    pass

async def edit_text_note(websocket, user_id, edit):
    note_id = edit['note_id']

    if note_id not in notes:
        await retrieve_note(note_id)

    notes[note_id].setdefault('edits', [])

    last_edit = notes[note_id].get('last_edit', None)

    new_edit_id = edit['new_edit_id']
    client_synced_edit_id = edit['sync_edit_id']

    if last_edit and client_synced_edit_id != last_edit:
        oldest_stored_edit_time = notes[note_id]['edits'][0].get('time', None)
        new_edit_time = edit['time']
        
        if len(notes[note_id]['edits']) < 1 or new_edit_time < oldest_stored_edit_time:
            await notify_stale_edit_failed(websocket, note_id)
            return
        try:
            insert_text_edit(note_id, edit)
            apply_text_edits(note_id)
            notes[note_id]['last_edit'] = edit['new_edit_id']
        except SyncEditNotFound:
            await notify_stale_edit_failed(websocket, note_id)
            return
        except Exception:
            await notify_edit_failed(websocket, note_id)
            return

    else:
        try:
            apply_text_edit(note_id, edit)
            notes[note_id]['edits'].append(edit)
            notes[note_id]['last_edit'] = edit['new_edit_id']
        except Exception:
            await notify_edit_failed(websocket, note_id)
            return

    for socket in notes[note_id]['connections'].keys():
            text = notes[note_id]['text']
            await wsm.send(websocket=socket, message={'channel': 'notes', 'route': 'receive text note edit', 'content': {'note_id': note_id, 'text': text}})
        


def apply_text_edit(note_id, edit):
    start_index = edit['start_index']
    end_index = edit['end_index']

    if edit['edit_type'] == 'add':
        # Remove any selection and add new text
        beginning_text = notes[note_id]['text'][:start_index]
        ending_text = notes[note_id]['text'][end_index:]
        notes[note_id]['text'] = beginning_text + edit['edit'] + ending_text
            
    elif edit['edit_type'] == 'del':
        if start_index == end_index:
            notes[note_id]['text'] = notes[note_id]['text'][:start_index - 1] + notes[note_id]['text'][end_index:]
        else:
            notes[note_id]['text'] = notes[note_id]['text'][:start_index] + notes[note_id]['text'][end_index:]

    elif edit['edit_type'] == 'del forward':
        if start_index == end_index:
            notes[note_id]['text'] = notes[note_id]['text'][:start_index] + notes[note_id]['text'][end_index + 1:]
        else:
            notes[note_id]['text'] = notes[note_id]['text'][:start_index] + notes[note_id]['text'][end_index:]


def insert_text_edit(note_id, edit):
    edits = notes[note_id]['edits']
    sync_edit = edit['sync_edit_id']
    time = edit['time']
    edit_start_index = edit['start_index']
    edit_end_index = edit['end_index']

    sync_edit_index = None
    for edit_index in range(len(edits)): 
        if edits[edit_index]['new_edit_id'] == sync_edit:
            sync_edit_index = edit_index
            break

    if sync_edit_index is None:
        raise SyncEditNotFound(f"sync_edit_id '{sync_edit}' not found in edits")

    edit_index = sync_edit_index + 1
    cursor_delta = 0
    for saved_edit in edits[sync_edit_index + 1:]:
        if saved_edit['time'] < time:
            edit_index += 1
            saved_edit_start_index = saved_edit['start_index']
            saved_edit_end_index = saved_edit['end_index']
            if saved_edit['edit_type'] == 'add':
                if saved_edit_start_index <= edit_start_index + cursor_delta:
                    cursor_delta += len(saved_edit['edit']) - (saved_edit_end_index - saved_edit_start_index)
            elif saved_edit['edit_type'] == 'del':
                # If deletion range is completely before the new edit
                if saved_edit_end_index < edit_start_index + cursor_delta:
                    if saved_edit_start_index == saved_edit_end_index:
                        cursor_delta -= 1
                    elif saved_edit_end_index > saved_edit_start_index:
                        cursor_delta -= saved_edit['end_index'] - saved_edit['start_index']
                # If range is overlapping
                elif (saved_edit_start_index <= edit_start_index + cursor_delta) and (saved_edit_end_index >= edit_start_index + cursor_delta):
                    cursor_delta = saved_edit_start_index - edit_start_index
                    
            elif saved_edit['edit_type'] == 'del forward':
                if saved_edit_end_index < edit_start_index + cursor_delta:
                    if saved_edit_start_index == saved_edit_end_index:
                        cursor_delta -= 1
                    elif saved_edit_end_index > saved_edit_start_index:
                        cursor_delta -= saved_edit['end_index'] - saved_edit['start_index']
                elif (saved_edit_start_index <= edit_start_index + cursor_delta) and (saved_edit_end_index >= edit_start_index + cursor_delta):
                    cursor_delta = saved_edit_start_index - edit_start_index

        elif saved_edit['time'] > time:
            break
    
    edit['start_index'] += cursor_delta
    edit['end_index'] += cursor_delta
    #previous_edit_id = edits[edit_index-1]['new_edit_id']
    #edit['sync_edit_id'] = previous_edit_id

    edits.insert(edit_index, edit)
        

def apply_text_edits(note_id):
    edits = notes[note_id]['edits']
    notes[note_id]['text'] = notes[note_id]['starting_text']

    for edit in edits:
        apply_text_edit(note_id, edit)


def create_text_note():
    note_id = uuid()
    notes[note_id] = {}
    time = datetime.now(timezone.utc)
    notes[note_id]['created'] = time
    notes[note_id]['last_modified'] = time
    notes[note_id]['type'] = 'text'
    notes[note_id]['text'] = ''
    notes[note_id]['starting_text'] = ''
    notes[note_id]['edits'] = []
    return note_id

async def retrieve_note(note_id):
    note = await storage.s3_actions.retrieve(BUCKET, prefix='notes', key=note_id)
    notes.setdefault(note_id, {})
    notes[note_id]= note
    notes[note_id]['connections'] = {}

    if note['type'] == 'text':
        notes[note_id]['starting_text'] = note['text']
    

def fetch_note_client(websocket, user_id, content):
    note_id = content['note_id']
    notes[note_id]['connections'].setdefault(websocket, [])
    notes[note_id]['connections'][websocket].append(user_id)

    #send note

async def notify_stale_edit_failed(websocket, note_id):
    pass

async def notify_edit_failed(websocket, note_id):
    pass



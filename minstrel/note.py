import storage.s3_actions
from storage.data_store import notes
from networking.websocket_manager import websocket_manager as wsm

BUCKET = 'minstrel-notes'
async def edit_text_note(websocket, user_id, content):
    note_id = content['note_id']

    if note_id not in notes:
        await retrieve_note(note_id)
    
    start_index = content['start_index']
    end_index = content['end_index']

    if content['edit_type'] == 'add':
        #removes selection or adds new text if start_index = end_index
        beginning_text = notes[user_id][note_id]['text'][:start_index]
        ending_text = notes[user_id][note_id]['text'][end_index:]
        notes[user_id][note_id]['text'] = beginning_text + content['edit'] + ending_text

        if len(notes[note_id]['connections']) > 1:
            for socket in notes[note_id]['connections']:
                wsm.send()
            

    if content['edit_type'] == 'del':
        pass

    if content['edit_type'] == 'del forward':
        pass

async def retrieve_note(note_id):
    note = await storage.s3_actions.retrieve(BUCKET, prefix='notes', key=note_id)
    notes.setdefault(note_id, {})
    notes[note_id]= note
    notes[note_id]['connections'] = {}
    

def fetch_note_client(websocket, user_id, content):
    note_id = content['note_id']
    notes[note_id]['connections'].setdefault(websocket, [])
    notes[note_id]['connections'][websocket].append(user_id)

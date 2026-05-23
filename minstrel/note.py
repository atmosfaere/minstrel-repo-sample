from storage.data_store import notes
from storage.s3_actions import store, retrieve, delete_path

def save_text_note(user_id, note):
    note_id = note['note_id']
    notes.setdefault(user_id, [])

    if note['edit_type'] == 'add':
        pass

    if note['edit_type'] == 'del':
        pass

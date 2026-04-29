"""
Test script to verify UserDict wrapper changes work correctly
"""
from world_models import World, Character, CharactersDict, Room, RoomsDict
import copy

def test_world_dict_conversion():
    """Test that dict() conversion works on World objects"""
    test_data = {
        'info': '{"name": "Test World"}',
        'page': {'name': 'Test Page'},
        'characters': {
            'char1': {'name': 'Alice', 'level': 5},
            'char2': {'name': 'Bob', 'level': 3}
        },
        'rooms': {
            'room1': {'name': 'Main Hall', 'connections': []},
        }
    }
    
    world = World(test_data)
    
    # Test dict() conversion
    world_dict = dict(world)
    assert 'info' in world_dict
    assert 'characters' in world_dict
    assert 'rooms' in world_dict
    print("[PASS] dict(world) works correctly")
    
    # Test deep copy
    world_copy = copy.deepcopy(dict(world))
    assert world_copy['info'] == test_data['info']
    assert world_copy['characters']['char1']['name'] == 'Alice'
    print("[PASS] copy.deepcopy(dict(world)) works correctly")
    
    # Test character access through wrapper
    char = world.characters['char1']
    assert isinstance(char, Character)
    assert char.name == 'Alice'
    assert char['level'] == 5
    print("[PASS] Character wrapper access works correctly")
    
    # Test dict conversion on nested wrappers
    char_dict = dict(char)
    assert char_dict['name'] == 'Alice'
    assert char_dict['level'] == 5
    print("[PASS] dict(character) works correctly")
    
    # Test room access
    room = world.rooms['room1']
    assert isinstance(room, Room)
    assert room['name'] == 'Main Hall'
    print("[PASS] Room wrapper access works correctly")
    
    # Test dict conversion on room
    room_dict = dict(room)
    assert room_dict['name'] == 'Main Hall'
    assert room_dict['connections'] == []
    print("[PASS] dict(room) works correctly")
    
    # Test that modifications work
    world['new_key'] = 'new_value'
    assert world['new_key'] == 'new_value'
    print("[PASS] Setting new keys works correctly")
    
    # Test get method
    assert world.get('nonexistent', 'default') == 'default'
    print("[PASS] get() method works correctly")
    
    print("\n[SUCCESS] All tests passed! UserDict conversion successful.")

if __name__ == '__main__':
    test_world_dict_conversion()

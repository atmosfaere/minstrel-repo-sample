class Character:
    """Wrapper for character data"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, key: str):
        return self._data[key]
    
    def __setitem__(self, key: str, value: any):
        self._data[key] = value
    
    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)

    @property
    def name(self) -> str:
        return self._data.get('name', '')

    @name.setter
    def name(self, value: str):
        self._data['name'] = value
    

class CharactersDict:
    """Collection wrapper"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, char_id: str) -> Character:
        return Character(self._data[char_id])

    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def __delitem__(self, key: str):
        del self._data[key]

    def __iter__(self):
        return iter(self._data)

    def __len__(self):
        return len(self._data)

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)

    def items(self):
        """Returns an iterator of (char_id, char_dict) tuples"""
        return self._data.items()

    def keys(self):
        """Returns an iterator of character IDs"""
        return self._data.keys()

    def values(self):
        """Returns an iterator of character dicts"""
        return self._data.values()
    
class Location:
    """Wrapper for location data"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, key: str):
        return self._data[key]

    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)

    @property
    def name(self) -> str:
        return self._data.get('name', '')
    @property
    def summary(self) -> str:
        return self._data['summary']

class LocationsDict:
    """Collection wrapper"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, loc_id: str) -> Location:
        return Location(self._data[loc_id])

    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def __delitem__(self, key: str):
        del self._data[key]

    def __iter__(self):
        return iter(self._data)

    def __len__(self):
        return len(self._data)

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)

    def items(self):
        return self._data.items()

    def keys(self):
        """Returns an iterator of location IDs"""
        return self._data.keys()

    def values(self):
        """Returns an iterator of location dicts"""
        return self._data.values()
    
class Room:
    """Wrapper for room data"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, key: str):
        return self._data[key]

    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)
    
class RoomsDict:
    """Collection wrapper"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, room_id: str) -> Room:
        return Room(self._data[room_id])

    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def __delitem__(self, key: str):
        del self._data[key]

    def __iter__(self):
        """Iterate over room IDs"""
        return iter(self._data)

    def __len__(self):
        return len(self._data)

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)

    def items(self):
        """Returns an iterator of (room_id, room_dict) tuples"""
        return self._data.items()

    def keys(self):
        """Returns an iterator of room IDs"""
        return self._data.keys()

    def values(self):
        """Returns an iterator of room dicts"""
        return self._data.values()
    
class User:
    """Wrapper for user data"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, key: str):
        return self._data[key]
    
    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)
    
class UsersDict:
    """Collection wrapper"""
    def __init__(self, data: dict):
        self._data = data

    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, user_id: str) -> User:
        return User(self._data[user_id])

    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def __delitem__(self, key: str):
        del self._data[key]

    def __iter__(self):
        """Iterate over user IDs"""
        return iter(self._data)

    def __len__(self):
        return len(self._data)

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)

    def items(self):
        """Returns an iterator of (user_id, user_dict) tuples"""
        return self._data.items()

    def keys(self):
        """Returns an iterator of user IDs"""
        return self._data.keys()

    def values(self):
        """Returns an iterator of user dicts"""
        return self._data.values()
    
    
class World:
    """World wrapper"""
    def __init__(self, data: dict):
        self._data = data
    
    def __contains__(self, key: str):
        return key in self._data

    def __getitem__(self, key: str):
        return self._data[key]
    
    def __setitem__(self, key: str, value: any):
        self._data[key] = value

    def get(self, key: str, default: any = None):
        return self._data.get(key, default)
    
    def setdefault(self, key: str, default: any = None):
        return self._data.setdefault(key, default)
    
    def __iter__(self):
        return iter(self._data)

    def items(self):
        return self._data.items()

    def keys(self):
        return self._data.keys()

    def values(self):
        return self._data.values()
    
    @property
    def characters(self) -> CharactersDict:
        return CharactersDict(self._data.setdefault('characters', {}))
    
    @property
    def locations(self) -> LocationsDict:
        return LocationsDict(self._data.setdefault('locations', {}))
    
    @property
    def rooms(self) -> RoomsDict:
        return RoomsDict(self._data.setdefault('rooms', {}))
    
    @property
    def users(self) -> UsersDict:
        return UsersDict(self._data.setdefault('users', {}))
    
    @property
    def info(self) -> dict:
        return self._data.get('info', {})
    
    @property
    def page(self) -> dict:
        return self._data.get('page', {})
    

class WorldsDict:
    """Top-level wrapper"""
    def __init__(self, worlds_dict: dict):
        self._worlds = worlds_dict

    def __contains__(self, key: str):
        return key in self._worlds

    def __getitem__(self, world_id: str) -> World:
        return World(self._worlds[world_id])

    def __setitem__(self, key: str, value: any):
        self._worlds[key] = value

    def __delitem__(self, key: str):
        del self._worlds[key]

    def __iter__(self):
        """Iterate over world IDs"""
        return iter(self._worlds)

    def __len__(self):
        return len(self._worlds)

    def get(self, key: str, default: any = None):
        return self._worlds.get(key, default)

    def setdefault(self, key: str, default: any = None):
        return self._worlds.setdefault(key, default)

    def items(self):
        """Returns an iterator of (world_id, world_dict) tuples"""
        return self._worlds.items()

    def keys(self):
        """Returns an iterator of world_ids"""
        return self._worlds.keys()

    def values(self):
        """Returns an iterator of world dicts"""
        return self._worlds.values()
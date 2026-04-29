class DictWrapper:
    """Base class providing a shared dictionary interface for all wrappers."""
    def __init__(self, data: dict):
        self._data = data

    def __getitem__(self, key): return self._data[key]
    def __setitem__(self, key, val): self._data[key] = val
    def __delitem__(self, key): del self._data[key]
    def __contains__(self, key): return key in self._data
    def __iter__(self): return iter(self._data)
    def __len__(self): return len(self._data)
    
    def get(self, key, default=None): return self._data.get(key, default)
    def setdefault(self, key, default=None): return self._data.setdefault(key, default)
    def items(self): return self._data.items()
    def keys(self): return self._data.keys()
    def values(self): return self._data.values()


class Character(DictWrapper):
    @property
    def name(self) -> str:
        return self._data.get('name', '')

    @name.setter
    def name(self, value: str):
        self._data['name'] = value


class CharactersDict(DictWrapper):
    def __getitem__(self, char_id: str) -> Character:
        # Wrap the specific nested dict on-demand for total data accuracy
        return Character(self._data[char_id])


class Location(DictWrapper):
    @property
    def name(self) -> str:
        return self._data.get('name', '')
    
    @property
    def summary(self) -> str:
        return self._data.get('summary', '')


class LocationsDict(DictWrapper):
    def __getitem__(self, loc_id: str) -> Location:
        return Location(self._data[loc_id])


class Room(DictWrapper):
    pass


class RoomsDict(DictWrapper):
    def __getitem__(self, room_id: str) -> Room:
        return Room(self._data[room_id])


class User(DictWrapper):
    pass

class UsersDict(DictWrapper):
    def __getitem__(self, user_id: str) -> User:
        return User(self._data[user_id])


class World(DictWrapper):
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

from dict_wrapper import DictWrapper
from world_settings import SettingsDict
from enum import Enum


class PortalDirection(str, Enum):
    INCOMING = "incoming"
    OUTGOING = "outgoing"


class Character(DictWrapper):
    __slots__ = ()

    @property
    def name(self) -> str:
        return self._data.setdefault('name', '')

    @name.setter
    def name(self, value: str):
        self._data['name'] = value

    @property
    def summary(self) -> str:
        return self._data.setdefault('summary', '')

    @summary.setter
    def summary(self, value: str):
        self._data['summary'] = value

    @property
    def tag(self) -> str:
        return self._data.setdefault('tag', '')

    @tag.setter
    def tag(self, value: str):
        self._data['tag'] = value

    @property
    def type(self) -> str:
        return self._data.setdefault('type', '')
    
    @type.setter
    def type(self, value: str):
        self._data['type'] = value

    @property
    def type_default(self) -> str:
        return self._data.setdefault('type_default', '')
    
    @type_default.setter
    def type_default(self, value: str):
        self._data['type_default'] = value

    @property
    def last_active(self) -> str:
        return self._data.setdefault('last_active', '')

    @last_active.setter
    def last_active(self, value: str):
        self._data['last_active'] = value


class CharactersDict(DictWrapper):
    __slots__ = ()

    def __getitem__(self, char_id: str) -> Character:
        return Character(self._data[char_id])

class Portal(DictWrapper):
    """Represents a specific portal within a location or object (either outgoing or incoming)"""
    __slots__ = ()
    
    @property
    def description(self) -> str:
        return self._data.setdefault('description', '')
    
    @description.setter
    def description(self, value: str):
        self._data['description'] = value
    
    @property
    def destinations(self) -> dict:
        """For outgoing portals: destinations this portal can connect to"""
        return self._data.setdefault('destinations', {})
    
    @destinations.setter
    def destinations(self, value: dict):
        self._data['destinations'] = value
    
    @property
    def whitelisted_portals(self) -> dict:
        """For incoming portals: portals that are allowed to connect to this one"""
        return self._data.setdefault('whitelisted_portals', {})
    
    @whitelisted_portals.setter
    def whitelisted_portals(self, value: dict):
        self._data['whitelisted_portals'] = value
    
    @property
    def whitelisted_worlds(self) -> dict:
        """For incoming portals: worlds that are allowed to connect to this one"""
        return self._data.setdefault('whitelisted_worlds', {})
    
    @whitelisted_worlds.setter
    def whitelisted_worlds(self, value: dict):
        self._data['whitelisted_worlds'] = value
    


class PortalsDirectionDict(DictWrapper):
    """Represents either outgoing or incoming portals for a location or object"""
    __slots__ = ()
    
    def __getitem__(self, portal_id: str) -> Portal:
        return Portal(self._data[portal_id])


class EntityPortalsDict(DictWrapper):
    """Entity-level portals dictionary containing outgoing and incoming portals for both locations and objects"""
    __slots__ = ()
    
    @property
    def outgoing(self) -> PortalsDirectionDict:
        return PortalsDirectionDict(self._data.setdefault('outgoing', {}))
    
    @outgoing.setter
    def outgoing(self, value: dict):
        self._data['outgoing'] = value
    
    @property
    def incoming(self) -> PortalsDirectionDict:
        return PortalsDirectionDict(self._data.setdefault('incoming', {}))
    
    @incoming.setter
    def incoming(self, value: dict):
        self._data['incoming'] = value


class Location(DictWrapper):
    __slots__ = ()

    @property
    def name(self) -> str:
        return self._data.setdefault('name', '')
    
    @property
    def summary(self) -> str:
        return self._data.setdefault('summary', '')

    @property
    def portals(self) -> EntityPortalsDict:
        return EntityPortalsDict(self._data.setdefault('portals', {}))

class LocationsDict(DictWrapper):
    __slots__ = ()

    def __getitem__(self, loc_id: str) -> Location:
        return Location(self._data[loc_id])

class Object(DictWrapper):
    __slots__ = ()
    
    @property
    def name(self) -> str:
        return self._data.setdefault('name', '')
    
    @name.setter
    def name(self, value: str):
        self._data['name'] = value
    
    @property
    def summary(self) -> str:
        return self._data.setdefault('summary', '')

    @summary.setter
    def summary(self, value: str):
        self._data['summary'] = value
    
    @property
    def portals(self) -> EntityPortalsDict:
        return EntityPortalsDict(self._data.setdefault('portals', {}))

class ObjectsDict(DictWrapper):
    __slots__ = ()
    
    def __getitem__(self, obj_id: str) -> Object:
        return Object(self._data[obj_id])


class Room(DictWrapper):
    __slots__ = ()
    #characters, connections, conversation, conversation_text, users, adventure_summary, travel_history, party_members, streaming
    @property
    def characters(self) -> list:
        return self._data.setdefault('characters', [])

    @characters.setter
    def characters(self, value: list):
        self._data['characters'] = value

    @property
    def connections(self) -> list:
        return self._data.setdefault('connections', [])
    
    @connections.setter
    def connections(self, value: list):
        self._data['connections'] = value
    
    @property
    def conversation(self) -> list:
        return self._data.setdefault('conversation', [])
    
    @conversation.setter
    def conversation(self, value: list):
        self._data['conversation'] = value
    
    @property
    def conversation_text(self) -> str:
        return self._data.setdefault('conversation_text', '')

    @conversation_text.setter
    def conversation_text(self, value: str):
        self._data['conversation_text'] = value

    @property
    def current_stream_text(self) -> str:
        return self._data.setdefault('currently_streaming', '')
    
    @current_stream_text.setter
    def current_stream_text(self, value: str):
        self._data['currently_streaming'] = value

    @property
    def streaming(self) -> bool:
        return self._data.setdefault('streaming', False)
    
    @streaming.setter
    def streaming(self, value: bool):
        self._data['streaming'] = value
    
    @property
    def users(self) -> list:
        return self._data.setdefault('users', [])
    
    @users.setter
    def users(self, value: list):
        self._data['users'] = value
    
    @property
    def adventure_summary(self) -> str:
        return self._data.setdefault('adventure_summary', '')
    
    @adventure_summary.setter
    def adventure_summary(self, value: str):
        self._data['adventure_summary'] = value
    
    @property
    def travel_history(self) -> str:
        return self._data.setdefault('travel_history', '')

    @travel_history.setter
    def travel_history(self, value: str):
        self._data['travel_history'] = value
    
    @property
    def active_users(self) -> list:
        return self._data.setdefault('active_users', [])

    @active_users.setter
    def active_users(self, value: list):
        self._data['active_users'] = value

    @property
    def last_active(self) -> str:
        return self._data.setdefault('last_active', '')
    
    @last_active.setter
    def last_active(self, value: str):
        self._data['last_active'] = value

    @property
    def world_portal_data(self, value: dict):
        return self._data.setdefault('world_portal_data', {})
    
    @world_portal_data.setter
    def world_portal_data(self, value: dict):
        self._data['world_portal_data'] = value
    
class RoomsDict(DictWrapper):
    __slots__ = ()

    def __getitem__(self, room_id: str) -> Room:
        #return Room(self._data.setdefault(room_id, {}))
        return Room(self._data[room_id])


class User(DictWrapper):
    __slots__ = ()


class UsersDict(DictWrapper):
    __slots__ = ()

    def __getitem__(self, user_id: str) -> User:
        return User(self._data[user_id])


class PartyPositionsLocation(DictWrapper):
    __slots__ = ()

    def __getitem__(self, location_id: str) -> list:
        return list(self._data[location_id])

class PartyPositions(DictWrapper):
    __slots__ = ()
    
    @property
    def parties(self) -> dict:
        return self._data.setdefault('parties', {})
    
    @parties.setter
    def parties(self, value: dict):
        self._data['parties'] = value
    
    @property
    def locations(self) -> PartyPositionsLocation:
        return PartyPositionsLocation(self._data.setdefault('locations', {}))
    
    @locations.setter
    def locations(self, value: dict):
        self._data['locations'] = value


class WorldPortal(DictWrapper):
    __slots__ = ()
    
    @property
    def id(self) -> str:
        return self._data.setdefault('id', '')
    
    @id.setter
    def id(self, value: str):
        self._data['id'] = value

    @property
    def portal_type(self) -> str:
        return self._data.setdefault('portal_type', '')
    
    @portal_type.setter
    def portal_type(self, value: str):
        self._data['portal_type'] = value

    @property
    def portal_direction(self) -> PortalDirection:
        return PortalDirection(self._data.setdefault('portal_direction', PortalDirection.OUTGOING))
    
    @portal_direction.setter
    def portal_direction(self, value: PortalDirection):
        if isinstance(value, PortalDirection):
            self._data['portal_direction'] = value.value
        else:
            # Validate that value is a valid option
            PortalDirection(value)
            self._data['portal_direction'] = value
    
    @property
    def location_id(self) -> str:
        return self._data.setdefault('location_id', '')
    
    @location_id.setter
    def location_id(self, value: str):
        self._data['location_id'] = value
    
    @property
    def creator_id(self) -> str:
        return self._data.setdefault('creator_id', '')
    
    @creator_id.setter
    def creator_id(self, value: str):
        self._data['creator_id'] = value
    

class WorldPortals(DictWrapper):
    __slots__ = ()
    
    def __getitem__(self, portal_id: str) -> WorldPortal:
        return WorldPortal(self._data[portal_id])

class World(DictWrapper):
    __slots__ = ('_characters_cache', '_locations_cache', '_objects_cache', '_rooms_cache', '_users_cache', '_settings_cache')
    
    def __init__(self, data: dict):
        super().__init__(data)
        self._characters_cache = None
        self._locations_cache = None
        self._objects_cache = None
        self._rooms_cache = None
        self._users_cache = None
        self._settings_cache = None

    @property
    def characters(self) -> CharactersDict:
        if self._characters_cache is None:
            self._characters_cache = CharactersDict(self._data.setdefault('characters', {}))
        return self._characters_cache
    
    @property
    def locations(self) -> LocationsDict:
        if self._locations_cache is None:
            self._locations_cache = LocationsDict(self._data.setdefault('locations', {}))
        return self._locations_cache

    @property
    def objects(self) -> ObjectsDict:
        if self._objects_cache is None:
            self._objects_cache = ObjectsDict(self._data.setdefault('objects', {}))
        return self._objects_cache
    
    @property
    def rooms(self) -> RoomsDict:
        if self._rooms_cache is None:
            self._rooms_cache = RoomsDict(self._data.setdefault('rooms', {}))
        return self._rooms_cache
    
    @property
    def users(self) -> UsersDict:
        if self._users_cache is None:
            self._users_cache = UsersDict(self._data.setdefault('users', {}))
        return self._users_cache
    
    @property
    def info(self) -> str:
        return self._data.setdefault('info', '')
    
    @info.setter
    def info(self, value):
        self._data['info'] = value
    
    @property
    def page(self) -> dict:
        return self._data.setdefault('page', {})
    
    @property
    def main_party_id(self) -> str:
        return self._data.get('main_party_id', '')

    @main_party_id.setter
    def main_party_id(self, value: str):
        self._data['main_party_id'] = value

    @property
    def simulated_characters(self) -> dict:
        return self._data.setdefault('simulated_characters', {})
    
    @simulated_characters.setter
    def simulated_characters(self, value: dict):
        self._data['simulated_characters'] = value

    @property
    def tags(self) -> dict:
        return self._data.setdefault('tags', {})
    
    @tags.setter
    def tags(self, value: dict):
        self._data['tags'] = value
        
    @property
    def settings(self):
        if self._settings_cache is None:
            self._settings_cache = SettingsDict(self._data.setdefault('settings', {}))
        return self._settings_cache
    
    @settings.setter
    def settings(self, value: dict):
        self._data['settings'] = value
        #self._settings_cache = None

    @property
    def party_positions(self) -> PartyPositions:
        return PartyPositions(self._data.setdefault('party_positions', {}))
    
    @party_positions.setter
    def party_positions(self, value: dict):
        self._data['party_positions'] = value


class WorldsDict(DictWrapper):
    """Top-level wrapper for all worlds"""
    __slots__ = ('_world_caches',)
    
    def __init__(self, data: dict):
        super().__init__(data)
        #self._world_caches = {}
        self._world_caches: dict[str, World] = {}
    
    def __getitem__(self, world_id: str) -> World:
        if world_id not in self._world_caches:
            self._world_caches[world_id] = World(self._data[world_id])
        return self._world_caches[world_id]
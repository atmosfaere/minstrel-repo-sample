from dict_wrapper import DictWrapper
from enum import Enum


# World Settings Enums
class AddPlayerOption(str, Enum):
    MAIN_PARTY = "main_party"
    SOLO_PARTY = "solo_party"

class MultiplayerOption(str, Enum):
    PARTY_ONLY = "party_only"
    FREE_FOR_ALL = "free_for_all"

class BooleanOption(str, Enum):
    TRUE = "true"
    FALSE = "false"

class EntryOriginsOption(str, Enum):
    ALL = "all"
    SELECTED = "selected"
    NONE = "none"

class DestinationWorldsOption(str, Enum):
    ALL = "all"
    SELECTED = "selected"
    NONE = "none"

class WorldBuildingOption(str, Enum):
    EDIT = "edit"
    VIEW = "view"
    VIEW_DESCRIPTIONS = "view_descriptions"
    NONE = "none"

class ViewEntriesOption(str, Enum):
    ALL = "all"
    ENCOUNTERED = "encountered"

class CreatePortalsOption(str, Enum):
    TRUE = "true"
    OWNED_LOCATIONS = "owned_locations"
    FALSE = "false"

class SetSimulationOption(str, Enum):
    ALL = "all"
    DISCOVERED = "discovered"
    NONE = "none"

class OwnedLocationsOption(str, Enum):
    DISCOVERED = "discovered"
    NONE = "none"


class WorldSettings(DictWrapper):
    """Wrapper class for world_settings dictionary containing individual world settings."""
    __slots__ = ()

    @property
    def start_party(self) -> AddPlayerOption:
        """If option set true include party in world link"""
        return AddPlayerOption(self._data.setdefault('start_party', AddPlayerOption.MAIN_PARTY))
        
    @start_party.setter
    def start_party(self, value: AddPlayerOption):
        if isinstance(value, AddPlayerOption):
            self._data['start_party'] = value.value
        else:
            # Validate that value is a valid option
            AddPlayerOption(value)
            self._data['start_party'] = value
        
    @property
    def multiplayer(self) -> MultiplayerOption:
        return MultiplayerOption(self._data.setdefault('multiplayer', MultiplayerOption.FREE_FOR_ALL))
        
    @multiplayer.setter
    def multiplayer(self, value: MultiplayerOption):
        if isinstance(value, MultiplayerOption):
            self._data['multiplayer'] = value.value
        else:
            # Validate that value is a valid option
            MultiplayerOption(value)
            self._data['multiplayer'] = value
        
    @property
    def portals(self) -> BooleanOption:
        return BooleanOption(self._data.setdefault('portals', BooleanOption.TRUE))
        
    @portals.setter
    def portals(self, value: BooleanOption):
        if isinstance(value, BooleanOption):
            self._data['portals'] = value.value
        else:
            # Validate that value is a valid option
            BooleanOption(value)
            self._data['portals'] = value
        
    @property
    def world_entry_origins(self) -> EntryOriginsOption:
        return EntryOriginsOption(self._data.setdefault('world_entry_origins', EntryOriginsOption.SELECTED))
        
    @world_entry_origins.setter
    def world_entry_origins(self, value: EntryOriginsOption):
        if isinstance(value, EntryOriginsOption):
            self._data['world_entry_origins'] = value.value
        else:
            # Validate that value is a valid option
            EntryOriginsOption(value)
            self._data['world_entry_origins'] = value
        
    @property
    def destination_worlds(self) -> DestinationWorldsOption:
        return DestinationWorldsOption(self._data.setdefault('destination_worlds', DestinationWorldsOption.ALL))
        
    @destination_worlds.setter
    def destination_worlds(self, value: DestinationWorldsOption):
        if isinstance(value, DestinationWorldsOption):
            self._data['destination_worlds'] = value.value
        else:
            # Validate that value is a valid option
            DestinationWorldsOption(value)
            self._data['destination_worlds'] = value
        
    @property
    def simulation(self) -> BooleanOption:
        return BooleanOption(self._data.setdefault('simulation', BooleanOption.TRUE))
        
    @simulation.setter
    def simulation(self, value: BooleanOption):
        if isinstance(value, BooleanOption):
            self._data['simulation'] = value.value
        else:
            # Validate that value is a valid option
            BooleanOption(value)
            self._data['simulation'] = value
        
    @property
    def public(self) -> BooleanOption:
        return BooleanOption(self._data.setdefault('public', BooleanOption.FALSE))
        
    @public.setter
    def public(self, value: BooleanOption):
        if isinstance(value, BooleanOption):
            self._data['public'] = value.value
        else:
            # Validate that value is a valid option
            BooleanOption(value)
            self._data['public'] = value


class PlayerSettings(DictWrapper):
    """Wrapper class for player_settings dictionary containing individual player settings."""
    __slots__ = ()

    @property
    def world_building(self) -> WorldBuildingOption:
        return WorldBuildingOption(self._data.setdefault('world_building', WorldBuildingOption.EDIT))
        
    @world_building.setter
    def world_building(self, value: WorldBuildingOption):
        if isinstance(value, WorldBuildingOption):
            self._data['world_building'] = value.value
        else:
            # Validate that value is a valid option
            WorldBuildingOption(value)
            self._data['world_building'] = value
        
    @property
    def view_entries(self) -> ViewEntriesOption:
        return ViewEntriesOption(self._data.setdefault('view_entries', ViewEntriesOption.ALL))
        
    @view_entries.setter
    def view_entries(self, value: ViewEntriesOption):
        if isinstance(value, ViewEntriesOption):
            self._data['view_entries'] = value.value
        else:
            # Validate that value is a valid option
            ViewEntriesOption(value)
            self._data['view_entries'] = value
        
    @property
    def discover_new_locations(self) -> BooleanOption:
        return BooleanOption(self._data.setdefault('discover_new_locations', BooleanOption.TRUE))
        
    @discover_new_locations.setter
    def discover_new_locations(self, value: BooleanOption):
        if isinstance(value, BooleanOption):
            self._data['discover_new_locations'] = value.value
        else:
            # Validate that value is a valid option
            BooleanOption(value)
            self._data['discover_new_locations'] = value
        
    @property
    def discover_new_characters(self) -> BooleanOption:
        return BooleanOption(self._data.setdefault('discover_new_characters', BooleanOption.TRUE))
        
    @discover_new_characters.setter
    def discover_new_characters(self, value: BooleanOption):
        if isinstance(value, BooleanOption):
            self._data['discover_new_characters'] = value.value
        else:
            # Validate that value is a valid option
            BooleanOption(value)
            self._data['discover_new_characters'] = value
        
    @property
    def create_portals(self) -> CreatePortalsOption:
        return CreatePortalsOption(self._data.setdefault('create_portals', CreatePortalsOption.TRUE))
        
    @create_portals.setter
    def create_portals(self, value: CreatePortalsOption):
        if isinstance(value, CreatePortalsOption):
            self._data['create_portals'] = value.value
        else:
            # Validate that value is a valid option
            CreatePortalsOption(value)
            self._data['create_portals'] = value
        
    @property
    def incoming_worlds(self) -> EntryOriginsOption:
        return EntryOriginsOption(self._data.setdefault('incoming_worlds', EntryOriginsOption.SELECTED))
        
    @incoming_worlds.setter
    def incoming_worlds(self, value: EntryOriginsOption):
        if isinstance(value, EntryOriginsOption):
            self._data['incoming_worlds'] = value.value
        else:
            # Validate that value is a valid option
            EntryOriginsOption(value)
            self._data['incoming_worlds'] = value
        
    @property
    def destination_worlds(self) -> DestinationWorldsOption:
        return DestinationWorldsOption(self._data.setdefault('destination_worlds', DestinationWorldsOption.ALL))
        
    @destination_worlds.setter
    def destination_worlds(self, value: DestinationWorldsOption):
        if isinstance(value, DestinationWorldsOption):
            self._data['destination_worlds'] = value.value
        else:
            # Validate that value is a valid option
            DestinationWorldsOption(value)
            self._data['destination_worlds'] = value
        
    @property
    def copy_world(self) -> BooleanOption:
        return BooleanOption(self._data.setdefault('copy_world', BooleanOption.TRUE))
        
    @copy_world.setter
    def copy_world(self, value: BooleanOption):
        if isinstance(value, BooleanOption):
            self._data['copy_world'] = value.value
        else:
            # Validate that value is a valid option
            BooleanOption(value)
            self._data['copy_world'] = value
        
    @property
    def set_simulation(self) -> SetSimulationOption:
        return SetSimulationOption(self._data.setdefault('set_simulation', SetSimulationOption.DISCOVERED))
        
    @set_simulation.setter
    def set_simulation(self, value: SetSimulationOption):
        if isinstance(value, SetSimulationOption):
            self._data['set_simulation'] = value.value
        else:
            # Validate that value is a valid option
            SetSimulationOption(value)
            self._data['set_simulation'] = value
        
    @property
    def owned_locations(self) -> OwnedLocationsOption:
        return OwnedLocationsOption(self._data.setdefault('owned_locations', OwnedLocationsOption.DISCOVERED))
        
    @owned_locations.setter
    def owned_locations(self, value: OwnedLocationsOption):
        if isinstance(value, OwnedLocationsOption):
            self._data['owned_locations'] = value.value
        else:
            # Validate that value is a valid option
            OwnedLocationsOption(value)
            self._data['owned_locations'] = value


class SettingsDict(DictWrapper):
    """Wrapper class for the top-level settings dictionary containing world_settings and player_settings."""
    __slots__ = ()

    @property
    def world_settings(self) -> WorldSettings:
        """Get world settings dict wrapper"""
        return WorldSettings(self._data.setdefault('world_settings', {}))
    
    @world_settings.setter
    def world_settings(self, value: dict):
        self._data['world_settings'] = value
        
    @property
    def player_settings(self) -> PlayerSettings:
        """Get player settings dict wrapper"""
        return PlayerSettings(self._data.setdefault('player_settings', {}))
        
    @player_settings.setter
    def player_settings(self, value: dict):
        self._data['player_settings'] = value
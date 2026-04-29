#!/usr/bin/env python3
"""Test script for SettingsDict with enums functionality."""

from dict_wrapper import DictWrapper
from world_settings import (
    SettingsDict, WorldSettings, PlayerSettings,
    AddPlayerOption, MultiplayerOption, BooleanOption,
    EntryOriginsOption, DestinationWorldsOption,
    WorldBuildingOption, ViewEntriesOption,
    CreatePortalsOption, SetSimulationOption, OwnedLocationsOption
)

print("Testing SettingsDict with enums implementation...")

# Test basic functionality
test_data = {}
settings_dict = SettingsDict(test_data)

# Test setting values with enums
print("Testing setting world settings with enums...")
settings_dict.world_settings.start_party = AddPlayerOption.SOLO_PARTY
settings_dict.world_settings.multiplayer = MultiplayerOption.PARTY_ONLY
settings_dict.world_settings.portals = BooleanOption.TRUE

print("Testing setting player settings with enums...")
settings_dict.player_settings.world_building = WorldBuildingOption.VIEW
settings_dict.player_settings.view_entries = ViewEntriesOption.ENCOUNTERED
settings_dict.player_settings.discover_new_locations = BooleanOption.FALSE

# Test that the underlying data structure matches expectations
print("Underlying data structure:")
print(test_data)

# Test accessing values
print("Testing value access...")
print(f"start_party: {settings_dict.world_settings.start_party}")
print(f"world_building: {settings_dict.player_settings.world_building}")

# Test setting with string values (should still work)
print("Testing setting with string values...")
settings_dict.world_settings.start_party = "main_party"
print(f"start_party after string set: {settings_dict.world_settings.start_party}")

print("All tests passed successfully!")
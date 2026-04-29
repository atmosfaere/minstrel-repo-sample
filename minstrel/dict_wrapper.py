class DictWrapper:
    """Base class providing a shared dictionary interface for all wrappers."""
    __slots__ = ('_data',)

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
    def pop(self, key, default=None): return self._data.pop(key, default)
    def items(self): return self._data.items()
    def keys(self): return self._data.keys()
    def values(self): return self._data.values()
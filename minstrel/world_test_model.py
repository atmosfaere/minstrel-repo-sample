from data_store import worlds

world = "test_world"

worlds.setdefault(world, {})

worlds[world].rooms.setdefault("123", {})
worlds[world].rooms["123"].setdefault("characters", [])
worlds[world].rooms["123"].characters.append("456")
#room characters property setter
worlds[world].rooms["123"].characters = ["457"]

print(worlds[world]['rooms']['123']['characters'])
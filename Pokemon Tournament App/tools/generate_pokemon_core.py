
import json
import requests
import time

OUTPUT_FILE = "pokemon-core.json"

def get_pokemon(id):
    url = f"https://pokeapi.co/api/v2/pokemon/{id}"
    r = requests.get(url)
    r.raise_for_status()
    data = r.json()

    name = data["name"].capitalize()

    types = [t["type"]["name"].capitalize() for t in data["types"]]

    stats = { s["stat"]["name"]: s["base_stat"] for s in data["stats"] }

    return {
        "number": id,
        "name": name,
        "types": types,
        "baseStats": {
            "hp": stats.get("hp"),
            "attack": stats.get("attack"),
            "defense": stats.get("defense"),
            "spAttack": stats.get("special-attack"),
            "spDefense": stats.get("special-defense"),
            "speed": stats.get("speed")
        }
    }

pokemon_list = []

for i in range(1, 387):
    print(f"Fetching Pokémon {i}")
    pokemon_list.append(get_pokemon(i))
    time.sleep(0.2)

with open(OUTPUT_FILE, "w") as f:
    json.dump(pokemon_list, f, indent=2)

print("Done! File written to pokemon-core.json")

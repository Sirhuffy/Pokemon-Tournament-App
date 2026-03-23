import requests
import json
import time

OUTPUT_FILE = "learnsets.json"

def get_learnset(pokemon_id):
    url = f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}"
    r = requests.get(url)

    if r.status_code != 200:
        return None

    data = r.json()
    name = data["name"].capitalize()

    learnset = {
        "gold-silver": [],
        "crystal": [],
        "ruby-sapphire": [],
        "emerald": [],
        "firered-leafgreen": []
    }

    for m in data["moves"]:
        move_name = m["move"]["name"].replace("-", " ").title()

        for detail in m["version_group_details"]:
            method = detail["move_learn_method"]["name"]
            level = detail["level_learned_at"]
            version = detail["version_group"]["name"]

            if method != "level-up":
                continue

            if version in learnset:
                learnset[version].append({
                    "level": level,
                    "move": move_name
                })

    # Sort each version by level
    for key in learnset:
        learnset[key] = sorted(learnset[key], key=lambda x: x["level"])

    return {
        "pokemon": name,
        "learnset": learnset
    }


learnsets = []

for i in range(1, 387):
    print(f"Fetching learnset for Pokémon {i}")

    entry = get_learnset(i)

    if entry:
        learnsets.append(entry)

    time.sleep(0.15)

with open(OUTPUT_FILE, "w") as f:
    json.dump(learnsets, f, indent=2)

print("Tagged learnset database complete.")
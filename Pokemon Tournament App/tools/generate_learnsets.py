
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

    moves = []

    for m in data["moves"]:
        move_name = m["move"]["name"].replace("-", " ").title()

        for detail in m["version_group_details"]:
            method = detail["move_learn_method"]["name"]
            level = detail["level_learned_at"]

            if method == "level-up":
                moves.append({
                    "level": level,
                    "move": move_name
                })

    moves = sorted(moves, key=lambda x: x["level"])

    return {
        "pokemon": name,
        "moves": moves
    }


learnsets = []

for i in range(1, 387):

    print(f"Fetching learnset for Pokemon {i}")

    entry = get_learnset(i)

    if entry:
        learnsets.append(entry)

    time.sleep(0.15)


with open(OUTPUT_FILE, "w") as f:
    json.dump(learnsets, f, indent=2)

print("Learnset database complete.")

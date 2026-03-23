import requests
import json
import time

OUTPUT_FILE = "moves.json"

physical_types = [
"Normal","Fighting","Flying","Ground","Rock","Bug","Ghost","Steel","Poison"
]

def get_move(id):

    url = f"https://pokeapi.co/api/v2/move/{id}"
    r = requests.get(url)

    if r.status_code != 200:
        return None

    data = r.json()

    name = data["name"].replace("-", " ").title()

    type_name = data["type"]["name"].capitalize()

    category = "Physical" if type_name in physical_types else "Special"

    if data["power"] is None:
        category = "Status"

    effect = data["effect_entries"]

    effect_text = ""

    for entry in effect:
        if entry["language"]["name"] == "en":
            effect_text = entry["short_effect"]
            break

    return {
        "name": name,
        "type": type_name,
        "category": category,
        "power": data["power"],
        "accuracy": data["accuracy"],
        "pp": data["pp"],
        "effect": effect_text
    }


moves = []

for i in range(1, 355):

    print(f"Fetching move {i}")

    move = get_move(i)

    if move:
        moves.append(move)

    time.sleep(0.15)

with open(OUTPUT_FILE,"w") as f:
    json.dump(moves,f,indent=2)

print("Move database complete.")
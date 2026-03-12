function changeGame() {

currentGame = document.getElementById("gameSelect").value
loadGameData()

}

function changeLevelCap() {

levelCap = document.getElementById("levelCap").value

}

async function loadGameData() {

const response = await fetch(`data/${currentGame}/pokemon.json`)
gameData.pokemon = await response.json()

console.log("Loaded game:", currentGame)

}

loadGameData()

function openPage(page) {

const content = document.getElementById("content");

if (page === "pokedex") {
content.innerHTML = "<h2>Pokedex</h2><input placeholder='Search Pokemon'>";
}

if (page === "team") {
content.innerHTML = "<h2>Team Planner</h2>";
}

if (page === "moves") {

let html = "<h2>Move Lookup</h2>"
html += "<input id='moveSearch' placeholder='Search move'>"

content.innerHTML = html

}

if (page === "items") {
content.innerHTML = "<h2>Item Locations</h2>";
}

if (page === "maps") {
content.innerHTML = "<h2>Maps</h2>";
}

if (page === "weakness") {
content.innerHTML = "<h2>Weakness Calculator</h2>";
}

}

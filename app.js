function openPage(page) {

const content = document.getElementById("content");

if (page === "pokedex") {
content.innerHTML = "<h2>Pokedex</h2><input placeholder='Search Pokemon'>";
}

if (page === "team") {
content.innerHTML = "<h2>Team Planner</h2>";
}

if (page === "moves") {
content.innerHTML = "<h2>Move Lookup</h2>";
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
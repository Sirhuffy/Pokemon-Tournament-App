// ==========================
// INITIAL STATE
// ==========================
let currentGame = "gsc"
let levelCap = 55
let gameData = { pokemon: [], moves: [], learnsets: [] }
let selectedType = null
let selectedSort = "bst"
let team = []



const typeChart = {
    Normal: { weakTo: ["Fighting"], resists: [], immuneTo: ["Ghost"] },
    Fire: { weakTo: ["Water","Ground","Rock"], resists: ["Fire","Grass","Ice","Bug","Steel"], immuneTo: [] },
    Water: { weakTo: ["Electric","Grass"], resists: ["Fire","Water","Ice","Steel"], immuneTo: [] },
    Grass: { weakTo: ["Fire","Ice","Poison","Flying","Bug"], resists: ["Water","Electric","Grass","Ground"], immuneTo: [] },
    Electric: { weakTo: ["Ground"], resists: ["Electric","Flying","Steel"], immuneTo: [] },
    Ice: { weakTo: ["Fire","Fighting","Rock","Steel"], resists: ["Ice"], immuneTo: [] },
    Fighting: { weakTo: ["Flying","Psychic"], resists: ["Bug","Rock","Dark"], immuneTo: [] },
    Poison: { weakTo: ["Ground","Psychic"], resists: ["Grass","Fighting","Poison","Bug"], immuneTo: [] },
    Ground: { weakTo: ["Water","Grass","Ice"], resists: ["Poison","Rock"], immuneTo: ["Electric"] },
    Flying: { weakTo: ["Electric","Ice","Rock"], resists: ["Grass","Fighting","Bug"], immuneTo: ["Ground"] },
    Psychic: { weakTo: ["Bug","Ghost","Dark"], resists: ["Fighting","Psychic"], immuneTo: [] },
    Bug: { weakTo: ["Fire","Flying","Rock"], resists: ["Grass","Fighting","Ground"], immuneTo: [] },
    Rock: { weakTo: ["Water","Grass","Fighting","Ground","Steel"], resists: ["Normal","Fire","Poison","Flying"], immuneTo: [] },
    Ghost: { weakTo: ["Ghost","Dark"], resists: ["Poison","Bug"], immuneTo: ["Normal","Fighting"] },
    Dragon: { weakTo: ["Ice","Dragon"], resists: ["Fire","Water","Electric","Grass"], immuneTo: [] },
    Dark: { weakTo: ["Fighting","Bug"], resists: ["Ghost","Dark"], immuneTo: ["Psychic"] },
    Steel: { weakTo: ["Fire","Fighting","Ground"], resists: ["Normal","Grass","Ice","Flying","Psychic","Bug","Rock","Dragon","Steel"], immuneTo: ["Poison"] }
}



// ==========================
// CORE DATA LOADING
// ==========================

// This function ensures all files are loaded before the app starts
async function initApp() {
    try {
        await Promise.all([
            loadGameData(),
            loadMoveData(),
            loadLearnsets()
        ]);
        console.log("All data loaded successfully!");
    } catch (error) {
        console.error("Error loading JSON files. Check your file paths!", error);
    }
}

async function loadGameData() {
    const response = await fetch("data/pokemon-core.json");
    gameData.pokemon = await response.json();
}

async function loadMoveData() {
    const response = await fetch("data/moves.json");
    gameData.moves = await response.json();
}

async function loadLearnsets() {
    const response = await fetch("data/learnsets.json");
    gameData.learnsets = await response.json();
}

// Start the loading process immediately
initApp();

// ==========================
// GAME + LEVEL SETTINGS
// ==========================

function changeGame() {
    currentGame = document.getElementById("gameSelect").value;
    loadGameData();
}

function changeLevelCap() {
    levelCap = document.getElementById("levelCap").value;
}

function getGameKey() {
    if (currentGame === "gsc") return "crystal";
    if (currentGame === "rse") return "emerald";
    if (currentGame === "frlg") return "firered-leafgreen";
    return "crystal";
}

// ==========================
// PAGE NAVIGATION
// ==========================

function openPage(page) {
    const content = document.getElementById("content");

    // Safety: If data isn't loaded yet, show a message
    if (!gameData.pokemon || gameData.pokemon.length === 0) {
        content.innerHTML = "<h2>Loading Data...</h2><p>Please wait a moment for the Pokedex to download.</p>";
        return;
    }

    if (page === "pokedex") {
        let html = "<h2>Pokedex</h2>";
        html += "<input id='pokeSearch' placeholder='Search Pokemon'>";
        html += `
            <select id="sortSelect" onchange="changeSort()">
                <option value="bst">Total Stats</option>
                <option value="attack">Attack</option>
                <option value="defense">Defense</option>
                <option value="spAttack">Sp. Attack</option>
                <option value="spDefense">Sp. Defense</option>
                <option value="speed">Speed</option>
            </select>`;

        const types = ["Normal","Fire","Water","Grass","Electric","Ice","Fighting","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel"];
        html += "<div id='typeButtons'>";
        types.forEach(t => {
            html += `<button onclick="filterByType('${t}')">${t}</button>`;
        });
        html += `<button onclick="clearTypeFilter()">All</button></div>`;
        html += "<div id='pokeResults'></div>";

        content.innerHTML = html;
        document.getElementById("pokeSearch").addEventListener("input", updateResults);
        updateResults();
    } 
    
else if (page === "team") {

    let html = "<h2>Team Builder</h2>"

    html += "<input id='teamSearch' placeholder='Search Pokemon'>"

    html += "<div id='teamSearchResults'></div>"

    html += "<h3>Your Team</h3>"
    html += "<div id='teamDisplay'></div>"

    content.innerHTML = html

    document.getElementById("teamSearch").addEventListener("input", updateTeamSearch)

    updateTeamDisplay()


}

    else if (page === "moves") {
        let html = "<h2>Move Lookup</h2>";
        html += "<input id='moveSearch' placeholder='Search move'>";
        html += "<div id='moveResults'></div>";
        content.innerHTML = html;
        document.getElementById("moveSearch").addEventListener("input", updateMoveResults);
        updateMoveResults();
    } 
    else if (page === "items") {
        content.innerHTML = "<h2>Item Locations</h2>";
    } 
    else if (page === "maps") {
        content.innerHTML = "<h2>Maps</h2>";
    } 
    else if (page === "weakness") {
        content.innerHTML = "<h2>Weakness Calculator</h2>";
    }
}

// ==========================
// RESULTS & DISPLAY
// ==========================

function updateResults() {
    const query = document.getElementById("pokeSearch")?.value?.toLowerCase() || "";
    let results = [...gameData.pokemon];

    if (query) {
        results = results.filter(p => p.name.toLowerCase().includes(query));
    }

    if (selectedType) {
        results = results.filter(p => p.types.includes(selectedType));
    }

    results.sort((a, b) => {
        if (selectedSort === "bst") {
            const totalA = Object.values(a.baseStats).reduce((sum, val) => sum + val, 0);
            const totalB = Object.values(b.baseStats).reduce((sum, val) => sum + val, 0);
            return totalB - totalA;
        }
        return b.baseStats[selectedSort] - a.baseStats[selectedSort];
    });

    let html = "";
    results.slice(0, 50).forEach(p => {
        const total = Object.values(p.baseStats).reduce((sum, val) => sum + val, 0);
        html += `
            <div class="poke-entry" onclick="showPokemon('${p.name}')" style="cursor:pointer; border-bottom:1px solid #ccc; padding:5px;">
                <strong>${p.name}</strong> (${p.types.join("/")}) - ${selectedSort === "bst" ? total : p.baseStats[selectedSort]}
            </div>`;
    });
    document.getElementById("pokeResults").innerHTML = html;
}

function showPokemon(name) {
    const pokemon = gameData.pokemon.find(p => p.name === name);
    if (!pokemon) return;

    const moves = getMovesForLevel(name);
    let html = `<h2>${pokemon.name}</h2>`;
    html += `<p><strong>Type:</strong> ${pokemon.types.join(", ")}</p>`;
    html += "<h3>Stats</h3>";
    html += `<p>HP: ${pokemon.baseStats.hp} | Atk: ${pokemon.baseStats.attack} | Def: ${pokemon.baseStats.defense} | SpA: ${pokemon.baseStats.spAttack} | SpD: ${pokemon.baseStats.spDefense} | Spe: ${pokemon.baseStats.speed}</p>`;
    
    html += "<h3>Moves (by level)</h3>";
    moves.forEach(m => {
        html += `<div>Lv ${m.level}: ${m.move}</div>`;
    });
    html += `<br><button onclick="openPage('pokedex')">Back to List</button>`;

    document.getElementById("content").innerHTML = html;
}



// ==========================
// HELPER FUNCTIONS
// ==========================

function filterByType(type) {
    selectedType = type;
    updateResults();
}

function clearTypeFilter() {
    selectedType = null;
    updateResults();
}

function changeSort() {
    selectedSort = document.getElementById("sortSelect").value;
    updateResults();
}

function updateMoveResults() {
    const query = document.getElementById("moveSearch")?.value?.toLowerCase() || "";
    let results = gameData.moves;

    if (query) {
        results = results.filter(m => m.name.toLowerCase().includes(query));
    }

    let html = "";
    results.slice(0, 50).forEach(m => {
        html += `<div onclick="showMove('${m.name}')" style="cursor:pointer; padding:5px;">${m.name}</div>`;
    });
    document.getElementById("moveResults").innerHTML = html;
}

function showMove(name) {
    const move = gameData.moves.find(m => m.name === name);
    if (!move) return;

    let html = `<h2>${move.name}</h2>`;
    html += `<p><strong>Type:</strong> ${move.type}</p>`;
    html += `<p><strong>Category:</strong> ${move.category}</p>`;
    html += `<p><strong>Power:</strong> ${move.power || "-"}</p>`;
    html += `<p><strong>Accuracy:</strong> ${move.accuracy || "-"}</p>`;
    html += `<p><strong>PP:</strong> ${move.pp}</p>`;
    html += `<p><strong>Effect:</strong> ${move.effect}</p>`;
    html += `<button onclick="openPage('moves')">Back to Search</button>`;

    document.getElementById("content").innerHTML = html;
}

function getLearnset(pokemonName) {
    const gameKey = getGameKey();
    const entry = gameData.learnsets.find(p => p.pokemon === pokemonName);
    if (!entry) return [];
    return entry.learnset[gameKey] || [];
}

function getMovesForLevel(pokemonName) {
    const moves = getLearnset(pokemonName);
    return moves.filter(m => m.level <= levelCap);
}

function updateTeamSearch() {

    const query = document.getElementById("teamSearch")?.value?.toLowerCase() || ""

    let results = gameData.pokemon

    if (query) {
        results = results.filter(p =>
            p.name.toLowerCase().includes(query)
        )
    }

    let html = ""

    results.slice(0, 20).forEach(p => {
        html += `
        <div onclick="addToTeam('${p.name}')" style="cursor:pointer;">
            ${p.name} (${p.types.join("/")})
        </div>
        `
    })

    document.getElementById("teamSearchResults").innerHTML = html
}

function addToTeam(name) {

    if (team.length >= 6) {
        alert("Team is full (max 6)")
        return
    }

    if (team.includes(name)) {
        alert("Already in team")
        return
    }

    team.push(name)
    updateTeamDisplay()
}

function removeFromTeam(name) {
    team = team.filter(p => p !== name)
    updateTeamDisplay()
}

function updateTeamDisplay() {

    let html = ""

    team.forEach(name => {

        const p = gameData.pokemon.find(x => x.name === name)
        if (!p) return

        html += `
        <div style="border-bottom:1px solid #ccc; padding:5px;">
            <div onclick="toggleTeamPokemon('${p.name}')" style="cursor:pointer;">
                <strong>${p.name}</strong> (${p.types.join("/")})
            </div>

            <div id="team-${p.name}" style="display:none; padding-left:10px;">
                ${renderTeamPokemonDetails(p.name)}
            </div>

            <button onclick="removeFromTeam('${p.name}')">Remove</button>
        </div>
        `
    })

    // 👇 ADD ANALYSIS + RECOMMENDATIONS HERE
    html += renderWeaknessAnalysis()
    html += renderRecommendations()

    document.getElementById("teamDisplay").innerHTML = html
}


function toggleTeamPokemon(name) {

    const el = document.getElementById(`team-${name}`)

    if (el.style.display === "none") {
        el.style.display = "block"
    } else {
        el.style.display = "none"
    }
}

function renderTeamPokemonDetails(name) {

    const pokemon = gameData.pokemon.find(p => p.name === name)
    if (!pokemon) return ""

    const moves = getMovesForLevel(name)

    let html = ""

    html += `<p>HP: ${pokemon.baseStats.hp} | Atk: ${pokemon.baseStats.attack} | Def: ${pokemon.baseStats.defense}</p>`
    html += `<p>SpA: ${pokemon.baseStats.spAttack} | SpD: ${pokemon.baseStats.spDefense} | Spe: ${pokemon.baseStats.speed}</p>`

    html += "<strong>Available Moves:</strong>"

    moves.forEach(m => {
        html += `<div>Lv ${m.level}: ${m.move}</div>`
    })

    return html
}


function analyzeTeamWeakness() {

    let results = {}

    Object.keys(typeChart).forEach(type => {
        results[type] = 0
    })

    team.forEach(name => {

        const p = gameData.pokemon.find(x => x.name === name)
        if (!p) return

        p.types.forEach(t => {

            const data = typeChart[t]

            data.weakTo.forEach(w => results[w] += 1)
            data.resists.forEach(r => results[r] -= 1)
            data.immuneTo.forEach(i => results[i] -= 2)

        })
    })

    return results
}


function renderWeaknessAnalysis() {

    const results = analyzeTeamWeakness()

    let html = "<h3>Team Weakness Analysis</h3>"

    Object.entries(results)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, score]) => {

            let label = ""

            if (score >= 2) label = "❌ Weak"
            else if (score === 1) label = "⚠️ Slight Weakness"
            else if (score <= -2) label = "✅ Strong"

            html += `<div>${type}: ${score} ${label}</div>`
        })

    return html
}


function calculateScore(pokemon) {
    const stats = pokemon.baseStats

    // Simple but effective for now
    const bst = Object.values(stats).reduce((a, b) => a + b, 0)

    // Slight speed bias (important in your format)
    return bst + (stats.speed * 0.5)
}


function recommendFixes() {

    const weaknessScores = analyzeTeamWeakness()

    // Get top 3 weaknesses
    const biggestWeaknesses = Object.entries(weaknessScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type)

    let candidates = gameData.pokemon.filter(p => !team.includes(p.name))

    const scored = candidates.map(p => {

        let fixScore = 0

        p.types.forEach(t => {
            const data = typeChart[t]

            biggestWeaknesses.forEach(w => {
                if (data.resists.includes(w)) fixScore += 2
                if (data.immuneTo.includes(w)) fixScore += 3
                if (data.weakTo.includes(w)) fixScore -= 2
            })
        })

        const baseScore = calculateScore(p)

        return {
            ...p,
            score: baseScore + (fixScore * 10)
        }
    })

    scored.sort((a, b) => b.score - a.score)

    return {
        weaknesses: biggestWeaknesses,
        picks: scored.slice(0, 5)
    }
}


function renderRecommendations() {

    const data = recommendFixes()

    let html = "<h3>Recommended Fixes</h3>"

    html += `<p>Biggest Weaknesses: ${data.weaknesses.join(", ")}</p>`

    data.picks.forEach(p => {
        html += `
        <div onclick="showPokemon('${p.name}')" style="cursor:pointer;">
            ${p.name} (${p.types.join("/")}) - Score: ${p.score.toFixed(1)}
        </div>
        `
    })

    return html
}


function analyzeMoveCoverage() {

    let coverage = {}

    gameData.moves.forEach(m => {
        coverage[m.type] = 0
    })

    team.forEach(name => {

        const moves = getMovesForLevel(name)

        moves.forEach(m => {
            const moveData = gameData.moves.find(x => x.name === m.move)
            if (!moveData) return

            coverage[moveData.type] += 1
        })
    })

    return coverage
}



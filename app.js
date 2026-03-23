let currentGame = "gsc"
let levelCap = 55
let gameData = { pokemon: [], moves: [], learnsets: [] } // Initialize as empty arrays
let selectedType = null
let selectedSort = "bst"

// ==========================
// GAME + LEVEL SETTINGS
// ==========================

function changeGame() {
    currentGame = document.getElementById("gameSelect").value
    loadGameData()
}

function changeLevelCap() {
    levelCap = document.getElementById("levelCap").value
}

// ==========================
// LOAD CORE DATA
// ==========================

async function loadGameData() {
    const response = await fetch("data/pokemon-core.json")
    gameData.pokemon = await response.json()

    console.log("Loaded game:", currentGame)
}

async function loadMoveData() {
    const response = await fetch("data/moves.json")
    gameData.moves = await response.json()
}

async function loadLearnsets() {
    const response = await fetch("data/learnsets.json")
    gameData.learnsets = await response.json()
}

// Load everything on startup
loadGameData()
loadMoveData()
loadLearnsets()

// ==========================
// GAME VERSION MAPPING
// ==========================

function getGameKey() {

    if (currentGame === "gsc") return "crystal"   // you can expand later
    if (currentGame === "rse") return "emerald"
    if (currentGame === "frlg") return "firered-leafgreen"

}

// ==========================
// LEARNSET FUNCTIONS
// ==========================

function getLearnset(pokemonName) {

    const gameKey = getGameKey()

    const entry = gameData.learnsets.find(p => p.pokemon === pokemonName)

    if (!entry) return []

    return entry.learnset[gameKey] || []
}

function getMovesForLevel(pokemonName) {

    const moves = getLearnset(pokemonName)

    return moves.filter(m => m.level <= levelCap)

}

// ==========================
// PAGE NAVIGATION
// ==========================

function openPage(page) {

    const content = document.getElementById("content")

    if (page === "pokedex") {

    let html = "<h2>Pokedex</h2>"

    // Search bar
    html += "<input id='pokeSearch' placeholder='Search Pokemon'>"

html += `
<select id="sortSelect" onchange="changeSort()">
<option value="bst">Total Stats</option>
<option value="attack">Attack</option>
<option value="defense">Defense</option>
<option value="spAttack">Sp. Attack</option>
<option value="spDefense">Sp. Defense</option>
<option value="speed">Speed</option>
</select>
`

    // Type buttons
    const types = [
        "Normal","Fire","Water","Grass","Electric","Ice",
        "Fighting","Poison","Ground","Flying","Psychic",
        "Bug","Rock","Ghost","Dragon","Dark","Steel"
    ]

    html += "<div id='typeButtons'>"
    types.forEach(t => {
        html += `<button onclick="filterByType('${t}')">${t}</button>`
    })
    html += `<button onclick="clearTypeFilter()">All</button>`
    html += "</div>"

    // Results
    html += "<div id='pokeResults'></div>"

    content.innerHTML = html

    // Search listener
    document.getElementById("pokeSearch").addEventListener("input", updateResults)

    // Initial load
    updateResults()

    

    if (page === "team") {
        content.innerHTML = "<h2>Team Planner</h2>"
    }

    if (page === "moves") {

    let html = "<h2>Move Lookup</h2>"

    html += "<input id='moveSearch' placeholder='Search move'>"
    html += "<div id='moveResults'></div>"

    content.innerHTML = html

    document.getElementById("moveSearch").addEventListener("input", updateMoveResults)

}

    if (page === "items") {
        content.innerHTML = "<h2>Item Locations</h2>"
    }

    if (page === "maps") {
        content.innerHTML = "<h2>Maps</h2>"
    }

    if (page === "weakness") {
        content.innerHTML = "<h2>Weakness Calculator</h2>"
    }
}

function showPokemon(name) {

    const pokemon = gameData.pokemon.find(p => p.name === name)

    if (!pokemon) return

    const moves = getMovesForLevel(name)

    let html = `<h2>${pokemon.name}</h2>`

    html += `<p><strong>Type:</strong> ${pokemon.types.join(", ")}</p>`

    html += "<h3>Stats</h3>"
    html += `<p>
    HP: ${pokemon.baseStats.hp} |
    Atk: ${pokemon.baseStats.attack} |
    Def: ${pokemon.baseStats.defense} |
    SpA: ${pokemon.baseStats.spAttack} |
    SpD: ${pokemon.baseStats.spDefense} |
    Spe: ${pokemon.baseStats.speed}
    </p>`

    html += "<h3>Moves (by level)</h3>"

    moves.forEach(m => {
        html += `<div>Lv ${m.level}: ${m.move}</div>`
    })

    document.getElementById("content").innerHTML = html
}

function filterByType(type) {
    selectedType = type
    updateResults()
}

function clearTypeFilter() {
    selectedType = null
    updateResults()
}

function updateResults() {

    const query = document.getElementById("pokeSearch")?.value?.toLowerCase() || ""

    let results = gameData.pokemon

    // Name filter
    if (query) {
        results = results.filter(p =>
            p.name.toLowerCase().includes(query)
        )
    }

    // Type filter
    if (selectedType) {
        results = results.filter(p =>
            p.types.includes(selectedType)
        )
    }

    // Sorting
    results = results.sort((a, b) => {

        if (selectedSort === "bst") {
            const totalA = Object.values(a.baseStats).reduce((sum, val) => sum + val, 0)
            const totalB = Object.values(b.baseStats).reduce((sum, val) => sum + val, 0)
            return totalB - totalA
        }

        return b.baseStats[selectedSort] - a.baseStats[selectedSort]
    })

    let html = ""

    results.slice(0, 50).forEach(p => {

        const total = Object.values(p.baseStats).reduce((sum, val) => sum + val, 0)

        html += `
        <div onclick="showPokemon('${p.name}')">
            ${p.name} (${p.types.join("/")}) - ${selectedSort === "bst" ? total : p.baseStats[selectedSort]}
        </div>
        `
    })

    document.getElementById("pokeResults").innerHTML = html
}

function changeSort() {
    selectedSort = document.getElementById("sortSelect").value
    updateResults()
}

function calculateScore(pokemon) {

    const stats = pokemon.baseStats

    const bestAttack = Math.max(stats.attack, stats.spAttack)
    const speed = stats.speed

    const statScore = (bestAttack * 0.6) + (speed * 0.4)

    // STAB alignment (basic version)
    let stabScore = 70

    if (
        (stats.spAttack > stats.attack && pokemon.types.includes("Psychic")) ||
        (stats.attack > stats.spAttack && pokemon.types.includes("Fighting"))
    ) {
        stabScore = 90
    }

    // Setup moves (basic check)
    const moves = getMovesForLevel(pokemon.name).map(m => m.move)

    let setupScore = 0
    if (moves.includes("Swords Dance") || moves.includes("Dragon Dance")) {
        setupScore = 100
    }

    // Typing (basic placeholder)
    let typingScore = 70
    if (pokemon.types.includes("Dragon")) typingScore += 15

    // Speed normalized
    const speedScore = (speed / 130) * 100

    return (
        statScore * 0.25 +
        stabScore * 0.25 +
        70 * 0.20 + // movepool placeholder
        setupScore * 0.15 +
        typingScore * 0.10 +
        speedScore * 0.05
    )
}

function showTopPicks() {

    let results = gameData.pokemon

    if (selectedType) {
        results = results.filter(p => p.types.includes(selectedType))
    }

    const scored = results.map(p => ({
        ...p,
        score: calculateScore(p)
    }))

    scored.sort((a, b) => b.score - a.score)

    let html = "<h2>Top Picks</h2>"

    scored.slice(0, 5).forEach(p => {
        html += `<div onclick="showPokemon('${p.name}')">
            ${p.name} - Score: ${p.score.toFixed(1)}
        </div>`
    })

    document.getElementById("content").innerHTML = html
}

function updateMoveResults() {

    const query = document.getElementById("moveSearch")?.value?.toLowerCase() || ""

    let results = gameData.moves

    if (query) {
        results = results.filter(m =>
            m.name.toLowerCase().includes(query)
        )
    }

    let html = ""

    results.slice(0, 50).forEach(m => {
        html += `<div onclick="showMove('${m.name}')">${m.name}</div>`
    })

    document.getElementById("moveResults").innerHTML = html
}

function showMove(name) {

    const move = gameData.moves.find(m => m.name === name)

    if (!move) return

    let html = `<h2>${move.name}</h2>`

    html += `<p><strong>Type:</strong> ${move.type}</p>`
    html += `<p><strong>Category:</strong> ${move.category}</p>`
    html += `<p><strong>Power:</strong> ${move.power || "-"}</p>`
    html += `<p><strong>Accuracy:</strong> ${move.accuracy || "-"}</p>`
    html += `<p><strong>PP:</strong> ${move.pp}</p>`

    html += `<p><strong>Effect:</strong> ${move.effect}</p>`

    document.getElementById("content").innerHTML = html
}


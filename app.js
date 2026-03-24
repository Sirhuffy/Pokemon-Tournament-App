// ==========================
// INITIAL STATE
// ==========================
let currentGame = "gsc"
let levelCap = 55
let gameData = { pokemon: [], moves: [], learnsets: [], encounters: [] }
let selectedType = null
let selectedSort = "bst"
let team = []

// ==========================
// TYPE CHART
// ==========================
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
// DATA LOADING
// ==========================
async function initApp() {
    try {
        // 1. Wait for ALL data to download first
        const [pokemonRes, movesRes, learnsetsRes, encountersRes, itemsRes] = await Promise.all([
            fetch("data/pokemon-core.json"),
           fetch("data/moves.json"),
            fetch("data/learnsets.json"),
            fetch("data/encounters.json"),
            fetch("data/items.json")
        ]);

        gameData.items = await itemsRes.json();
        gameData.pokemon = await pokemonRes.json();
        gameData.moves = await movesRes.json();
        gameData.learnsets = await learnsetsRes.json();
        gameData.encounters = await encountersRes.json();

        // 2. ONLY AFTER data is loaded, load the team from storage
        loadSavedTeam();
        
        console.log("Data & Team Loaded. System Ready.");

        // 3. Default to the Team Planner page so you can see if it worked immediately
        openPage('team'); 

    } catch (error) {
        console.error("Initialization failed:", error);
        document.getElementById("content").innerHTML = "<h2>Error loading data. Check console.</h2>";
    }
}

// Ensure the browser is fully ready before starting the app
window.addEventListener('DOMContentLoaded', initApp);


// ==========================
// STORAGE
// ==========================
function saveTeam() {
    localStorage.setItem("pokemonTeam", JSON.stringify(team))
}

function loadSavedTeam() {
    const saved = localStorage.getItem("pokemonTeam");
    if (saved) {
        const parsed = JSON.parse(saved);
        
        // SAFETY CHECK: If the first item is just a string, it's old data. Clear it.
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
    // Convert each name to the full Pokemon object from gameData
    team = parsed.map(name => gameData.pokemon.find(p => p.name === name)).filter(p => p);
} else {
    team = parsed;
}
    }
}

function clearTeam() {
    if (confirm("Clear entire team?")) {
        team = []
        saveTeam()
        updateTeamDisplay()
    }
}

// ==========================
// GAME HELPERS
// ==========================
function getGameKey() {
    if (currentGame === "gsc") return "crystal"
    if (currentGame === "rse") return "emerald"
    if (currentGame === "frlg") return "firered-leafgreen"
    return "crystal"
}

function getLearnset(name) {
    const entry = gameData.learnsets.find(p => p.pokemon === name)
    if (!entry) return []
    return entry.learnset[getGameKey()] || []
}

function getMovesForLevel(name) {
    return getLearnset(name).filter(m => m.level <= levelCap)
}

function getBestMoves(name) {
    const moves = getMovesForLevel(name)

    // Score moves
    return moves.map(m => {
        const moveData = gameData.moves.find(x => x.name === m.move)

        let score = 0

        if (moveData) {
            // Prefer damaging moves
            if (moveData.power) score += moveData.power

            // STAB bonus
            const p = gameData.pokemon.find(p => p.name === name)
            if (p && p.types.includes(moveData.type)) {
                score += 50
            }
        }

        return { ...m, score }
    })
    .sort((a,b) => b.score - a.score)
    .slice(0,4)
}


function getEncounters(name) {
    const entry = gameData.encounters.find(e => e.pokemon === name)
    if (!entry) return null

    const gameKey = getGameKey()
    const data = entry.games?.[gameKey]

    if (!data || data.length === 0) {
        return []
    }

    return data
}

function recommendItems(pokemon) {
    if (!pokemon || !pokemon.baseStats) return []

    const items = gameData.items || []
    const gameKey = getGameKey()
    let suggestions = []

    const { hp, speed } = pokemon.baseStats

    // Bulk → Leftovers
    if (hp > 80) {
        const item = items.find(i => i.name === "Leftovers")
        if (item) suggestions.push(item)
    }

    // Slow → Quick Claw
    if (speed < 60) {
        const item = items.find(i => i.name === "Quick Claw")
        if (item) suggestions.push(item)
    }

    // Type boosting items
    pokemon.types.forEach(type => {
        const item = items.find(i => i.type === type)
        if (item) suggestions.push(item)
    })

    // 🔥 KEY FIX: Filter items that exist in this game
    return suggestions.filter(i => i.location?.[gameKey]).slice(0, 3)
}


function getEVYield(pokemonName) {
    const evMap = {
        "Zubat": { speed: 1 },
        "Magikarp": { speed: 1 },
        "Geodude": { defense: 1 },
        "Gastly": { spAttack: 1 },
        "Machop": { attack: 1 },
        "Tentacool": { spDefense: 1 }
    }

    return evMap[pokemonName] || {}
}


function getEVTrainingSpots(stat) {
    const gameKey = getGameKey()
    let recommendations = []

    gameData.encounters.forEach(entry => {
        const evYield = getEVYield(entry.pokemon)

        if (!evYield[stat]) return

        const locations = entry.games?.[gameKey] || []

        locations.forEach(loc => {
            recommendations.push({
                pokemon: entry.pokemon,
                area: loc.area,
                rate: loc.rate,
                ev: evYield[stat]
            })
        })
    })

    return recommendations
        .sort((a,b) => parseFloat(b.rate) - parseFloat(a.rate))
        .slice(0, 5)
}



// ==========================
// NAVIGATION
// ==========================
function openPage(page) {
    const content = document.getElementById("content")

    if (gameData.pokemon.length === 0) {
        content.innerHTML = "<h2>Loading...</h2>"
        return
    }

    if (page === "team") {
        content.innerHTML = `
            <h2>Team Builder</h2>
            <input id='globalSearch' placeholder='Search Pokémon...'>
            <div id='globalResults'></div>
            <div id='teamSearchResults'></div>
            <div id='teamDisplay'></div>
        `
        document.getElementById("teamSearch").addEventListener("input", updateTeamSearch)
        updateTeamDisplay()

document.getElementById("globalSearch").addEventListener("input", updateGlobalSearch)

    }

    else if (page === "pokedex") {
        let html = "<h2>Pokedex</h2>"

        html += "<input id='pokeSearch' placeholder='Search...'>"

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

        const types = ["Normal","Fire","Water","Grass","Electric","Ice","Fighting","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel"]

        html += "<div>"
        types.forEach(t => {
            html += `<button onclick="filterByType('${t}')">${t}</button>`
        })
        html += `<button onclick="clearTypeFilter()">All</button>`
        html += "</div>"

        html += "<div id='pokeResults'></div>"

        content.innerHTML = html

        document.getElementById("pokeSearch").addEventListener("input", updateResults)

        updateResults()
    }

    else if (page === "weakness") {
        content.innerHTML = `<h2>Weakness</h2>${renderWeaknessAnalysis()}`
    }
}


function updateGlobalSearch() {
    const query = document.getElementById("globalSearch").value.toLowerCase()

    if (!query) {
        document.getElementById("globalResults").innerHTML = ""
        return
    }

    const results = gameData.pokemon
        .filter(p => p.name.toLowerCase().includes(query))
        .slice(0, 8)

    let html = ""

    results.forEach(p => {
        const isOnTeam = team.some(t => t.name === p.name)

        html += `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
            <div onclick="showPokemon('${p.name}')" style="cursor:pointer;">
                ${p.name}
            </div>
            ${
                isOnTeam
                ? `<button onclick="removeFromTeam('${p.name}')">-</button>`
                : `<button onclick="addToTeam('${p.name}')">+</button>`
            }
        </div>`
    })

    document.getElementById("globalResults").innerHTML = html
}



// ==========================
// POKEDEX
// ==========================
function changeSort() {
    selectedSort = document.getElementById("sortSelect").value
    updateResults()
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

    let results = [...gameData.pokemon]

    if (query) results = results.filter(p => p.name.toLowerCase().includes(query))
    if (selectedType) results = results.filter(p => p.types.includes(selectedType))

    results.sort((a, b) => {
        if (selectedSort === "bst") {
            const totalA = Object.values(a.baseStats).reduce((a,b)=>a+b,0)
            const totalB = Object.values(b.baseStats).reduce((a,b)=>a+b,0)
            return totalB - totalA
        }
        return b.baseStats[selectedSort] - a.baseStats[selectedSort]
    })



    let html = ""

    results.slice(0,50).forEach(p => {
        const total = Object.values(p.baseStats).reduce((a,b)=>a+b,0)
        const isOnTeam = team.some(member => member.name === p.name);

        html += `
<div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
    <div onclick="showPokemon('${p.name}')" style="cursor:pointer;">
        ${p.name} (${p.types.join("/")}) - ${selectedSort==="bst"?total:p.baseStats[selectedSort]}
    </div>
    ${
        isOnTeam
        ? `<button onclick="removeFromTeam('${p.name}')" style="background:#ff4444; color:white;">-</button>`
        : `<button onclick="addToTeam('${p.name}')">+</button>`
    }
</div>`
    })

    document.getElementById("pokeResults").innerHTML = html
}

function showPokemon(name) {
    const p = gameData.pokemon.find(x => x.name === name)
    if (!p) return

    const moves = getBestMoves(name)
    const encounters = gameData.encounters ? getEncounters(name) : []

    let html = `<h2>${p.name}</h2>`
    html += `<p>${p.types.join("/")}</p>`

    html += `<p>
        HP:${p.baseStats.hp} |
        Atk:${p.baseStats.attack} |
        Def:${p.baseStats.defense} |
        SpA:${p.baseStats.spAttack} |
        SpD:${p.baseStats.spDefense} |
        Spe:${p.baseStats.speed}
    </p>`

    html += "<h3>Moves</h3>"
    moves.forEach(m=>{
        html += `<div>⭐ Lv ${m.level}: ${m.move}</div>`
    })

   html += "<h3>Where to Catch</h3>"

if (!encounters || encounters.length === 0) {
    html += "<p style='color:#999;'>Not available or not yet added for this game.</p>"
} else {
    encounters.forEach(loc => {
        html += `<div>${loc.area} (${loc.method}) - ${loc.rate}</div>`
    })
}

    html += "<h3>Best Route</h3>"
    html += `<p>${recommendRoute(p.name)}</p>`

    html += "<h3>IV Estimate (Basic)</h3>"
    html += "<p>Feature coming soon...</p>"

    const items = gameData.items ? recommendItems(p) : []

    html += "<h3>Recommended Items</h3>"
    

const gameKey = getGameKey()

items.forEach(i => {
    const location = i.location?.[gameKey] || "Unknown"

    html += `<div>
        <strong>${i.name}</strong><br>
        <small>${i.effect}</small><br>
        <small style="color:#666;">📍 ${location}</small>
    </div>`
})


    html += "<h3>EV Training</h3>"

const stats = ["attack","speed","spAttack","defense","spDefense","hp"]

stats.forEach(stat => {
    const spots = getEVTrainingSpots(stat)

    if (spots.length === 0) return

    html += `<div><strong>${stat.toUpperCase()}</strong>:</div>`

    spots.forEach(s => {
        html += `<div style="font-size:12px; margin-left:10px;">
            ${s.pokemon} (${s.area}) - ${s.rate}
        </div>`
    })
})

    html += `
        <br>
        <button onclick="addToTeam('${p.name}')">Add to Team</button>
        <br><br>
        <button onclick="openPage('pokedex')">Back</button>
    `

    document.getElementById("content").innerHTML = html
}

// ==========================
// TEAM BUILDER
// ==========================
function updateTeamSearch() {
    const query = document.getElementById("teamSearch").value.toLowerCase()

    if (!query) {
        document.getElementById("teamSearchResults").innerHTML = ""
        return
    }

    const teamNames = team.map(p => p.name)

    let results = gameData.pokemon
        .filter(p => p.name.toLowerCase().includes(query) && !teamNames.includes(p.name))
        .slice(0, 5)

    let html = ""
    results.forEach(p => {
        html += `<div onclick="addToTeam('${p.name}')">+ ${p.name}</div>`
    })

    document.getElementById("teamSearchResults").innerHTML = html
}


function addToTeam(name) {
    if (team.length >= 6) { alert("Max 6 Pokemon!"); return; }
    
    // Check by name string since team now contains objects
    if (team.some(p => p.name === name)) { 
        alert("Already added!"); 
        return; 
    }

    // IMPORTANT: Make sure this find is working
    const pokemonData = gameData.pokemon.find(p => p.name === name);
    
    if (pokemonData && pokemonData.types) { // Ensure it has types!
        team.push(pokemonData); 
        saveTeam();
        
        // Clear search UI
        const searchInput = document.getElementById("teamSearch");
        if (searchInput) searchInput.value = "";
        document.getElementById("teamSearchResults").innerHTML = "";
        
        // Refresh display
        updateTeamDisplay();
    } else {
        alert("Error: Could not find data for " + name);
    }
}

function removeFromTeam(name) {
    team = team.filter(p => p.name !== name);
    saveTeam();
    updateTeamDisplay();
}

function updateTeamDisplay() {
    const displayArea = document.getElementById("teamDisplay");
    if (!displayArea) return;

    let html = "<h3>Your Team</h3>";

    if (team && team.length > 0) {
        html += `<button onclick="clearTeam()" class="clear-btn">Clear Full Team</button>`;
        html += "<div class='team-grid'>";

        team.forEach(p => {
            // SAFETY GATE: If data is corrupted, don't crash the whole app
            if (!p || !p.name || !p.types) {
                console.error("Skipping broken Pokemon entry:", p);
                return;
            }

            html += `
                <div class="team-card">
                    <strong>${p.name}</strong><br>
                    <small>${p.types.join("/")}</small><br>
                    <button class="remove-btn" onclick="removeFromTeam('${p.name}')">Remove</button>
                </div>`;
        });

        html += "</div><hr>";
        
        // Wrap these in try/catch so a calculation error doesn't break the UI
        try {
            html += renderWeaknessAnalysis();
            html += renderOffenseCoverage();
            html += renderMoveCoverage();
            html += renderRecommendations();
        } catch (e) {
            console.error("Analysis Error:", e);
        }
    } else {
        html += "<p style='margin-top:20px; color:#666;'>Your team is empty. Add Pokemon above.</p>";
    }
    displayArea.innerHTML = html;
}

// ==========================
// ANALYSIS
// ==========================
function analyzeTeamWeakness() {
    let results = {};
    Object.keys(typeChart).forEach(t => results[t] = 0);

    team.forEach(p => {
        if (!p || !p.types) return;

        p.types.forEach(t => {
            // Capitalize to match TypeChart keys (Fire, Water, etc)
            const typeKey = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
            const d = typeChart[typeKey];
            
            if (d) { // SAFETY GATE: Only proceed if the type exists in our chart
                d.weakTo.forEach(w => results[w] += 1);
                d.resists.forEach(r => results[r] -= 1);
                d.immuneTo.forEach(i => results[i] -= 2);
            }
        });
    });
    return results;
}

function analyzeOffenseCoverage() {
    let coverage = {}

    Object.keys(typeChart).forEach(t => coverage[t] = 0)

    team.forEach(p => {
        const moves = getBestMoves(p.name)

        moves.forEach(m => {
            const moveData = gameData.moves.find(x => x.name === m.move)
            if (!moveData) return

            // Which types this move is strong against
            Object.entries(typeChart).forEach(([type, data]) => {
                if (data.weakTo.includes(moveData.type)) {
                    coverage[type] += 1
                }
            })
        })
    })

    return coverage
}


function renderWeaknessAnalysis() {
    let html="<h4>Weakness</h4>"
    const res=analyzeTeamWeakness()

    Object.entries(res).sort((a,b)=>b[1]-a[1]).forEach(([t,s])=>{
        if(s===0)return
        html+=`<div>${t}: ${s}</div>`
    })

    return html
}


function renderOffenseCoverage() {
    const coverage = analyzeOffenseCoverage()
    let html = "<h4>Offensive Coverage</h4>"

    Object.entries(coverage)
        .sort((a,b)=>b[1]-a[1])
        .forEach(([type, score]) => {
            if (score === 0) return
            html += `<div>${type}: ${score}</div>`
        })

    return html
}


function recommendFixes() {
    const weakData = analyzeTeamWeakness();
    const biggestWeaknesses = Object.entries(weakData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([t]) => t);

    const teamNames = team.map(member => member.name);
    const candidates = gameData.pokemon.filter(p => !teamNames.includes(p.name));

    const scored = candidates.map(p => {
        let score = 0;
        if (p.types) {
            p.types.forEach(t => {
                const typeKey = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
                const d = typeChart[typeKey];
                if (d) {
                    biggestWeaknesses.forEach(w => {
                        if (d.resists.includes(w)) score += 2;
                        if (d.immuneTo.includes(w)) score += 3;
                    });
                }
            });
        }
        return { ...p, score };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

    return { weak: biggestWeaknesses, scored };
}


function renderRecommendations() {
    const data = recommendFixes()
    let html="<h4>Fix Suggestions</h4>"

    data.scored.forEach(p=>{
        html+=`<button onclick="addToTeam('${p.name}')">+ ${p.name}</button>`
    })

    return html
}


function analyzeMoveCoverage() {
    const coverage = {};

    Object.keys(typeChart).forEach(t => coverage[t] = 0);

    team.forEach(p => {
        const moves = getMovesForLevel(p.name);

        moves.forEach(m => {
            const moveData = gameData.moves.find(x => x.name === m.move);
            if (!moveData) return;

            const type = moveData.type;
            if (coverage[type] !== undefined) {
                coverage[type] += 1;
            }
        });
    });

    return coverage;
}

function renderMoveCoverage() {
    const coverage = analyzeMoveCoverage();

    let html = "<h4>Move Coverage</h4>";

    Object.entries(coverage)
        .sort((a,b)=>b[1]-a[1])
        .forEach(([type, count]) => {
            if (count === 0) {
                html += `<div style="color:#cc0000">${type}: NONE</div>`;
            } else {
                html += `<div>${type}: ${count}</div>`;
            }
        });

    return html;
}



function getEVTrainingSpots(stat) {
    const game = getGameKey()

    const spots = {
        crystal: {
            attack: "Route 42 (Machop)",
            speed: "Route 30 (Rattata)",
            spAttack: "Route 34 (Abra)",
            defense: "Union Cave (Geodude)",
            hp: "Route 32 (Wooper)"
        },
        emerald: {
            attack: "Mt. Chimney (Numel)",
            speed: "Route 104 (Wingull)",
            spAttack: "Route 113 (Spinda)",
            defense: "Granite Cave (Geodude)",
            hp: "Route 117 (Marill)"
        },
        "firered-leafgreen": {
            attack: "Route 10 (Machop)",
            speed: "Route 1 (Pidgey)",
            spAttack: "Pokemon Tower (Gastly)",
            defense: "Rock Tunnel (Geodude)",
            hp: "Route 12 (Slowpoke)"
        }
    }

    return spots[game]?.[stat] || "Unknown"
}


function recommendRoute(pokemonName) {
    const encounters = getEncounters(pokemonName)

    if (encounters.length === 0) return "No route data"

    return encounters[0].area
}

function estimateIV(stat, base, level) {
    // rough estimate
    return Math.floor((stat - base) * 2)
}




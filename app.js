// ==========================
// INITIAL STATE
// ==========================
let currentGame = "gsc"; // Default to Gen 2
let levelCap = 55;
let gameData = {
    pokemon: [],
    learnsets: [],
    moves: [],
    items: [],
    encounters: [],
    machines: []
};
let selectedType = null;
let selectedSort = "bst";
let team = [];
let compareSelection = [null, null]; // Tracks the two Pokémon to compare

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
};

// ==========================
// DATA LOADING
// ==========================
async function initApp() {
    try {
        const [pokemonRes, movesRes, learnsetsRes, encountersRes, itemsRes, tmsRes, naturesRes] = await Promise.all([
            fetch("data/pokemon-core.json"),
            fetch("data/moves.json"),
            fetch("data/learnsets.json"),
            fetch("data/encounters.json"),
            fetch("data/items.json"),
            fetch("data/tms.json"),
            fetch("data/natures.json")
        ]);

        gameData.pokemon = await pokemonRes.json();
        gameData.moves = await movesRes.json();
        gameData.learnsets = await learnsetsRes.json();
        gameData.encounters = await encountersRes.json();
        gameData.items = await itemsRes.json();
        gameData.tms = await tmsRes.json();
        gameData.natures = await naturesRes.json();

        loadSavedTeam();
        console.log("System Ready. All data loaded.");
        openPage('team'); 

    } catch (error) {
        console.error("Initialization failed:", error);
        document.getElementById("content").innerHTML = "<h2>Error loading data. Check console.</h2>";
    }
}

window.addEventListener('DOMContentLoaded', initApp);

// ==========================
// STORAGE
// ==========================
function saveTeam() {
    localStorage.setItem("pokemonTeam", JSON.stringify(team));
}

function loadSavedTeam() {
    const saved = localStorage.getItem("pokemonTeam");
    if (saved) {
        const parsed = JSON.parse(saved);
        // Safety check to ensure we map names back to objects
        team = parsed.map(p => {
            const name = typeof p === 'string' ? p : p.name;
            return gameData.pokemon.find(data => data.name === name);
        }).filter(p => p);
    }
}

function clearTeam() {
    if (confirm("Clear entire team?")) {
        team = [];
        saveTeam();
        updateTeamDisplay();
    }
}

// ==========================
// GAME HELPERS
// ==========================
function getGameKey() {
    if (currentGame === "gsc") return "gsc";
    if (currentGame === "rse") return "rse";
    if (currentGame === "frlg") return "frlg";
    return "gsc";
}

// Maps our internal keys to the PokeAPI-style keys in learnsets.json
function getPokeApiKey() {
    if (currentGame === "gsc") return "crystal";
    if (currentGame === "rse") return "emerald";
    if (currentGame === "frlg") return "firered-leafgreen";
    return "crystal";
}

function getLearnset(name) {
    const entry = gameData.learnsets.find(p => p.pokemon === name);
    if (!entry) return [];
    return entry.learnset[getPokeApiKey()] || [];
}

function getMovesForLevel(name) {
    return getLearnset(name).filter(m => m.level <= levelCap);
}

function getBestMoves(name) {
    const moves = getMovesForLevel(name);
    return moves.map(m => {
        const moveData = gameData.moves.find(x => x.name === m.move);
        let score = 0;
        if (moveData) {
            if (moveData.power) score += moveData.power;
            const p = gameData.pokemon.find(p => p.name === name);
            if (p && p.types.includes(moveData.type)) score += 50;
        }
        return { ...m, score };
    })
    .sort((a,b) => b.score - a.score)
    .slice(0,4);
}

function getEncounters(name) {
    const entry = gameData.encounters.find(e => e.pokemon === name);
    if (!entry) return [];
    return entry.games?.[getGameKey()] || [];
}

function recommendItems(pokemon) {
    if (!pokemon || !pokemon.baseStats) return [];
    const items = gameData.items || [];
    const gameKey = getGameKey();
    let suggestions = [];

    const { hp, speed } = pokemon.baseStats;
    if (hp > 80) {
        const item = items.find(i => i.name === "Leftovers");
        if (item) suggestions.push(item);
    }
    if (speed < 60) {
        const item = items.find(i => i.name === "Quick Claw");
        if (item) suggestions.push(item);
    }
    pokemon.types.forEach(type => {
        const item = items.find(i => i.type === type);
        if (item) suggestions.push(item);
    });

    return suggestions.filter(i => i.location?.[gameKey]).slice(0, 3);
}

function getEVYield(pokemonName) {
    const evMap = {
        "Zubat": { speed: 1 }, "Magikarp": { speed: 1 }, "Geodude": { defense: 1 },
        "Gastly": { spAttack: 1 }, "Machop": { attack: 1 }, "Tentacool": { spDefense: 1 }
    };
    return evMap[pokemonName] || {};
}

function getEVTrainingSpots(stat) {
    const gameKey = getGameKey();
    let recommendations = [];
    gameData.encounters.forEach(entry => {
        const evYield = getEVYield(entry.pokemon);
        if (!evYield[stat]) return;
        const locations = entry.games?.[gameKey] || [];
        locations.forEach(loc => {
            recommendations.push({
                pokemon: entry.pokemon, area: loc.area,
                rate: loc.rate, ev: evYield[stat]
            });
        });
    });
    return recommendations.sort((a,b) => parseFloat(b.rate) - parseFloat(a.rate)).slice(0, 5);
}

function getMachineMoveName(machineCode) {
    const gameMachines = gameData.machines.find(m => m.game === currentGame);
    if (!gameMachines) return null;
    return gameMachines.tms[machineCode] || gameMachines.hms[machineCode];
}

// ==========================
// NAVIGATION & UI
// ==========================
function openPage(page) {
    const content = document.getElementById("content");
    if (gameData.pokemon.length === 0) {
        content.innerHTML = "<h2>Loading...</h2>";
        return;
    }

    if (page === "team") {
        content.innerHTML = `
            <h2>Team Builder</h2>
            <div style="margin-bottom:15px;">
                <label>Current Game: </label>
                <select id="gameSelect" onchange="changeGame(this.value)">
                    <option value="gsc" ${currentGame==='gsc'?'selected':''}>Gold/Silver/Crystal</option>
                    <option value="rse" ${currentGame==='rse'?'selected':''}>Ruby/Sapphire/Emerald</option>
                    <option value="frlg" ${currentGame==='frlg'?'selected':''}>FireRed/LeafGreen</option>
                </select>
            </div>
            <input id='globalSearch' placeholder='Search Pokémon...'>
            <div id='globalResults'></div>
            <div id='teamDisplay'></div>
        `;
        document.getElementById("globalSearch").addEventListener("input", updateGlobalSearch);
        updateTeamDisplay();

    } else if (page === "compare") {
        content.innerHTML = `
            <h2>Compare Pokémon</h2>
            <div class="compare-selectors" style="display:flex; gap:20px; margin-bottom:20px;">
                <div id="slot-0">${renderCompareSlot(0)}</div>
                <div id="slot-1">${renderCompareSlot(1)}</div>
            </div>
            <div id="comparisonTable"></div>
        `;
        renderComparisonTable();

    } else if (page === "pokedex") {
        let html = "<h2>Pokedex</h2><input id='pokeSearch' placeholder='Search...'>";
        html += `<select id="sortSelect" onchange="changeSort()">
            <option value="bst">Total Stats</option>
            <option value="attack">Attack</option>
            <option value="defense">Defense</option>
            <option value="spAttack">Sp. Attack</option>
            <option value="spDefense">Sp. Defense</option>
            <option value="speed">Speed</option>
        </select>`;
        const types = Object.keys(typeChart);
        html += "<div style='margin-top:10px;'>";
        types.forEach(t => { html += `<button onclick="filterByType('${t}')">${t}</button> ` });
        html += `<button onclick="clearTypeFilter()">All</button></div><div id='pokeResults'></div>`;
        content.innerHTML = html;
        document.getElementById("pokeSearch").addEventListener("input", updateResults);
        updateResults();

    } else if (page === "weakness") {
        content.innerHTML = `<h2>Weakness</h2>${renderWeaknessAnalysis()}`;
    }
}

function changeGame(val) {
    currentGame = val;
    saveTeam(); // Save context
    updateTeamDisplay();
}

function updateGlobalSearch() {
    const query = document.getElementById("globalSearch").value.toLowerCase();
    if (!query) { document.getElementById("globalResults").innerHTML = ""; return; }
    const results = gameData.pokemon.filter(p => p.name.toLowerCase().includes(query)).slice(0, 8);
    let html = "";
    results.forEach(p => {
        const isOnTeam = team.some(t => t.name === p.name);
        html += `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
            <span onclick="showPokemon('${p.name}')" style="cursor:pointer;">${p.name}</span>
            ${isOnTeam ? `<button onclick="removeFromTeam('${p.name}')">-</button>` : `<button onclick="addToTeam('${p.name}')">+</button>`}
        </div>`;
    });
    document.getElementById("globalResults").innerHTML = html;
}

function updateResults() {
    const query = document.getElementById("pokeSearch")?.value?.toLowerCase() || "";
    let results = [...gameData.pokemon];
    if (query) results = results.filter(p => p.name.toLowerCase().includes(query));
    if (selectedType) results = results.filter(p => p.types.includes(selectedType));

    results.sort((a, b) => {
        if (selectedSort === "bst") {
            const totalA = Object.values(a.baseStats).reduce((x,y)=>x+y,0);
            const totalB = Object.values(b.baseStats).reduce((x,y)=>x+y,0);
            return totalB - totalA;
        }
        return b.baseStats[selectedSort] - a.baseStats[selectedSort];
    });

    let html = "";
    results.slice(0,50).forEach(p => {
        const total = Object.values(p.baseStats).reduce((x,y)=>x+y,0);
        const isOnTeam = team.some(member => member.name === p.name);
        html += `
        <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
            <div onclick="showPokemon('${p.name}')" style="cursor:pointer;">
                ${p.name} (${p.types.join("/")}) - ${selectedSort==="bst"?total:p.baseStats[selectedSort]}
            </div>
            ${isOnTeam ? `<button onclick="removeFromTeam('${p.name}')" style="background:#ff4444; color:white;">-</button>` : `<button onclick="addToTeam('${p.name}')">+</button>`}
        </div>`;
    });
    document.getElementById("pokeResults").innerHTML = html;
}

function showPokemon(name) {
    const p = gameData.pokemon.find(x => x.name === name);
    if (!p) return;

    const isGen2 = currentGame === "gsc";
    const moves = getBestMoves(name);
    const encounters = getEncounters(name);

    let html = `<h2>${p.name}</h2><p>${p.types.join("/")}</p>`;
    html += `<p>HP:${p.baseStats.hp} | Atk:${p.baseStats.attack} | Def:${p.baseStats.defense} | SpA:${p.baseStats.spAttack} | SpD:${p.baseStats.spDefense} | Spe:${p.baseStats.speed}</p>`;

    // IV / DV CHECKER UI
    html += `<h3>${isGen2 ? 'DV' : 'IV'} Checker</h3>
        <input id="ivLevel" placeholder="Level" type="number" style="width:60px;"><br>
        <select id="ivGender">
            <option value="">Unknown Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
        </select>
        ${!isGen2 ? `<select id="ivNature">
            <option value="">Select Nature</option>
            ${gameData.natures.map(n => `<option value="${n.name}">${n.name}</option>`).join('')}
        </select>` : ''}
        <br>
        <input id="ivAttack" placeholder="Attack" type="number">
        <input id="ivDefense" placeholder="Defense" type="number"><br>
        <input id="ivSpAttack" placeholder="Sp. Attack" type="number">
        ${!isGen2 ? `<input id="ivSpDefense" placeholder="Sp. Defense" type="number">` : ''}
        <input id="ivSpeed" placeholder="Speed" type="number"><br>
        <button onclick="runIVCalc('${p.name}')">Check Stats</button>
        <div id="ivResult"></div>`;

    // EV PLAN
    html += "<h3>EV Optimization Plan</h3>";
    const evPlan = getEVSpread(p);
    evPlan.forEach(stat => {
        const spots = getEVTrainingSpots(stat);
        html += `<div><strong>${stat.toUpperCase()}</strong>: ${spots.length > 0 ? spots[0].area : 'None found'}</div>`;
    });

    // MOVES & ENCOUNTERS
    html += "<h3>Best Moves (Level Cap)</h3>";
    moves.forEach(m => { html += `<div>⭐ Lv ${m.level}: ${m.move}</div>`; });

    html += "<h3>Where to Catch</h3>";
    if (encounters.length === 0) {
        html += "<p style='color:#999;'>Not available in this game.</p>";
    } else {
        encounters.forEach(loc => { html += `<div>${loc.area} (${loc.method}) - ${loc.rate}</div>`; });
    }

    // TM & ITEMS
    const tms = p.tms?.[getPokeApiKey()] || [];
    html += "<h3>TM Compatibility</h3>";
    tms.forEach(move => {
        const tmData = gameData.tms.find(t => t.move === move);
        const location = tmData?.games?.[getPokeApiKey()]?.location || "Unknown";
        html += `<div>${move} — 📍 ${location}</div>`;
    });

    const items = recommendItems(p);
    html += "<h3>Recommended Items</h3>";
    items.forEach(i => {
        html += `<div><strong>${i.name}</strong><br><small>${i.effect}</small><br><small style="color:#666;">📍 ${i.location?.[getGameKey()] || "Unknown"}</small></div>`;
    });

    html += `<br><button onclick="addToTeam('${p.name}')">Add to Team</button> <button onclick="openPage('pokedex')">Back</button>`;
    document.getElementById("content").innerHTML = html;
}

// ==========================
// TEAM BUILDER LOGIC
// ==========================
function addToTeam(name) {
    if (team.length >= 6) { alert("Max 6 Pokemon!"); return; }
    if (team.some(p => p.name === name)) { alert("Already added!"); return; }
    const pokemonData = gameData.pokemon.find(p => p.name === name);
    if (pokemonData) {
        team.push(pokemonData);
        saveTeam();
        updateTeamDisplay();
        if(document.getElementById("globalSearch")) updateGlobalSearch();
        if(document.getElementById("pokeSearch")) updateResults();
    }
}

function removeFromTeam(name) {
    team = team.filter(p => p.name !== name);
    saveTeam();
    updateTeamDisplay();
    if(document.getElementById("globalSearch")) updateGlobalSearch();
    if(document.getElementById("pokeSearch")) updateResults();
}

function updateTeamDisplay() {
    const displayArea = document.getElementById("teamDisplay");
    if (!displayArea) return;
    let html = "<h3>Your Team</h3>";
    if (team.length > 0) {
        html += `<button onclick="clearTeam()" class="clear-btn">Clear Full Team</button><div class='team-grid'>`;
        team.forEach(p => {
            if (!p || !p.types) return; // Safety check
            html += `<div class="team-card"><strong>${p.name}</strong><br><small>${p.types.join("/")}</small><br><button class="remove-btn" onclick="removeFromTeam('${p.name}')">Remove</button></div>`;
        });
        html += "</div><hr>";
        try {
            html += renderWeaknessAnalysis();
            html += renderOffenseCoverage();
            html += renderMoveCoverage();
            html += renderRecommendations();
        } catch (e) { console.error("Analysis Error:", e); }
    } else {
        html += "<p>Your team is empty.</p>";
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
        p.types.forEach(t => {
            const typeKey = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
            const d = typeChart[typeKey];
            if (d) {
                d.weakTo.forEach(w => results[w] += 1);
                d.resists.forEach(r => results[r] -= 1);
                d.immuneTo.forEach(i => results[i] -= 2);
            }
        });
    });
    return results;
}

function renderWeaknessAnalysis() {
    let html="<h4>Weakness Analysis</h4>";
    const res=analyzeTeamWeakness();
    Object.entries(res).sort((a,b)=>b[1]-a[1]).forEach(([t,s])=>{
        if(s > 0) html+=`<div>${t}: <span style="color:red;">x${s}</span></div>`;
    });
    return html;
}

function analyzeOffenseCoverage() {
    let coverage = {};
    Object.keys(typeChart).forEach(t => coverage[t] = 0);
    team.forEach(p => {
        getBestMoves(p.name).forEach(m => {
            const moveData = gameData.moves.find(x => x.name === m.move);
            if (!moveData) return;
            Object.entries(typeChart).forEach(([type, data]) => {
                if (data.weakTo.includes(moveData.type)) coverage[type] += 1;
            });
        });
    });
    return coverage;
}

function renderOffenseCoverage() {
    const coverage = analyzeOffenseCoverage();
    let html = "<h4>Offensive Coverage</h4>";
    Object.entries(coverage).sort((a,b)=>b[1]-a[1]).forEach(([type, score]) => {
        if (score > 0) html += `<div>${type}: ${score}</div>`;
    });
    return html;
}

function renderMoveCoverage() {
    const coverage = {};
    team.forEach(p => {
        getBestMoves(p.name).forEach(m => {
            const moveData = gameData.moves.find(x => x.name === m.move);
            if (moveData) coverage[moveData.type] = (coverage[moveData.type] || 0) + 1;
        });
    });
    let html = "<h4>Move Type Distribution</h4>";
    Object.entries(coverage).sort((a,b)=>b[1]-a[1]).forEach(([type, count]) => {
        html += `<div>${type}: ${count}</div>`;
    });
    return html;
}

function renderRecommendations() {
    const weakData = analyzeTeamWeakness();
    const biggestWeak = Object.entries(weakData).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
    const candidates = gameData.pokemon.filter(p => !team.some(m => m.name === p.name));
    
    const scored = candidates.map(p => {
        let score = 0;
        p.types.forEach(t => {
            const d = typeChart[t];
            if (d) biggestWeak.forEach(w => { if (d.resists.includes(w) || d.immuneTo.includes(w)) score += 2; });
        });
        return { ...p, score };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

    let html="<h4>Fix Suggestions</h4>";
    scored.forEach(p=>{ html+=`<button onclick="addToTeam('${p.name}')">+ ${p.name}</button> `; });
    return html;
}

// ==========================
// IV / DV CALCULATOR MATH
// ==========================
function getEVSpread(pokemon) {
    if (!pokemon || !pokemon.baseStats) return ["attack", "speed"];
    return pokemon.baseStats.attack > pokemon.baseStats.spAttack ? ["attack", "speed"] : ["spAttack", "speed"];
}

function calculateStatRange(pokemon, level, observedStats, natureName, isMale = null) {
    const base = pokemon.baseStats;
    const isGen2 = currentGame === "gsc";
    const maxIV = isGen2 ? 15 : 31;
    let result = {};

    let natureMod = { increased: null, decreased: null };
    if (!isGen2 && natureName) {
        natureMod = gameData.natures.find(n => n.name === natureName) || natureMod;
    }

    const statsToCheck = isGen2 ? ["attack","defense","speed","spAttack"] : ["attack","defense","speed","spAttack","spDefense"];

    statsToCheck.forEach(stat => {
        let matches = [];
        for (let iv = 0; iv <= maxIV; iv++) {
            // Gen 2 Gender Check (Attack DV)
            if (isGen2 && stat === "attack") {
                if (isMale === true && iv < 8) continue;
                if (isMale === false && iv > 7) continue;
            }

            let calc;
            if (isGen2) {
                // GEN 2 FORMULA
                calc = Math.floor(((base[stat] + iv) * 2 * level) / 100) + 5;
            } else {
                // GEN 3 FORMULA
                let modifier = 1.0;
                if (natureMod.increased === stat) modifier = 1.1;
                if (natureMod.decreased === stat) modifier = 0.9;
                calc = Math.floor((Math.floor(((base[stat] * 2 + iv) * level) / 100) + 5) * modifier);
            }

            if (Math.abs(calc - observedStats[stat]) <= 1) matches.push(iv);
        }
        result[stat] = matches;
    });
    return result;
}

function runIVCalc(name) {
    const p = gameData.pokemon.find(x => x.name === name);
    if (!p) return;
    
    const level = parseInt(document.getElementById("ivLevel").value);
    const nature = document.getElementById("ivNature")?.value || null;
    const isMale = document.getElementById("ivGender").value === "male" ? true : document.getElementById("ivGender").value === "female" ? false : null;

    const stats = {
        attack: parseInt(document.getElementById("ivAttack").value) || 0,
        defense: parseInt(document.getElementById("ivDefense").value) || 0,
        speed: parseInt(document.getElementById("ivSpeed").value) || 0,
        spAttack: parseInt(document.getElementById("ivSpAttack").value) || 0,
        spDefense: parseInt(document.getElementById("ivSpDefense")?.value || 0)
    };

    if (isNaN(level)) { alert("Enter a level!"); return; }

    const raw = calculateStatRange(p, level, stats, nature, isMale);
    const maxIV = currentGame === "gsc" ? 15 : 31;

    let html = `<h4>${currentGame === 'gsc' ? 'DV' : 'IV'} Results</h4>`;

    Object.entries(raw).forEach(([stat, vals]) => {
        const min = vals.length ? Math.min(...vals) : "-";
        const max = vals.length ? Math.max(...vals) : "-";
        const pct = getIVPercentile(vals, maxIV).toFixed(1);

        html += `
            <div>
                <strong>${stat.toUpperCase()}</strong>: ${min}–${max}
                <span style="color:#666;">(${pct}%)</span>
            </div>
        `;
    });

    if (currentGame === "gsc") {
        const hpDVs = calculateHPDVGen2(raw);
        const minHP = hpDVs.length ? Math.min(...hpDVs) : "-";
        const maxHP = hpDVs.length ? Math.max(...hpDVs) : "-";
        const pct = getIVPercentile(hpDVs, 15).toFixed(1);

        html += `
            <div style="margin-top:10px; border-top:1px solid #ddd; padding-top:5px;">
                <strong>HP DV</strong>: ${minHP}–${maxHP}
                <span style="color:#666;">(${pct}%)</span>
            </div>
        `;
    }

    document.getElementById("ivResult").innerHTML = html;
}


function calculateHPDVGen2(result) {
    let hpDVs = [];
    if(!result.attack.length || !result.defense.length) return [];
    
    result.attack.forEach(a => {
        result.defense.forEach(d => {
            result.speed.forEach(s => {
                result.spAttack.forEach(sp => {
                    const hp = ((a % 2) << 3) | ((d % 2) << 2) | ((s % 2) << 1) | (sp % 2);
                    hpDVs.push(hp);
                });
            });
        });
    });
    return [...new Set(hpDVs)];
}

function getIVPercentile(range, maxIV) {
    if (!range.length) return 0;
    const avg = range.reduce((a,b)=>a+b,0) / range.length;
    return (avg / maxIV) * 100;
}


// ==========================
// COMPARISON TOOL
// ==========================

// Renders the search box or the selected name for each slot
function renderCompareSlot(slotIndex) {
    const selected = compareSelection[slotIndex];
    if (selected) {
        return `
            <div class="compare-slot-active">
                <strong>${selected.name}</strong> 
                <button onclick="clearCompareSlot(${slotIndex})">Change</button>
            </div>
        `;
    }
    return `
        <input type="text" placeholder="Search Pokémon..." 
               oninput="searchCompare(${slotIndex}, this.value)">
        <div id="compare-results-${slotIndex}" class="compare-results-dropdown"></div>
    `;
}

// Handles searching within the comparison slots
function searchCompare(slotIndex, query) {
    const resultsDiv = document.getElementById(`compare-results-${slotIndex}`);
    if (!query) { resultsDiv.innerHTML = ""; return; }
    
    const matches = gameData.pokemon
        .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5);

    resultsDiv.innerHTML = matches.map(p => `
        <div onclick="selectCompare(${slotIndex}, '${p.name}')" style="cursor:pointer; padding:5px; border-bottom:1px solid #ddd;">
            ${p.name}
        </div>
    `).join('');
}

function selectCompare(slotIndex, name) {
    const pokemon = gameData.pokemon.find(p => p.name === name);
    compareSelection[slotIndex] = pokemon;
    openPage('compare'); // Refresh the page to show the selection
}

function clearCompareSlot(slotIndex) {
    compareSelection[slotIndex] = null;
    openPage('compare');
}

// Generates the side-by-side data
function renderComparisonTable() {
    const tableDiv = document.getElementById("comparisonTable");
    const [p1, p2] = compareSelection;

    if (!p1 || !p2) {
        tableDiv.innerHTML = "<p>Select two Pokémon to see the comparison.</p>";
        return;
    }

    const stats = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];
    
    let html = `<div class="compare-grid" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; border:1px solid #ccc; padding:10px;">
        <div><strong>Stat</strong></div>
        <div><strong>${p1.name}</strong></div>
        <div><strong>${p2.name}</strong></div>
        
        <div style="grid-column: span 3; background:#eee; padding:5px;"><strong>Base Stats</strong></div>
    `;

    stats.forEach(s => {
        const v1 = p1.baseStats[s];
        const v2 = p2.baseStats[s];
        const winner1 = v1 > v2 ? "font-weight:bold; color:green;" : "";
        const winner2 = v2 > v1 ? "font-weight:bold; color:green;" : "";

        html += `
            <div style="text-transform: capitalize;">${s}</div>
            <div style="${winner1}">${v1}</div>
            <div style="${winner2}">${v2}</div>
        `;
    });

    html += `
        <div style="grid-column: span 3; background:#eee; padding:5px;"><strong>Details</strong></div>
        <div>Types</div>
        <div>${p1.types.join('/')}</div>
        <div>${p2.types.join('/')}</div>
        
        <div>Top Moves</div>
        <div>${getBestMoves(p1.name).map(m => m.move).join('<br>')}</div>
        <div>${getBestMoves(p2.name).map(m => m.move).join('<br>')}</div>
    </div>`;

    tableDiv.innerHTML = html;
}
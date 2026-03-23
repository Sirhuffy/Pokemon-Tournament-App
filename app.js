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
async function initApp() {
    try {
        await Promise.all([loadGameData(), loadMoveData(), loadLearnsets()]);
        loadSavedTeam(); 
        console.log("All data loaded!");
    } catch (error) {
        console.error("Error loading JSON:", error);
    }
}

async function loadGameData() { const r = await fetch("data/pokemon-core.json"); gameData.pokemon = await r.json(); }
async function loadMoveData() { const r = await fetch("data/moves.json"); gameData.moves = await r.json(); }
async function loadLearnsets() { const r = await fetch("data/learnsets.json"); gameData.learnsets = await r.json(); }
initApp();

// ==========================
// STORAGE FUNCTIONS
// ==========================
function saveTeam() { localStorage.setItem("pokemonTeam", JSON.stringify(team)); }
function loadSavedTeam() {
    const saved = localStorage.getItem("pokemonTeam");
    if (saved) { team = JSON.parse(saved); }
}
function clearTeam() {
    if (confirm("Are you sure you want to clear your entire team?")) {
        team = [];
        saveTeam();
        updateTeamDisplay();
    }
}

// ==========================
// PAGE NAVIGATION
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
            <input id='teamSearch' placeholder='Add to Team...'>
            <div id='teamSearchResults' style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; margin: 10px;"></div>
            <div id='teamDisplay'></div>
        `;
        document.getElementById("teamSearch").addEventListener("input", updateTeamSearch);
        updateTeamDisplay();
    }
    else if (page === "weakness") {
        content.innerHTML = `<h2>Weakness Calculator</h2><div id='weaknessContent'></div>`;
        document.getElementById("weaknessContent").innerHTML = renderWeaknessAnalysis();
    }
    else if (page === "pokedex") {
        let html = "<h2>Pokedex</h2>";
        html += "<input id='pokeSearch' placeholder='Search...'>";
        
        const types = ["Normal","Fire","Water","Grass","Electric","Ice","Fighting","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel"];
        html += "<div id='typeButtons' style='margin-bottom:10px;'>";
        types.forEach(t => {
            html += `<button onclick="filterByType('${t}')" style="margin:2px; font-size:12px;">${t}</button>`;
        });
        html += `<button onclick="clearTypeFilter()">All</button></div>`;
        html += "<div id='pokeResults'></div>";

        content.innerHTML = html;
        document.getElementById("pokeSearch").addEventListener("input", updateResults);
        updateResults();
    }
} // <-- This is where the function correctly ends now!

// ==========================
// RESULTS & DISPLAY
// ==========================
function updateResults() {
    const query = document.getElementById("pokeSearch")?.value?.toLowerCase() || "";
    let results = gameData.pokemon;

    if (query) { results = results.filter(p => p.name.toLowerCase().includes(query)); }
    if (selectedType) { results = results.filter(p => p.types.includes(selectedType)); }

    let html = "";
    results.slice(0, 50).forEach(p => {
        html += `
            <div class="poke-entry" onclick="showPokemon('${p.name}')" style="cursor:pointer; padding:10px; border-bottom:1px solid #eee;">
                <strong>${p.name}</strong> (${p.types.join("/")})
            </div>`;
    });
    document.getElementById("pokeResults").innerHTML = html;
}

function showPokemon(name) {
    const p = gameData.pokemon.find(x => x.name === name);
    if (!p) return;
    document.getElementById("content").innerHTML = `
        <h2>${p.name}</h2>
        <p>Types: ${p.types.join(", ")}</p>
        <button onclick="openPage('pokedex')">Back</button>
    `;
}

// ==========================
// TEAM LOGIC
// ==========================
function updateTeamSearch() {
    const query = document.getElementById("teamSearch").value.toLowerCase();
    if (!query) { document.getElementById("teamSearchResults").innerHTML = ""; return; }
    let results = gameData.pokemon.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
    let html = "";
    results.forEach(p => {
        html += `<div onclick="addToTeam('${p.name}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer;">+ ${p.name}</div>`;
    });
    document.getElementById("teamSearchResults").innerHTML = html;
}

function addToTeam(name) {
    if (team.length >= 6) { alert("Max 6 Pokemon!"); return; }
    if (team.includes(name)) { alert("Already added!"); return; }
    team.push(name);
    saveTeam();
    document.getElementById("teamSearch").value = "";
    document.getElementById("teamSearchResults").innerHTML = "";
    updateTeamDisplay();
}

function removeFromTeam(name) {
    team = team.filter(p => p !== name);
    saveTeam();
    updateTeamDisplay();
}

function updateTeamDisplay() {
    const displayArea = document.getElementById("teamDisplay");
    if (!displayArea) return;

    let html = "<h3>Your Team</h3>";
    if (team.length > 0) {
        html += `<button onclick="clearTeam()" style="background:orange; color:white; border:none; padding:10px; margin-bottom:10px; border-radius:5px;">Clear Full Team</button>`;
        html += "<div style='display:flex; flex-wrap:wrap; gap:10px; justify-content:center;'>";
        team.forEach(name => {
            const p = gameData.pokemon.find(x => x.name === name);
            if (!p) return;
            html += `
                <div style="border:2px solid #cc0000; background:white; border-radius:10px; padding:10px; width:120px;">
                    <strong>${p.name}</strong><br>
                    <small>${p.types.join("/")}</small><br>
                    <button onclick="removeFromTeam('${p.name}')" style="background:#ff4444; color:white; border:none; border-radius:4px; margin-top:5px;">Remove</button>
                </div>`;
        });
        html += "</div><hr>";
        html += renderWeaknessAnalysis();
        html += renderRecommendations();
    } else {
        html += "<p>Your team is empty. Add Pokemon above.</p>";
    }
    displayArea.innerHTML = html;
}

// ==========================
// HELPERS
// ==========================
function filterByType(type) {
    selectedType = type;
    updateResults();
}

function clearTypeFilter() {
    selectedType = null;
    updateResults();
}

function analyzeTeamWeakness() {
    let results = {};
    Object.keys(typeChart).forEach(type => results[type] = 0);
    team.forEach(name => {
        const p = gameData.pokemon.find(x => x.name === name);
        if (!p) return;
        p.types.forEach(t => {
            const data = typeChart[t];
            data.weakTo.forEach(w => results[w] += 1);
            data.resists.forEach(r => results[r] -= 1);
            data.immuneTo.forEach(i => results[i] -= 2);
        });
    });
    return results;
}

function renderWeaknessAnalysis() {
    const results = analyzeTeamWeakness();
    let html = "<h4>Weakness Analysis</h4>";
    Object.entries(results).sort((a, b) => b[1] - a[1]).forEach(([type, score]) => {
        if (score === 0) return;
        let color = score > 0 ? "#cc0000" : "#2e7d32";
        html += `<div style="color:${color}">${type}: ${score}</div>`;
    });
    return html;
}

function recommendFixes() {
    const weaknessScores = analyzeTeamWeakness();
    const biggestWeaknesses = Object.entries(weaknessScores).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([type]) => type);
    let candidates = gameData.pokemon.filter(p => !team.includes(p.name));
    const scored = candidates.map(p => {
        let fixScore = 0;
        p.types.forEach(t => {
            const data = typeChart[t];
            biggestWeaknesses.forEach(w => {
                if (data.resists.includes(w)) fixScore += 2;
                if (data.immuneTo.includes(w)) fixScore += 3;
            });
        });
        return { ...p, score: fixScore };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    return { weaknesses: biggestWeaknesses, picks: scored };
}

function renderRecommendations() {
    const data = recommendFixes();
    if (data.picks.length === 0) return "";
    let html = `<h4>Recommended Fixes</h4>`;
    data.picks.forEach(p => {
        html += `<button onclick="addToTeam('${p.name}')" style="margin:5px;">+ ${p.name}</button>`;
    });
    return html;
}
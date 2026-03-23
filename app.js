// ==========================
// INITIAL STATE
// ==========================
let currentGame = "gsc"
let levelCap = 55
let gameData = { pokemon: [], moves: [], learnsets: [] }
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
        await Promise.all([loadGameData(), loadMoveData(), loadLearnsets()]);
        loadSavedTeam();
        console.log("All data loaded!");
    } catch (error) {
        console.error("Error loading JSON:", error);
    }
}

async function loadGameData() {
    const r = await fetch("data/pokemon-core.json")
    gameData.pokemon = await r.json()
}

async function loadMoveData() {
    const r = await fetch("data/moves.json")
    gameData.moves = await r.json()
}

async function loadLearnsets() {
    const r = await fetch("data/learnsets.json")
    gameData.learnsets = await r.json()
}

initApp()

// ==========================
// STORAGE
// ==========================
function saveTeam() {
    localStorage.setItem("pokemonTeam", JSON.stringify(team))
}

function loadSavedTeam() {
    const saved = localStorage.getItem("pokemonTeam")
    if (saved) team = JSON.parse(saved)
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
            <input id='teamSearch' placeholder='Add to Team...'>
            <div id='teamSearchResults'></div>
            <div id='teamDisplay'></div>
        `
        document.getElementById("teamSearch").addEventListener("input", updateTeamSearch)
        updateTeamDisplay()
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
        html += `
        <div onclick="showPokemon('${p.name}')">
            ${p.name} (${p.types.join("/")}) - ${selectedSort==="bst"?total:p.baseStats[selectedSort]}
        </div>`
    })

    document.getElementById("pokeResults").innerHTML = html
}

function showPokemon(name) {
    const p = gameData.pokemon.find(x => x.name === name)
    if (!p) return

    const moves = getMovesForLevel(name)

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
        html += `<div>Lv ${m.level}: ${m.move}</div>`
    })

    html += `<button onclick="openPage('pokedex')">Back</button>`

    document.getElementById("content").innerHTML = html
}

// ==========================
// TEAM BUILDER
// ==========================
function updateTeamSearch() {
    const query = document.getElementById("teamSearch").value.toLowerCase()

    let results = gameData.pokemon.filter(p=>p.name.toLowerCase().includes(query)).slice(0,5)

    let html=""
    results.forEach(p=>{
        html += `<div onclick="addToTeam('${p.name}')">+ ${p.name}</div>`
    })

    document.getElementById("teamSearchResults").innerHTML = html
}

function addToTeam(name) {
    if (team.length>=6) return alert("Max 6")
    if (team.includes(name)) return alert("Already added")

    team.push(name)
    saveTeam()
    updateTeamDisplay()
}

function removeFromTeam(name) {
    team = team.filter(p=>p!==name)
    saveTeam()
    updateTeamDisplay()
}

function updateTeamDisplay() {
    const el = document.getElementById("teamDisplay")
    if (!el) return

    let html="<h3>Your Team</h3>"

    if (team.length===0){
        html+="Empty"
    } else {

        html+=`<button onclick="clearTeam()">Clear</button>`
        html+=`<div style="display:flex;gap:10px;flex-wrap:wrap;">`

        team.forEach(name=>{
            const p = gameData.pokemon.find(x=>x.name===name)
            html+=`
            <div style="border:1px solid #ccc;padding:10px;">
                ${p.name}<br>
                ${p.types.join("/")}<br>
                <button onclick="removeFromTeam('${p.name}')">Remove</button>
            </div>`
        })

        html+="</div>"
        html+=renderWeaknessAnalysis()
        html+=renderRecommendations()
    }

    el.innerHTML=html
}

// ==========================
// ANALYSIS
// ==========================
function analyzeTeamWeakness() {
    let results={}
    Object.keys(typeChart).forEach(t=>results[t]=0)

    team.forEach(name=>{
        const p=gameData.pokemon.find(x=>x.name===name)
        if(!p)return

        p.types.forEach(t=>{
            const d=typeChart[t]
            d.weakTo.forEach(w=>results[w]+=1)
            d.resists.forEach(r=>results[r]-=1)
            d.immuneTo.forEach(i=>results[i]-=2)
        })
    })

    return results
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

function recommendFixes() {
    const weak = Object.entries(analyzeTeamWeakness())
        .sort((a,b)=>b[1]-a[1])
        .slice(0,2)
        .map(([t])=>t)

    const candidates = gameData.pokemon.filter(p=>!team.includes(p.name))

    const scored = candidates.map(p=>{
        let score=0
        p.types.forEach(t=>{
            const d=typeChart[t]
            weak.forEach(w=>{
                if(d.resists.includes(w)) score+=2
                if(d.immuneTo.includes(w)) score+=3
            })
        })
        return {...p,score}
    }).sort((a,b)=>b.score-a.score).slice(0,3)

    return {weak,scored}
}

function renderRecommendations() {
    const data = recommendFixes()
    let html="<h4>Fix Suggestions</h4>"

    data.scored.forEach(p=>{
        html+=`<button onclick="addToTeam('${p.name}')">+ ${p.name}</button>`
    })

    return html
}
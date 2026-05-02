/* ==================================================================
   Pokemon Tournament Companion — app.js
   Tournament rules: 18-hour fresh-start, level cap 55/60, no
   legendaries on battle teams, no accuracy-reducers, no non-damaging
   recovery. Supports Gold/Silver/Crystal, Ruby/Sapphire/Emerald,
   FireRed/LeafGreen with per-game movesets and encounter data.
   ================================================================== */

"use strict";

// ============================ STATE ============================
const STATE = {
  rules: null,
  currentGame: "crystal",
  levelCap: 55,
  currentPage: "team",
  team: [],            // array of pokemon names
};

// Raw data caches
const DATA = {
  pokemon: [],
  moves: [],
  learnsets: [],
  encounters: [],
  natures: [],
  items: [],          // optional — populated once user runs build_items.py
  machines: null,     // optional — { perGame, compatibility } from build_machines.py
  evYields: [],       // optional — populated once user runs build_pokemon_evs.py
  candies: null,      // optional — { perGame: { game: [{location, notes, source}] } }
  trades: null,       // optional — { perGame: { game: [{npc, location, gives, ...}] } }
};

// Indexed for O(1) lookup (we have ~386 mons / 354 moves)
const IDX = {
  pokemonByName: {},
  movesByName: {},
  learnsetsByName: {},
  encountersByName: {},
  itemsByName: {},
  tmsByPokemon: {},   // { pokemonName -> { versionGroup -> [moveName, ...] } }
  evByPokemon: {},    // { pokemonName -> { hp, attack, defense, spAttack, spDefense, speed } }
};

// Type chart (Gen 2+ — Steel/Dark exist; in Gen 1 they don't, but
// the games we cover are all Gen 2/3 so this single table is fine)
const TYPE_CHART = {
  Normal:   { weakTo: ["Fighting"], resists: [], immuneTo: ["Ghost"] },
  Fire:     { weakTo: ["Water","Ground","Rock"], resists: ["Fire","Grass","Ice","Bug","Steel"], immuneTo: [] },
  Water:    { weakTo: ["Electric","Grass"], resists: ["Fire","Water","Ice","Steel"], immuneTo: [] },
  Grass:    { weakTo: ["Fire","Ice","Poison","Flying","Bug"], resists: ["Water","Electric","Grass","Ground"], immuneTo: [] },
  Electric: { weakTo: ["Ground"], resists: ["Electric","Flying","Steel"], immuneTo: [] },
  Ice:      { weakTo: ["Fire","Fighting","Rock","Steel"], resists: ["Ice"], immuneTo: [] },
  Fighting: { weakTo: ["Flying","Psychic"], resists: ["Bug","Rock","Dark"], immuneTo: [] },
  Poison:   { weakTo: ["Ground","Psychic"], resists: ["Grass","Fighting","Poison","Bug"], immuneTo: [] },
  Ground:   { weakTo: ["Water","Grass","Ice"], resists: ["Poison","Rock"], immuneTo: ["Electric"] },
  Flying:   { weakTo: ["Electric","Ice","Rock"], resists: ["Grass","Fighting","Bug"], immuneTo: ["Ground"] },
  Psychic:  { weakTo: ["Bug","Ghost","Dark"], resists: ["Fighting","Psychic"], immuneTo: [] },
  Bug:      { weakTo: ["Fire","Flying","Rock"], resists: ["Grass","Fighting","Ground"], immuneTo: [] },
  Rock:     { weakTo: ["Water","Grass","Fighting","Ground","Steel"], resists: ["Normal","Fire","Poison","Flying"], immuneTo: [] },
  Ghost:    { weakTo: ["Ghost","Dark"], resists: ["Poison","Bug"], immuneTo: ["Normal","Fighting"] },
  Dragon:   { weakTo: ["Ice","Dragon"], resists: ["Fire","Water","Electric","Grass"], immuneTo: [] },
  Dark:     { weakTo: ["Fighting","Bug"], resists: ["Ghost","Dark"], immuneTo: ["Psychic"] },
  Steel:    { weakTo: ["Fire","Fighting","Ground"], resists: ["Normal","Grass","Ice","Flying","Psychic","Bug","Rock","Dragon","Steel"], immuneTo: ["Poison"] },
};

// ============================ INIT ============================
window.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  try {
    // Load all data in parallel. tournament-rules.json is required;
    // others degrade gracefully if missing.
    const [rulesRes, pokemonRes, movesRes, learnsetsRes, encountersRes, naturesRes, itemsRes, machinesRes, evRes, candiesRes, tradesRes] = await Promise.all([
      fetchJSON("data/tournament-rules.json", true),
      fetchJSON("data/pokemon-core.json", true),
      fetchJSON("data/moves.json", true),
      fetchJSON("data/learnsets.json", true),
      fetchJSON("data/encounters.json", false),
      fetchJSON("data/natures.json", false),
      fetchJSON("data/items.json", false),
      fetchJSON("data/machines.json", false),
      fetchJSON("data/ev-yields.json", false),
      fetchJSON("data/rare-candies.json", false),
      fetchJSON("data/in-game-trades.json", false),
    ]);

    STATE.rules     = rulesRes;
    DATA.pokemon    = pokemonRes || [];
    DATA.moves      = movesRes || [];
    DATA.learnsets  = learnsetsRes || [];
    DATA.encounters = encountersRes || [];
    DATA.natures    = naturesRes || [];
    DATA.items      = Array.isArray(itemsRes) ? itemsRes : [];
    // machines.json may be in old shape (from PokeAPI build) or null
    DATA.machines   = (machinesRes && machinesRes.perGame) ? machinesRes : null;
    DATA.evYields   = Array.isArray(evRes) ? evRes : [];
    DATA.candies    = (candiesRes && candiesRes.perGame) ? candiesRes : null;
    DATA.trades     = (tradesRes && tradesRes.perGame) ? tradesRes : null;

    // Build indexes
    DATA.pokemon.forEach(p    => IDX.pokemonByName[p.name] = p);
    DATA.moves.forEach(m      => IDX.movesByName[m.name] = m);
    DATA.learnsets.forEach(l  => IDX.learnsetsByName[l.pokemon] = l);
    DATA.encounters.forEach(e => IDX.encountersByName[e.pokemon] = e);
    DATA.items.forEach(it     => IDX.itemsByName[it.name] = it);
    if (DATA.machines && Array.isArray(DATA.machines.compatibility)) {
      DATA.machines.compatibility.forEach(c => IDX.tmsByPokemon[c.pokemon] = c.tms);
    }
    DATA.evYields.forEach(e => IDX.evByPokemon[e.pokemon] = e.yield);

    loadSavedState();
    bindControls();
    applyTheme();
    openPage(STATE.currentPage);

    // Register service worker (PWA)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  } catch (err) {
    console.error("Init failed:", err);
    document.getElementById("content").innerHTML =
      `<div class="empty"><span class="emoji">⚠️</span>
        <p>Failed to load data.</p>
        <p class="tiny">${escapeHtml(err.message || String(err))}</p></div>`;
  }
}

async function fetchJSON(url, required) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim()) return null;          // empty file is OK if not required
    return JSON.parse(text);
  } catch (e) {
    if (required) throw e;
    console.warn(`Optional data file ${url} unavailable:`, e.message);
    return null;
  }
}

// ============================ PERSISTENCE ============================
const LS_KEYS = { team: "ptc.team", game: "ptc.game", levelCap: "ptc.levelCap", page: "ptc.page" };

function saveState() {
  try {
    localStorage.setItem(LS_KEYS.team, JSON.stringify(STATE.team));
    localStorage.setItem(LS_KEYS.game, STATE.currentGame);
    localStorage.setItem(LS_KEYS.levelCap, String(STATE.levelCap));
    localStorage.setItem(LS_KEYS.page, STATE.currentPage);
  } catch (e) { /* localStorage may be unavailable */ }
}

function loadSavedState() {
  try {
    const team = JSON.parse(localStorage.getItem(LS_KEYS.team) || "[]");
    if (Array.isArray(team)) {
      // names only — drop anything that isn't in our pokedex
      STATE.team = team
        .map(t => typeof t === "string" ? t : t?.name)
        .filter(n => n && IDX.pokemonByName[n]);
    }
    const g = localStorage.getItem(LS_KEYS.game);
    if (g && STATE.rules.games[g]) STATE.currentGame = g;
    const lc = parseInt(localStorage.getItem(LS_KEYS.levelCap), 10);
    if (lc === 55 || lc === 60) STATE.levelCap = lc;
    const pg = localStorage.getItem(LS_KEYS.page);
    if (pg) STATE.currentPage = pg;
  } catch (e) { /* ignore */ }
}

// ============================ CONTROL BINDING ============================
function bindControls() {
  const gameSelect = document.getElementById("gameSelect");
  const levelCap   = document.getElementById("levelCap");
  const navTabs    = document.getElementById("navTabs");

  gameSelect.value = STATE.currentGame;
  levelCap.value   = String(STATE.levelCap);

  gameSelect.addEventListener("change", (e) => {
    STATE.currentGame = e.target.value;
    mapState.openArea = null; // areas don't carry across game families
    applyTheme();
    saveState();
    openPage(STATE.currentPage);
  });
  levelCap.addEventListener("change", (e) => {
    STATE.levelCap = parseInt(e.target.value, 10);
    saveState();
    openPage(STATE.currentPage);
  });
  navTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn) return;
    openPage(btn.dataset.page);
  });
}

function applyTheme() {
  const family = STATE.rules.games[STATE.currentGame].family;
  document.body.dataset.gameFamily = family;
  // also update subtitle text with current level cap
  const subtitle = document.getElementById("ruleSubtitle");
  if (subtitle) {
    subtitle.textContent =
      `No legendaries · Lvl ${STATE.levelCap} cap · No accuracy-reducers · Recovery only if it damages`;
  }
}

// ============================ ROUTER ============================
function openPage(page) {
  STATE.currentPage = page;
  saveState();

  // tab active state
  document.querySelectorAll("#navTabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });

  switch (page) {
    case "team":      return renderTeamPage();
    case "pokedex":   return renderPokedexPage();
    case "maps":      return renderMapsPage();
    case "moves":     return renderMovesPage();
    case "items":     return renderItemsPage();
    case "tms":       return renderTMsPage();
    case "ivcalc":    return renderIVCalcPage();
    case "weakness":  return renderWeaknessPage();
    case "typechart": return renderTypeChartPage();
    case "evtrain":   return renderEVTrainPage();
    case "candies":   return renderCandiesPage();
    case "trades":    return renderTradesPage();
    case "rules":     return renderRulesPage();
    default:          return renderTeamPage();
  }
}

// ============================ HELPERS ============================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function setContent(html) { document.getElementById("content").innerHTML = html; }

let toastTimer = null;
function toast(msg, kind = "") {
  const el = document.getElementById("toast");
  el.className = "toast " + kind + " show";
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function gameInfo() { return STATE.rules.games[STATE.currentGame]; }

function getLearnset(name) {
  const entry = IDX.learnsetsByName[name];
  if (!entry) return [];
  return entry.learnset[gameInfo().learnsetKey] || [];
}

function getEncounters(name) {
  const entry = IDX.encountersByName[name];
  if (!entry) return [];
  return entry.games?.[gameInfo().encountersKey] || [];
}

function isLegendary(name) {
  return STATE.rules.legendaries.includes(name);
}

// Returns "banned" | "warn" | "ok"
function moveStatus(moveName) {
  const banned = STATE.rules.bannedMoves;
  const warn   = STATE.rules.warnMoves;
  for (const cat of Object.values(banned)) {
    if (cat.moves.includes(moveName)) return "banned";
  }
  for (const cat of Object.values(warn)) {
    if (cat.moves.includes(moveName)) return "warn";
  }
  return "ok";
}

// Pokemon-availability heuristic: in GSC, only gens 1+2 (#1–251); in
// RSE/FRLG, all gens 1–3. Doesn't account for cartridge-specific
// version exclusives — we surface that via the encounter list.
function isInRegionalDex(pokemon) {
  const family = gameInfo().family;
  if (family === "gsc") return pokemon.number <= 251;
  return pokemon.number <= 386;
}

function getMoveData(name) { return IDX.movesByName[name] || null; }

function bestLegalMoves(pokemonName, count = 4) {
  const learnset = getLearnset(pokemonName).filter(m => m.level <= STATE.levelCap);
  const seen = new Set();
  const moves = [];
  for (const m of learnset) {
    if (seen.has(m.move)) continue;
    seen.add(m.move);
    if (moveStatus(m.move) === "banned") continue;
    moves.push(m);
  }
  const p = IDX.pokemonByName[pokemonName];
  // Score: power + STAB bonus, status moves get a small floor
  const scored = moves.map(m => {
    const md = getMoveData(m.move);
    let score = 0;
    if (md) {
      score += md.power || 0;
      if (md.power && p && p.types.includes(md.type)) score += 30; // STAB
      if (!md.power) score += 5; // status floor so we keep one if no others
    }
    return { ...m, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, count);
}

function teamViolations() {
  const issues = [];
  for (const name of STATE.team) {
    if (isLegendary(name)) {
      issues.push({ pokemon: name, kind: "legendary", message: `${name} is a legendary — battle teams must not include legendaries.` });
    }
    const learnset = getLearnset(name);
    // Don't flag banned moves on the *whole* learnset — only flag if the
    // user later picks a curated 4-move loadout with one. For v1 we just
    // surface this informationally as part of the move list rendering.
  }
  return issues;
}

// ============================ TEAM PAGE ============================
function renderTeamPage() {
  const violations = teamViolations();
  const teamObjs = STATE.team.map(n => IDX.pokemonByName[n]).filter(Boolean);

  let html = `
    <h2>Team Builder</h2>
    <div class="team-summary">
      <div class="count"><strong>${teamObjs.length}</strong>/6 selected</div>
      <div class="row-actions">
        <button class="btn btn-ghost" id="addBtn">+ Add Pokémon</button>
        ${teamObjs.length ? `<button class="btn btn-danger" id="clearBtn">Clear</button>` : ""}
      </div>
    </div>
  `;

  if (violations.length) {
    html += `<div class="violation"><strong>Rule violations:</strong><br>`
         +  violations.map(v => `· ${escapeHtml(v.message)}`).join("<br>")
         +  `</div>`;
  }

  if (teamObjs.length === 0) {
    html += `<div class="empty"><span class="emoji">📋</span>
      <p>No Pokémon yet.</p>
      <p class="tiny">Tap + Add Pokémon to start building your team for ${escapeHtml(gameInfo().label)}.</p>
    </div>`;
  } else {
    html += `<div class="team-grid">`;
    for (const p of teamObjs) {
      html += renderTeamCard(p);
    }
    html += `</div>`;

    // Coverage analysis
    html += `<hr class="hr"><h3>Defensive Coverage</h3>` + renderWeaknessSummary(teamObjs);
    html += `<h3>Offensive Coverage</h3>` + renderOffenseSummary(teamObjs);
  }

  setContent(html);

  $("#addBtn")?.addEventListener("click", () => openPage("pokedex"));
  $("#clearBtn")?.addEventListener("click", () => {
    if (confirm("Clear your entire team?")) {
      STATE.team = [];
      saveState();
      openPage("team");
    }
  });
  // Wire per-card buttons
  $$(".team-card .remove-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const name = e.currentTarget.dataset.name;
      removeFromTeam(name);
    });
  });
}

function renderTeamCard(p) {
  const moves = bestLegalMoves(p.name, 4);
  const isLegend = isLegendary(p.name);
  const stats = p.baseStats;
  const total = Object.values(stats).reduce((a,b) => a+b, 0);

  let movesHtml = "";
  if (moves.length === 0) {
    movesHtml = `<div class="muted tiny" style="padding:6px 10px;">No legal level-up moves under cap.</div>`;
  } else {
    movesHtml = moves.map(m => {
      const md = getMoveData(m.move);
      const status = moveStatus(m.move);
      const badge = status === "warn"  ? `<span class="badge badge-warn">caution</span>` : "";
      const meta  = md ? `${md.type} · ${md.category} · ${md.power || "—"}/${md.accuracy || "—"}` : "";
      return `<div class="move">
                <div>
                  <span class="move-name">${escapeHtml(m.move)}</span>${badge}
                  <div class="move-meta">${escapeHtml(meta)} · Lv ${m.level}</div>
                </div>
              </div>`;
    }).join("");
  }

  const typesHtml = p.types.map(t => `<span class="type-pill type-${t}">${t}</span>`).join("");

  return `
    <div class="team-card">
      <div class="header">
        <div>
          <div class="name">#${p.number} ${escapeHtml(p.name)}${isLegend ? `<span class="badge badge-banned">Legendary</span>` : ""}</div>
          <div class="types">${typesHtml}</div>
        </div>
        <button class="btn btn-icon btn-ghost remove-btn" data-name="${escapeHtml(p.name)}" aria-label="Remove">×</button>
      </div>
      <div class="stats-row">
        <span><b>${stats.hp}</b>HP</span>
        <span><b>${stats.attack}</b>Atk</span>
        <span><b>${stats.defense}</b>Def</span>
        <span><b>${stats.spAttack}</b>SpA</span>
        <span><b>${stats.spDefense}</b>SpD</span>
        <span><b>${stats.speed}</b>Spe</span>
      </div>
      <div class="muted tiny" style="margin-top:4px;">BST ${total}</div>
      <div class="moves">${movesHtml}</div>
    </div>
  `;
}

function addToTeam(name) {
  if (STATE.team.includes(name)) {
    toast(`${name} is already on your team`);
    return;
  }
  if (STATE.team.length >= 6) {
    toast("Team is full (6 max)", "error");
    return;
  }
  if (isLegendary(name)) {
    toast(`${name} is a legendary — battle teams can't include legendaries`, "error");
    return;
  }
  STATE.team.push(name);
  saveState();
  toast(`Added ${name}`, "success");
  if (STATE.currentPage === "pokedex") renderPokedexPage();
  if (STATE.currentPage === "team") renderTeamPage();
}

function removeFromTeam(name) {
  STATE.team = STATE.team.filter(n => n !== name);
  saveState();
  toast(`Removed ${name}`);
  openPage(STATE.currentPage);
}

// ============================ POKEDEX PAGE ============================
let pokedexFilter = { query: "", type: null, sort: "bst", regionOnly: true, includeLegendary: false };

function renderPokedexPage() {
  const types = Object.keys(TYPE_CHART);
  const html = `
    <h2>Pokédex — ${escapeHtml(gameInfo().label)}</h2>
    <input type="search" id="pokeSearch" placeholder="Search by name…" value="${escapeHtml(pokedexFilter.query)}">
    <div class="flex" style="gap:8px; margin-top:8px; flex-wrap:wrap;">
      <select id="pokeSort" style="flex:1; min-width:120px;">
        <option value="bst">Sort: Total BST</option>
        <option value="number">Sort: Dex #</option>
        <option value="name">Sort: A–Z</option>
        <option value="hp">Sort: HP</option>
        <option value="attack">Sort: Attack</option>
        <option value="defense">Sort: Defense</option>
        <option value="spAttack">Sort: Sp. Atk</option>
        <option value="spDefense">Sort: Sp. Def</option>
        <option value="speed">Sort: Speed</option>
      </select>
      <select id="pokeType" style="flex:1; min-width:120px;">
        <option value="">All Types</option>
        ${types.map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>
    </div>
    <div class="flex" style="gap:14px; margin-top:8px; font-size:13px; color:var(--text-dim);">
      <label class="flex"><input type="checkbox" id="regionOnly" ${pokedexFilter.regionOnly ? "checked" : ""}> Region only</label>
      <label class="flex"><input type="checkbox" id="includeLegendary" ${pokedexFilter.includeLegendary ? "checked" : ""}> Show legendaries</label>
    </div>
    <div id="pokeResults" class="row-list" style="margin-top:12px;"></div>
  `;
  setContent(html);

  $("#pokeSearch").value = pokedexFilter.query;
  $("#pokeSort").value = pokedexFilter.sort;
  $("#pokeType").value = pokedexFilter.type || "";

  $("#pokeSearch").addEventListener("input", (e) => { pokedexFilter.query = e.target.value; updatePokedexResults(); });
  $("#pokeSort").addEventListener("change", (e) => { pokedexFilter.sort = e.target.value; updatePokedexResults(); });
  $("#pokeType").addEventListener("change", (e) => { pokedexFilter.type = e.target.value || null; updatePokedexResults(); });
  $("#regionOnly").addEventListener("change", (e) => { pokedexFilter.regionOnly = e.target.checked; updatePokedexResults(); });
  $("#includeLegendary").addEventListener("change", (e) => { pokedexFilter.includeLegendary = e.target.checked; updatePokedexResults(); });

  updatePokedexResults();
}

function updatePokedexResults() {
  const q = pokedexFilter.query.trim().toLowerCase();
  let results = DATA.pokemon.slice();

  if (pokedexFilter.regionOnly) results = results.filter(isInRegionalDex);
  if (!pokedexFilter.includeLegendary) results = results.filter(p => !isLegendary(p.name));
  if (pokedexFilter.type) results = results.filter(p => p.types.includes(pokedexFilter.type));
  if (q) results = results.filter(p => p.name.toLowerCase().includes(q));

  const sortKey = pokedexFilter.sort;
  if (sortKey === "bst") {
    results.sort((a, b) => bst(b) - bst(a));
  } else if (sortKey === "number") {
    results.sort((a, b) => a.number - b.number);
  } else if (sortKey === "name") {
    results.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    results.sort((a, b) => (b.baseStats[sortKey] || 0) - (a.baseStats[sortKey] || 0));
  }

  const max = 80;
  const truncated = results.length > max;
  results = results.slice(0, max);

  const html = results.map(p => {
    const onTeam = STATE.team.includes(p.name);
    const legend = isLegendary(p.name);
    const totalOrStat = sortKey === "bst" || sortKey === "number" || sortKey === "name"
      ? `BST ${bst(p)}` : `${sortKey} ${p.baseStats[sortKey]}`;
    return `
      <div class="row" data-name="${escapeHtml(p.name)}">
        <div class="row-main">
          <div class="name">#${p.number} ${escapeHtml(p.name)} ${legend ? `<span class="badge badge-banned">Legend</span>` : ""}</div>
          <div class="meta">
            ${p.types.map(t => `<span class="type-pill type-${t}">${t}</span>`).join("")}
            <span class="muted">· ${totalOrStat}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost view-btn" data-name="${escapeHtml(p.name)}">View</button>
          ${onTeam
            ? `<button class="btn btn-danger team-btn" data-name="${escapeHtml(p.name)}" data-action="remove">−</button>`
            : `<button class="btn btn-primary team-btn" data-name="${escapeHtml(p.name)}" data-action="add" ${legend ? "disabled style='opacity:.4;'" : ""}>+</button>`}
        </div>
      </div>`;
  }).join("");

  const status = truncated
    ? `<div class="status">Showing first ${max} of ${results.length + (DATA.pokemon.length - results.length - max + max)}+ — refine your search.</div>`
    : results.length === 0
      ? `<div class="empty"><span class="emoji">🔎</span><p>No Pokémon match your filters.</p></div>`
      : "";

  $("#pokeResults").innerHTML = html + status;

  $$("#pokeResults .team-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.name;
      if (btn.dataset.action === "add") addToTeam(name); else removeFromTeam(name);
    });
  });
  $$("#pokeResults .view-btn").forEach(btn => {
    btn.addEventListener("click", () => showPokemonDetail(btn.dataset.name));
  });
}

function bst(p) { return Object.values(p.baseStats).reduce((a, b) => a + b, 0); }

// ============================ POKEMON DETAIL ============================
function showPokemonDetail(name) {
  const p = IDX.pokemonByName[name];
  if (!p) return;

  const onTeam = STATE.team.includes(name);
  const legend = isLegendary(name);
  const learnset = getLearnset(name);
  const encounters = getEncounters(name);
  const max = Math.max(...Object.values(p.baseStats));
  const stats = p.baseStats;

  const allMovesHtml = learnset
    .filter(m => m.level <= STATE.levelCap)
    .map(m => {
      const md = getMoveData(m.move);
      const status = moveStatus(m.move);
      const badge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                    status === "warn"   ? `<span class="badge badge-warn">caution</span>` : "";
      const meta = md ? `${md.type} · ${md.category} · ${md.power || "—"}pw / ${md.accuracy || "—"}acc` : "";
      return `<div class="row">
        <div class="row-main">
          <div class="name">${escapeHtml(m.move)} ${badge}</div>
          <div class="meta">Lv ${m.level} · ${escapeHtml(meta)}</div>
        </div>
      </div>`;
    }).join("");

  const overCapMoves = learnset.filter(m => m.level > STATE.levelCap);
  const overCapHtml = overCapMoves.length === 0 ? "" : `
    <h3>Above level cap</h3>
    <div class="row-list">${overCapMoves.map(m => {
      const md = getMoveData(m.move);
      return `<div class="row" style="opacity:.55;">
        <div class="row-main">
          <div class="name">${escapeHtml(m.move)}</div>
          <div class="meta">Lv ${m.level} ${md ? "· " + md.type : ""}</div>
        </div>
      </div>`;
    }).join("")}</div>`;

  const encHtml = encounters.length === 0
    ? `<p class="muted tiny">No encounter data for ${escapeHtml(gameInfo().label)} (may be evolution-only or trade-required).</p>`
    : `<div class="row-list">${encounters.map(e => `<div class="row">
        <div class="row-main">
          <div class="name">${escapeHtml(e.area || "Unknown area")}</div>
          <div class="meta">${escapeHtml(e.method || "")} · ${escapeHtml(e.rate || "")} · Lv ${escapeHtml(e.levels || "?")}</div>
        </div>
      </div>`).join("")}</div>`;

  const html = `
    <button class="btn btn-ghost" id="backBtn" style="margin-bottom:10px;">← Back</button>
    <h2>#${p.number} ${escapeHtml(p.name)} ${legend ? `<span class="badge badge-banned">Legendary</span>` : ""}</h2>
    <div>${p.types.map(t => `<span class="type-pill type-${t}">${t}</span>`).join("")}</div>

    <h3>Base stats (BST ${bst(p)})</h3>
    <div class="stat-bars">
      ${["hp","attack","defense","spAttack","spDefense","speed"].map(s => `
        <div class="stat-label">${s}</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${(stats[s]/max*100).toFixed(0)}%"></div></div>
        <div class="stat-val">${stats[s]}</div>
      `).join("")}
    </div>

    <h3>Encounters in ${escapeHtml(gameInfo().label)}</h3>
    ${encHtml}

    <h3>Level-up moves (≤ ${STATE.levelCap})</h3>
    <div class="row-list">${allMovesHtml || `<div class="muted tiny">No moves learned by level up under cap.</div>`}</div>

    ${overCapHtml}

    ${renderTmCompatSection(name)}

    <div style="margin-top:18px; display:flex; gap:8px;">
      ${onTeam
        ? `<button class="btn btn-danger" id="teamBtn">Remove from Team</button>`
        : `<button class="btn btn-primary" id="teamBtn" ${legend ? "disabled style='opacity:.4;'" : ""}>Add to Team</button>`}
      <button class="btn btn-ghost" id="ivBtn">IV/DV Calc</button>
    </div>
  `;
  setContent(html);

  $("#backBtn").addEventListener("click", () => openPage("pokedex"));
  $("#teamBtn").addEventListener("click", () => {
    if (onTeam) removeFromTeam(name); else addToTeam(name);
  });
  $("#ivBtn").addEventListener("click", () => {
    ivCalcContext.pokemonName = name;
    openPage("ivcalc");
  });
}

// Returns HTML for the "TMs this Pokémon can learn in [game]" panel,
// or empty string if no machines data is loaded.
function renderTmCompatSection(pokemonName) {
  if (!DATA.machines) return "";
  const vg = gameInfo().learnsetKey;
  const compat = IDX.tmsByPokemon[pokemonName];
  if (!compat || !compat[vg] || compat[vg].length === 0) return "";

  const moves = compat[vg].slice().sort();
  // Cross-reference to which TM number each move is in this game
  const tmIndex = {};
  (DATA.machines.perGame[vg] || []).forEach(t => { tmIndex[t.move] = t.tm; });

  const html = moves.map(m => {
    const tm = tmIndex[m] || "";
    const md = getMoveData(m);
    const status = moveStatus(m);
    const badge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                  status === "warn"   ? `<span class="badge badge-warn">caution</span>` : "";
    return `<div class="row">
      <div class="row-main">
        <div class="name">${tm ? escapeHtml(tm) + " — " : ""}${escapeHtml(m)} ${badge}</div>
        <div class="meta">
          ${md ? `<span class="type-pill type-${md.type}">${md.type}</span>` : ""}
          ${md ? `<span class="muted">${md.power || "—"}pw / ${md.accuracy || "—"}acc</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  return `<h3>TM/HM compatibility (${moves.length})</h3>
          <div class="row-list">${html}</div>`;
}

// ============================ MOVES PAGE ============================
const movesFilter = { query: "", type: null, status: "all" /* all|banned|warn|ok */ };
function renderMovesPage() {
  const types = Object.keys(TYPE_CHART);
  const html = `
    <h2>Move Lookup</h2>
    <input type="search" id="moveSearch" placeholder="Search moves…" value="${escapeHtml(movesFilter.query)}">
    <div class="flex" style="gap:8px; margin-top:8px;">
      <select id="moveType" style="flex:1;">
        <option value="">All types</option>
        ${types.map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>
      <select id="moveStatus" style="flex:1;">
        <option value="all">All moves</option>
        <option value="banned">Banned only</option>
        <option value="warn">Caution only</option>
        <option value="ok">Allowed only</option>
      </select>
    </div>
    <div id="moveResults" class="row-list" style="margin-top:12px;"></div>
  `;
  setContent(html);
  $("#moveSearch").value = movesFilter.query;
  $("#moveType").value = movesFilter.type || "";
  $("#moveStatus").value = movesFilter.status;

  $("#moveSearch").addEventListener("input", (e) => { movesFilter.query = e.target.value; updateMoveResults(); });
  $("#moveType").addEventListener("change", (e) => { movesFilter.type = e.target.value || null; updateMoveResults(); });
  $("#moveStatus").addEventListener("change", (e) => { movesFilter.status = e.target.value; updateMoveResults(); });

  updateMoveResults();
}

function updateMoveResults() {
  const q = movesFilter.query.trim().toLowerCase();
  let res = DATA.moves.slice();
  if (q) res = res.filter(m => m.name.toLowerCase().includes(q));
  if (movesFilter.type) res = res.filter(m => m.type === movesFilter.type);
  if (movesFilter.status !== "all") {
    res = res.filter(m => moveStatus(m.name) === movesFilter.status);
  }
  res.sort((a, b) => a.name.localeCompare(b.name));

  const max = 100;
  const truncated = res.length > max;
  res = res.slice(0, max);

  const html = res.map(m => {
    const status = moveStatus(m.name);
    const badge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                  status === "warn"   ? `<span class="badge badge-warn">caution</span>` :
                  `<span class="badge badge-ok">ok</span>`;
    return `<div class="row">
      <div class="row-main">
        <div class="name">${escapeHtml(m.name)} ${badge}</div>
        <div class="meta">
          <span class="type-pill type-${m.type}">${m.type}</span>
          <span class="muted">${m.category || ""} · ${m.power || "—"}pw / ${m.accuracy || "—"}acc / ${m.pp || "—"}pp</span>
        </div>
        <div class="muted tiny" style="margin-top:4px;">${escapeHtml(m.effect || "")}</div>
      </div>
    </div>`;
  }).join("");

  $("#moveResults").innerHTML = html + (truncated
    ? `<div class="status">Showing first ${max} — refine your search.</div>`
    : res.length === 0 ? `<div class="empty"><span class="emoji">🔎</span><p>No moves match.</p></div>` : "");
}

// ============================ IV/DV CALCULATOR ============================
const ivCalcContext = { pokemonName: null };

function renderIVCalcPage() {
  const isGen2 = gameInfo().family === "gsc";
  const calcLabel = isGen2 ? "DV" : "IV";
  const teamOptions = STATE.team.length
    ? STATE.team.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")
    : "";
  const allOptions = DATA.pokemon
    .map(p => `<option value="${escapeHtml(p.name)}">#${p.number} ${escapeHtml(p.name)}</option>`)
    .join("");

  const html = `
    <h2>${calcLabel} Calculator</h2>
    <p class="muted tiny">${isGen2 ? "Gen 2 uses DVs (0–15) with derived HP." : "Gen 3 uses IVs (0–31) with nature modifiers."}</p>

    <label class="muted tiny">Pokémon</label>
    <select id="ivPokemon">
      <option value="">— Select Pokémon —</option>
      ${teamOptions ? `<optgroup label="Your team">${teamOptions}</optgroup>` : ""}
      <optgroup label="All Pokémon">${allOptions}</optgroup>
    </select>

    <div class="iv-grid">
      <div>
        <label class="muted tiny">Level</label>
        <input type="number" id="ivLevel" min="1" max="100" placeholder="e.g. 50">
      </div>
      ${isGen2 ? `
        <div>
          <label class="muted tiny">Gender (refines Atk DV)</label>
          <select id="ivGender">
            <option value="">Unknown</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>` : `
        <div>
          <label class="muted tiny">Nature</label>
          <select id="ivNature">
            <option value="">— None —</option>
            ${DATA.natures.map(n => `<option value="${escapeHtml(n.name)}">${escapeHtml(n.name)}${n.increased ? ` (+${n.increased}/-${n.decreased})` : ""}</option>`).join("")}
          </select>
        </div>`}

      <div><label class="muted tiny">HP</label>      <input type="number" id="ivHP"></div>
      <div><label class="muted tiny">Attack</label>  <input type="number" id="ivAttack"></div>
      <div><label class="muted tiny">Defense</label> <input type="number" id="ivDefense"></div>
      <div><label class="muted tiny">Speed</label>   <input type="number" id="ivSpeed"></div>
      <div><label class="muted tiny">Sp. Attack</label><input type="number" id="ivSpAttack"></div>
      ${!isGen2 ? `<div><label class="muted tiny">Sp. Defense</label><input type="number" id="ivSpDefense"></div>` : ""}

      <div class="full">
        <button class="btn btn-primary" id="ivRunBtn" style="width:100%;">Calculate ${calcLabel}s</button>
      </div>
    </div>
    <div id="ivResult"></div>
  `;
  setContent(html);

  if (ivCalcContext.pokemonName) $("#ivPokemon").value = ivCalcContext.pokemonName;

  $("#ivRunBtn").addEventListener("click", runIVCalc);
}

function runIVCalc() {
  const isGen2 = gameInfo().family === "gsc";
  const name = $("#ivPokemon").value;
  if (!name) return toast("Pick a Pokémon first", "error");
  const p = IDX.pokemonByName[name];
  if (!p) return;
  const level = parseInt($("#ivLevel").value, 10);
  if (!level || level < 1 || level > 100) return toast("Enter a valid level (1–100)", "error");

  const observed = {
    hp:        parseInt($("#ivHP").value, 10),
    attack:    parseInt($("#ivAttack").value, 10),
    defense:   parseInt($("#ivDefense").value, 10),
    speed:     parseInt($("#ivSpeed").value, 10),
    spAttack:  parseInt($("#ivSpAttack").value, 10),
    spDefense: isGen2 ? null : parseInt($("#ivSpDefense").value, 10),
  };

  let nature = null, gender = null;
  if (isGen2) {
    const g = $("#ivGender").value;
    gender = g === "male" ? "male" : g === "female" ? "female" : null;
  } else {
    const n = $("#ivNature").value;
    if (n) nature = DATA.natures.find(x => x.name === n) || null;
  }

  const result = isGen2
    ? calcGen2DVs(p, level, observed, gender)
    : calcGen3IVs(p, level, observed, nature);

  renderIVResult(result, isGen2);
}

function calcGen3IVs(p, level, obs, nature) {
  const stats = ["hp","attack","defense","speed","spAttack","spDefense"];
  const out = {};
  for (const stat of stats) {
    if (!Number.isFinite(obs[stat])) { out[stat] = null; continue; }
    const matches = [];
    for (let iv = 0; iv <= 31; iv++) {
      let calc;
      if (stat === "hp") {
        calc = Math.floor(((p.baseStats.hp * 2 + iv) * level) / 100) + level + 10;
      } else {
        let mod = 1.0;
        if (nature) {
          if (nature.increased === stat) mod = 1.1;
          if (nature.decreased === stat) mod = 0.9;
        }
        calc = Math.floor((Math.floor(((p.baseStats[stat] * 2 + iv) * level) / 100) + 5) * mod);
      }
      if (calc === obs[stat]) matches.push(iv);
    }
    out[stat] = matches;
  }
  return out;
}

function calcGen2DVs(p, level, obs, gender) {
  // Gen 2: DV 0–15, special is one DV used for both SpA and SpD,
  // HP DV is derived from parity of Atk/Def/Spe/Spc.
  // Attack DV is gender-locked: male ≥8 (1xxx), female ≤7 (0xxx) when species has gendered DV split.
  const stats = ["attack","defense","speed","spAttack"];
  const out = {};
  for (const stat of stats) {
    if (!Number.isFinite(obs[stat])) { out[stat] = null; continue; }
    const matches = [];
    for (let dv = 0; dv <= 15; dv++) {
      // Gender filter on Attack DV (most species; doesn't apply to Magnemite, Voltorb, etc.,
      // but those are genderless so user would leave gender blank)
      if (stat === "attack" && gender === "male"   && dv < 8)  continue;
      if (stat === "attack" && gender === "female" && dv > 7)  continue;
      const base = stat === "spAttack" ? p.baseStats.spAttack : p.baseStats[stat];
      const calc = Math.floor(((base + dv) * 2 * level) / 100) + 5;
      if (calc === obs[stat]) matches.push(dv);
    }
    out[stat] = matches;
  }
  // HP DV from parities of attack/def/spe/spc
  const hpMatches = new Set();
  if (out.attack && out.defense && out.speed && out.spAttack) {
    for (const a of out.attack) for (const d of out.defense) for (const s of out.speed) for (const sp of out.spAttack) {
      const hpDV = ((a & 1) << 3) | ((d & 1) << 2) | ((s & 1) << 1) | (sp & 1);
      hpMatches.add(hpDV);
    }
  }
  out.hp = [...hpMatches].sort((a,b) => a - b);
  // Verify against observed HP if user entered it
  if (Number.isFinite(obs.hp) && out.hp.length) {
    const verified = out.hp.filter(hpDV => {
      const calc = Math.floor(((p.baseStats.hp + hpDV) * 2 * level) / 100) + level + 10;
      return calc === obs.hp;
    });
    if (verified.length) out.hp = verified;
  }
  return out;
}

function renderIVResult(result, isGen2) {
  const max = isGen2 ? 15 : 31;
  const order = isGen2
    ? ["hp","attack","defense","speed","spAttack"]
    : ["hp","attack","defense","speed","spAttack","spDefense"];
  let html = `<h3>Possible ${isGen2 ? "DVs" : "IVs"}</h3><div class="row-list">`;
  for (const stat of order) {
    const vals = result[stat];
    if (!vals) {
      html += `<div class="row"><div class="row-main"><div class="name">${stat}</div><div class="meta muted">— (not entered)</div></div></div>`;
      continue;
    }
    if (vals.length === 0) {
      html += `<div class="row"><div class="row-main"><div class="name">${stat}</div><div class="meta" style="color:var(--danger);">No match — check your inputs</div></div></div>`;
      continue;
    }
    const min = Math.min(...vals), m = Math.max(...vals);
    const pct = ((vals.reduce((a,b) => a+b, 0) / vals.length) / max * 100).toFixed(0);
    const tag = vals.length === 1 ? `exactly ${vals[0]}` : `${min}–${m}`;
    html += `<div class="row">
      <div class="row-main">
        <div class="name">${stat}</div>
        <div class="meta">${tag} <span class="muted">· ~${pct}% of max</span></div>
      </div>
    </div>`;
  }
  html += `</div>`;
  $("#ivResult").innerHTML = html;
}

// ============================ WEAKNESS PAGE ============================
function renderWeaknessPage() {
  const teamObjs = STATE.team.map(n => IDX.pokemonByName[n]).filter(Boolean);
  let html = `<h2>Type Coverage Analysis</h2>`;
  if (teamObjs.length === 0) {
    html += `<div class="empty"><span class="emoji">🛡️</span><p>Add Pokémon to your team to see coverage.</p></div>`;
    setContent(html);
    return;
  }
  html += `<h3>Defensive (incoming)</h3>` + renderWeaknessSummary(teamObjs);
  html += `<h3>Offensive (outgoing)</h3>` + renderOffenseSummary(teamObjs);
  setContent(html);
}

function renderWeaknessSummary(teamObjs) {
  const score = {};
  Object.keys(TYPE_CHART).forEach(t => score[t] = 0);
  teamObjs.forEach(p => {
    Object.keys(TYPE_CHART).forEach(atkType => {
      let mult = 1;
      p.types.forEach(defType => {
        const chart = TYPE_CHART[defType];
        if (!chart) return;
        if (chart.immuneTo.includes(atkType)) mult *= 0;
        else if (chart.weakTo.includes(atkType)) mult *= 2;
        else if (chart.resists.includes(atkType)) mult *= 0.5;
      });
      if (mult >= 2) score[atkType] += 1;
      if (mult <= 0.5 && mult > 0) score[atkType] -= 0.5;
      if (mult === 0) score[atkType] -= 1;
    });
  });
  const sorted = Object.entries(score).sort((a, b) => b[1] - a[1]);
  let html = `<div class="row-list">`;
  for (const [type, s] of sorted) {
    if (s === 0) continue;
    const color = s > 0 ? "var(--danger)" : "var(--good)";
    const sign = s > 0 ? `+${s}` : `${s}`;
    html += `<div class="row">
      <div class="row-main">
        <span class="type-pill type-${type}">${type}</span>
      </div>
      <div style="color:${color}; font-weight:700;">${sign}</div>
    </div>`;
  }
  html += `</div><p class="muted tiny">+ values = team is weak to that type · − values = team resists / is immune.</p>`;
  return html;
}

function renderOffenseSummary(teamObjs) {
  // For each defending type, count how many of the team's "best legal moves"
  // hit it for super-effective damage.
  const cover = {};
  Object.keys(TYPE_CHART).forEach(t => cover[t] = 0);

  teamObjs.forEach(p => {
    const moves = bestLegalMoves(p.name, 4);
    const moveTypes = new Set();
    moves.forEach(m => {
      const md = getMoveData(m.move);
      if (md && md.power) moveTypes.add(md.type);
    });
    moveTypes.forEach(atkType => {
      Object.keys(TYPE_CHART).forEach(defType => {
        const chart = TYPE_CHART[defType];
        if (chart.weakTo.includes(atkType)) cover[defType] += 1;
      });
    });
  });
  const sorted = Object.entries(cover).sort((a, b) => b[1] - a[1]);
  let html = `<div class="row-list">`;
  for (const [type, c] of sorted) {
    const tone = c >= 2 ? "var(--good)" : c === 1 ? "var(--text)" : "var(--text-faint)";
    html += `<div class="row">
      <div class="row-main"><span class="type-pill type-${type}">${type}</span></div>
      <div style="color:${tone}; font-weight:700;">${c} hit${c === 1 ? "" : "s"}</div>
    </div>`;
  }
  html += `</div><p class="muted tiny">Number of team members with a damaging move that hits this type for super-effective damage.</p>`;
  return html;
}

// ============================ ITEMS PAGE ============================
const itemsFilter = { query: "", category: "", availableOnly: true };

function renderItemsPage() {
  if (!DATA.items.length) {
    setContent(`<h2>Items</h2>
      <div class="empty"><span class="emoji">🎒</span>
        <p>No item data yet.</p>
        <p class="tiny">Run <code>python3 tools/build_items.py</code> from the project folder
          to fetch comprehensive item data from PokeAPI. Once it finishes, refresh this page.</p>
      </div>`);
    return;
  }

  const cats = [...new Set(DATA.items.map(i => i.category))].sort();
  const html = `
    <h2>Items — ${escapeHtml(gameInfo().label)}</h2>
    <input type="search" id="itemSearch" placeholder="Search items…" value="${escapeHtml(itemsFilter.query)}">
    <div class="flex" style="gap:8px; margin-top:8px;">
      <select id="itemCat" style="flex:1;">
        <option value="">All categories</option>
        ${cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c.replace(/-/g, " "))}</option>`).join("")}
      </select>
    </div>
    <div class="flex" style="gap:14px; margin-top:8px; font-size:13px; color:var(--text-dim);">
      <label class="flex"><input type="checkbox" id="itemAvail" ${itemsFilter.availableOnly ? "checked" : ""}>
        Available in ${escapeHtml(gameInfo().label)} only
      </label>
    </div>
    <div id="itemResults" class="row-list" style="margin-top:12px;"></div>
  `;
  setContent(html);
  $("#itemSearch").value = itemsFilter.query;
  $("#itemCat").value = itemsFilter.category;

  $("#itemSearch").addEventListener("input",  e => { itemsFilter.query = e.target.value; updateItemsList(); });
  $("#itemCat").addEventListener("change",    e => { itemsFilter.category = e.target.value; updateItemsList(); });
  $("#itemAvail").addEventListener("change",  e => { itemsFilter.availableOnly = e.target.checked; updateItemsList(); });

  updateItemsList();
}

function updateItemsList() {
  const game = STATE.currentGame;
  const q = itemsFilter.query.trim().toLowerCase();
  let res = DATA.items.slice();
  if (itemsFilter.availableOnly) {
    res = res.filter(i => i.perGame && i.perGame[game] && i.perGame[game].available);
  }
  if (itemsFilter.category) res = res.filter(i => i.category === itemsFilter.category);
  if (q) res = res.filter(i => i.name.toLowerCase().includes(q));

  res.sort((a, b) => a.name.localeCompare(b.name));
  const max = 100;
  const truncated = res.length > max;
  res = res.slice(0, max);

  const html = res.map(i => {
    const pg = i.perGame?.[game];
    const flavor = pg?.flavor || i.shortEffect || i.effect || "";
    const heldBy = (pg?.heldBy || []).slice(0, 4)
      .map(h => `${escapeHtml(h.pokemon)}${h.rarity ? ` (${h.rarity}%)` : ""}`).join(", ");
    return `<div class="row">
      <div class="row-main">
        <div class="name">${escapeHtml(i.name)} <span class="badge badge-tag">${escapeHtml(i.category.replace(/-/g," "))}</span></div>
        <div class="meta">${escapeHtml(flavor || "—")}</div>
        ${heldBy ? `<div class="muted tiny" style="margin-top:4px;">Held by: ${heldBy}</div>` : ""}
      </div>
    </div>`;
  }).join("");

  $("#itemResults").innerHTML = html + (truncated
    ? `<div class="status">Showing first ${max} — refine your search.</div>`
    : res.length === 0 ? `<div class="empty"><span class="emoji">🔎</span><p>No items match.</p></div>` : "");
}

// ============================ TMs/HMs PAGE ============================
const tmsFilter = { query: "", showCompat: false };

function renderTMsPage() {
  if (!DATA.machines) {
    setContent(`<h2>TMs / HMs</h2>
      <div class="empty"><span class="emoji">💿</span>
        <p>No TM/HM data yet.</p>
        <p class="tiny">Run <code>python3 tools/build_machines.py</code> from the project folder
          to fetch TM/HM lists and per-Pokémon compatibility from PokeAPI.</p>
      </div>`);
    return;
  }

  const vg = gameInfo().learnsetKey; // matches PokeAPI version_group used by build_machines
  const list = (DATA.machines.perGame[vg] || []).slice();
  list.sort((a, b) => {
    const num = (s) => parseInt((s.tm || "").slice(2), 10) || 0;
    const prefix = (s) => (s.tm || "").startsWith("HM") ? 1 : 0;
    return prefix(a) - prefix(b) || num(a) - num(b);
  });

  let html = `
    <h2>TMs / HMs — ${escapeHtml(gameInfo().label)}</h2>
    <p class="muted tiny">${list.length} machines in this game.</p>
    <input type="search" id="tmSearch" placeholder="Search by TM number or move…" value="${escapeHtml(tmsFilter.query)}">
    <div id="tmResults" class="row-list" style="margin-top:12px;"></div>
  `;
  setContent(html);
  $("#tmSearch").value = tmsFilter.query;
  $("#tmSearch").addEventListener("input", (e) => { tmsFilter.query = e.target.value; updateTMsList(list); });
  updateTMsList(list);
}

function updateTMsList(list) {
  const q = tmsFilter.query.trim().toLowerCase();
  let res = q ? list.filter(t => t.tm.toLowerCase().includes(q) || t.move.toLowerCase().includes(q)) : list;

  const html = res.map(t => {
    const md = getMoveData(t.move);
    const status = moveStatus(t.move);
    const badge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                  status === "warn"   ? `<span class="badge badge-warn">caution</span>` : "";
    return `<div class="row">
      <div class="row-main">
        <div class="name">${escapeHtml(t.tm)} — ${escapeHtml(t.move)} ${badge}</div>
        <div class="meta">
          ${md ? `<span class="type-pill type-${md.type}">${md.type}</span>` : ""}
          ${md ? `<span class="muted">${md.category || ""} · ${md.power || "—"}pw / ${md.accuracy || "—"}acc / ${md.pp || "—"}pp</span>` : ""}
        </div>
        ${md && md.effect ? `<div class="muted tiny" style="margin-top:4px;">${escapeHtml(md.effect)}</div>` : ""}
      </div>
    </div>`;
  }).join("");

  $("#tmResults").innerHTML = res.length === 0
    ? `<div class="empty"><span class="emoji">🔎</span><p>No machines match.</p></div>`
    : html;
}

// ============================ MAPS PAGE ============================
// Lazily-built index: encountersKey -> { areaName -> [ {pokemon, method, rate, levels} ] }
const AREA_INDEX = {};

const METHOD_LABELS = {
  "walk":               "Walk",
  "surf":               "Surf",
  "old-rod":            "Old Rod",
  "good-rod":           "Good Rod",
  "super-rod":          "Super Rod",
  "rock-smash":         "Rock Smash",
  "headbutt-low":       "Headbutt (low)",
  "headbutt-normal":    "Headbutt",
  "headbutt-high":      "Headbutt (high)",
  "gift":               "Gift",
  "gift-egg":           "Gift egg",
  "only-one":           "Static",
  "pokeflute":          "Poké Flute",
  "feebas-tile-fishing":"Feebas tile",
  "wailmer-pail":       "Wailmer Pail",
  "squirt-bottle":      "Squirt Bottle",
  "devon-scope":        "Devon Scope",
  "seaweed":            "Underwater",
  "roaming-grass":      "Roaming",
  "roaming-water":      "Roaming (water)",
  "colosseum-bonus-disc-jpn": "Colo bonus (JP)",
  "colosseum-bonus-disc-us":  "Colo bonus (US)",
  "pokemon-channel-pal":      "Pokémon Channel",
};
function methodLabel(m) { return METHOD_LABELS[m] || m; }

function buildAreaIndex(encountersKey) {
  if (AREA_INDEX[encountersKey]) return AREA_INDEX[encountersKey];
  const areas = {};
  // Dedup on a row basis: gen-2 morning/day/night entries are stored as
  // duplicates with identical fields, so a Set on the stringified row
  // collapses them.
  for (const entry of DATA.encounters) {
    const locs = entry.games?.[encountersKey];
    if (!locs || !locs.length) continue;
    const seenForThisPokemon = {};
    for (const loc of locs) {
      const area = loc.area || "Unknown area";
      const key = `${loc.method}|${loc.rate}|${loc.levels}|${area}`;
      if (seenForThisPokemon[key]) continue;
      seenForThisPokemon[key] = true;
      (areas[area] = areas[area] || []).push({
        pokemon: entry.pokemon,
        method: loc.method,
        rate: loc.rate,
        levels: loc.levels,
      });
    }
  }
  AREA_INDEX[encountersKey] = areas;
  return areas;
}

let mapState = { query: "", openArea: null, methodFilter: "" };

function renderMapsPage() {
  const key = gameInfo().encountersKey;
  const areas = buildAreaIndex(key);
  const areaNames = Object.keys(areas).sort((a, b) => a.localeCompare(b));

  if (mapState.openArea) return renderAreaDetail(mapState.openArea, areas);

  // collect all methods seen, for the filter dropdown
  const methodsSeen = new Set();
  for (const list of Object.values(areas)) for (const r of list) methodsSeen.add(r.method);
  const methodOpts = [...methodsSeen].sort()
    .map(m => `<option value="${escapeHtml(m)}">${escapeHtml(methodLabel(m))}</option>`).join("");

  let html = `
    <h2>Maps — ${escapeHtml(gameInfo().label)}</h2>
    <p class="muted tiny">${areaNames.length} areas with wild encounter data. Tap an area to see what's there.</p>
    <input type="search" id="mapSearch" placeholder="Search areas (e.g. Route 32, Mt. Moon)…" value="${escapeHtml(mapState.query)}">
    <div class="flex" style="gap:8px; margin-top:8px;">
      <select id="methodFilter" style="flex:1;">
        <option value="">All methods</option>
        ${methodOpts}
      </select>
    </div>
    <div id="areaList" class="row-list" style="margin-top:12px;"></div>
  `;
  setContent(html);
  $("#mapSearch").value = mapState.query;
  $("#methodFilter").value = mapState.methodFilter;

  $("#mapSearch").addEventListener("input", (e) => { mapState.query = e.target.value; renderAreaList(); });
  $("#methodFilter").addEventListener("change", (e) => { mapState.methodFilter = e.target.value; renderAreaList(); });

  renderAreaList();

  function renderAreaList() {
    const q = mapState.query.trim().toLowerCase();
    const mfilter = mapState.methodFilter;
    let filtered = areaNames;
    if (q) filtered = filtered.filter(a => a.toLowerCase().includes(q));
    if (mfilter) filtered = filtered.filter(a => areas[a].some(r => r.method === mfilter));

    const html = filtered.map(a => {
      const records = mfilter ? areas[a].filter(r => r.method === mfilter) : areas[a];
      const uniquePokemon = new Set(records.map(r => r.pokemon)).size;
      const methodSet = new Set(records.map(r => r.method));
      const methodChips = [...methodSet].slice(0, 3).map(m => `<span class="badge badge-tag">${escapeHtml(methodLabel(m))}</span>`).join("");
      return `<div class="row" data-area="${escapeHtml(a)}">
        <div class="row-main">
          <div class="name">${escapeHtml(a)}</div>
          <div class="meta">${uniquePokemon} Pokémon ${methodChips}</div>
        </div>
        <button class="btn btn-ghost open-area-btn" data-area="${escapeHtml(a)}">Open</button>
      </div>`;
    }).join("");

    $("#areaList").innerHTML = filtered.length === 0
      ? `<div class="empty"><span class="emoji">🗺️</span><p>No areas match.</p></div>`
      : html;

    $$("#areaList .open-area-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        mapState.openArea = btn.dataset.area;
        renderMapsPage();
      });
    });
  }
}

function renderAreaDetail(areaName, areas) {
  const records = (areas[areaName] || []).slice();
  // Group by method, then by pokemon
  const byMethod = {};
  for (const r of records) {
    (byMethod[r.method] = byMethod[r.method] || []).push(r);
  }

  // Sort methods alphabetically, walk first
  const methodOrder = Object.keys(byMethod).sort((a, b) => {
    if (a === "walk") return -1;
    if (b === "walk") return 1;
    return a.localeCompare(b);
  });

  let html = `
    <button class="btn btn-ghost" id="backToMaps" style="margin-bottom:10px;">← Maps</button>
    <h2>${escapeHtml(areaName)}</h2>
    <p class="muted tiny">${escapeHtml(gameInfo().label)} · ${records.length} encounter rows · ${new Set(records.map(r => r.pokemon)).size} unique Pokémon</p>
  `;

  for (const method of methodOrder) {
    const rows = byMethod[method].slice();
    // Sort by rate desc (rates are like "4%", parse leading number), then by pokemon name
    rows.sort((a, b) => {
      const ra = parseFloat(a.rate) || 0, rb = parseFloat(b.rate) || 0;
      if (rb !== ra) return rb - ra;
      return a.pokemon.localeCompare(b.pokemon);
    });
    html += `<h3>${escapeHtml(methodLabel(method))}</h3><div class="row-list">`;
    for (const r of rows) {
      const p = IDX.pokemonByName[r.pokemon];
      const types = p ? p.types.map(t => `<span class="type-pill type-${t}">${t}</span>`).join("") : "";
      const isLegend = isLegendary(r.pokemon);
      html += `<div class="row">
        <div class="row-main">
          <div class="name">${escapeHtml(r.pokemon)} ${isLegend ? `<span class="badge badge-banned">Legend</span>` : ""}</div>
          <div class="meta">${types} <span class="muted">· Lv ${escapeHtml(r.levels || "?")} · ${escapeHtml(r.rate || "?")}</span></div>
        </div>
        <button class="btn btn-ghost view-pokemon-btn" data-name="${escapeHtml(r.pokemon)}">View</button>
      </div>`;
    }
    html += `</div>`;
  }

  setContent(html);
  $("#backToMaps").addEventListener("click", () => {
    mapState.openArea = null;
    renderMapsPage();
  });
  $$(".view-pokemon-btn").forEach(btn => {
    btn.addEventListener("click", () => showPokemonDetail(btn.dataset.name));
  });
}

// ============================ TYPE CHART PAGE ============================
function renderTypeChartPage() {
  const types = Object.keys(TYPE_CHART);
  // Build effectiveness: ATK -> DEF -> multiplier
  function eff(atk, def) {
    const c = TYPE_CHART[def];
    if (!c) return 1;
    if (c.immuneTo.includes(atk)) return 0;
    if (c.weakTo.includes(atk))   return 2;
    if (c.resists.includes(atk))  return 0.5;
    return 1;
  }

  // Header row: defending types as columns. First column is attacker.
  let grid = `<div style="overflow:auto; padding-bottom:12px;">
    <div style="display:grid; grid-template-columns:auto repeat(${types.length}, 28px); gap:2px; min-width:max-content; font-size:10px;">
      <div></div>
      ${types.map(t => `<div title="${t}" class="type-pill type-${t}" style="writing-mode:vertical-rl; transform:rotate(180deg); padding:6px 2px; text-align:center; font-size:9px;">${t.slice(0,4)}</div>`).join("")}`;
  for (const atk of types) {
    grid += `<div class="type-pill type-${atk}" style="padding:4px 6px; text-align:center;">${atk.slice(0,4)}</div>`;
    for (const def of types) {
      const m = eff(atk, def);
      const bg = m === 0   ? "#1a1a1a" :
                 m === 2   ? "rgba(74,222,128,0.35)" :
                 m === 0.5 ? "rgba(255,90,90,0.30)" :
                             "var(--bg-elev)";
      const sym = m === 0 ? "0" : m === 2 ? "2×" : m === 0.5 ? "½" : "";
      const color = m === 0 ? "var(--text-faint)" : m === 2 ? "var(--good)" : m === 0.5 ? "var(--danger)" : "var(--text-dim)";
      grid += `<div style="background:${bg}; color:${color}; text-align:center; padding:4px 0; border-radius:3px; font-weight:600;">${sym}</div>`;
    }
  }
  grid += `</div></div>`;

  const html = `
    <h2>Type Effectiveness</h2>
    <p class="muted tiny">Read row → column. Row = attacking type, column = defending type.
       Built for Gen 1–3 (no Fairy type). Selecting your game family colors single-type pokemon contextually elsewhere.</p>
    ${grid}

    <h3>Quick Reference</h3>
    <div class="row-list">
      ${types.map(t => {
        const c = TYPE_CHART[t];
        const wk = c.weakTo.length    ? `<div class="meta">Weak to: ${c.weakTo.map(x => `<span class="type-pill type-${x}">${x}</span>`).join("")}</div>` : "";
        const rs = c.resists.length   ? `<div class="meta">Resists: ${c.resists.map(x => `<span class="type-pill type-${x}">${x}</span>`).join("")}</div>` : "";
        const im = c.immuneTo.length  ? `<div class="meta">Immune to: ${c.immuneTo.map(x => `<span class="type-pill type-${x}">${x}</span>`).join("")}</div>` : "";
        return `<div class="row">
          <div class="row-main">
            <div class="name"><span class="type-pill type-${t}">${t}</span></div>
            ${wk}${rs}${im}
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
  setContent(html);
}

// ============================ EV TRAINING PAGE ============================
const evState = { stat: "speed" };
const STAT_LABELS = { hp: "HP", attack: "Attack", defense: "Defense", spAttack: "Sp. Attack", spDefense: "Sp. Defense", speed: "Speed" };

function renderEVTrainPage() {
  if (!DATA.evYields.length) {
    setContent(`<h2>EV Training</h2>
      <div class="empty"><span class="emoji">💪</span>
        <p>No EV-yield data yet.</p>
        <p class="tiny">Run <code>python3 tools/build_pokemon_evs.py</code> from the project folder
          to fetch each Pokémon's EV yield from PokeAPI. Then refresh.</p>
      </div>`);
    return;
  }
  const isGen2 = gameInfo().family === "gsc";
  const html = `
    <h2>EV Training Spots — ${escapeHtml(gameInfo().label)}</h2>
    ${isGen2 ? `<div class="warning">Gen 2 uses <strong>Stat Experience</strong>, not EVs. The same KO targets still help — every battle awards stat XP — but the cap is different (25,600 per stat vs 252 in Gen 3).</div>` : ""}
    <label class="muted tiny" style="margin-top:10px; display:block;">Stat to train</label>
    <select id="evStat">
      ${Object.entries(STAT_LABELS).map(([k, v]) => `<option value="${k}" ${evState.stat===k?"selected":""}>${v}</option>`).join("")}
    </select>
    <div id="evResults" class="row-list" style="margin-top:14px;"></div>
  `;
  setContent(html);
  $("#evStat").addEventListener("change", (e) => { evState.stat = e.target.value; updateEVResults(); });
  updateEVResults();
}

function updateEVResults() {
  const stat = evState.stat;
  const game = gameInfo().encountersKey;

  // Find all pokemon yielding the selected stat
  const yielders = DATA.evYields
    .filter(e => (e.yield?.[stat] || 0) > 0)
    .sort((a, b) => (b.yield[stat] || 0) - (a.yield[stat] || 0));

  // Map to encounter data, dedupe by area+method, score = (yield × encounter rate)
  const spots = [];
  for (const y of yielders) {
    const enc = IDX.encountersByName[y.pokemon];
    if (!enc) continue;
    const locs = enc.games?.[game] || [];
    const seen = new Set();
    for (const loc of locs) {
      if (loc.method !== "walk" && loc.method !== "surf" && !loc.method.includes("rod")) continue; // skip events/gifts
      const key = `${loc.area}|${loc.method}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ratePct = parseFloat(loc.rate) || 0;
      spots.push({
        pokemon: y.pokemon,
        area: loc.area,
        method: loc.method,
        rate: loc.rate,
        levels: loc.levels,
        yieldVal: y.yield[stat],
        score: (y.yield[stat] || 0) * ratePct, // higher = more EVs per slot
      });
    }
  }
  spots.sort((a, b) => b.score - a.score);

  const top = spots.slice(0, 30);
  const html = top.length === 0
    ? `<div class="empty"><span class="emoji">🔍</span><p>No farming spots found for ${STAT_LABELS[stat]} in ${escapeHtml(gameInfo().label)}.</p></div>`
    : top.map(s => `<div class="row">
        <div class="row-main">
          <div class="name">${escapeHtml(s.pokemon)} <span class="badge badge-tag">+${s.yieldVal} ${STAT_LABELS[stat]}</span></div>
          <div class="meta">${escapeHtml(s.area)} · ${escapeHtml(methodLabel(s.method))} · ${escapeHtml(s.rate)} · Lv ${escapeHtml(s.levels || "?")}</div>
        </div>
      </div>`).join("");
  $("#evResults").innerHTML = html;
}

// ============================ RARE CANDIES PAGE ============================
function renderCandiesPage() {
  if (!DATA.candies) {
    setContent(`<h2>Rare Candies</h2>
      <div class="empty"><span class="emoji">🍬</span><p>No Rare Candy data file present.</p></div>`);
    return;
  }
  const game = STATE.currentGame;
  const list = DATA.candies.perGame?.[game] || [];

  let html = `
    <h2>Rare Candies — ${escapeHtml(gameInfo().label)}</h2>
    <div class="warning">⚠️ <strong>Hand-curated from Bulbapedia.</strong> Verify each entry against your cartridge before relying on it for the tournament. Edit <code>data/rare-candies.json</code> to correct or expand.</div>
    <p class="muted tiny" style="margin-top:8px;">${list.length} known location${list.length===1?"":"s"} for this game.</p>
  `;
  if (list.length === 0) {
    html += `<div class="empty"><span class="emoji">📭</span><p>No entries yet for ${escapeHtml(gameInfo().label)}.</p></div>`;
  } else {
    html += `<div class="row-list">${list.map(c => `
      <div class="row">
        <div class="row-main">
          <div class="name">${escapeHtml(c.location)}</div>
          <div class="meta">${escapeHtml(c.notes || "")}</div>
          ${c.source ? `<div class="muted tiny" style="margin-top:4px;">↗ <a href="${escapeHtml(c.source)}" target="_blank" rel="noopener">${escapeHtml(c.source)}</a></div>` : ""}
        </div>
      </div>`).join("")}</div>`;
  }
  setContent(html);
}

// ============================ IN-GAME TRADES PAGE ============================
function renderTradesPage() {
  if (!DATA.trades) {
    setContent(`<h2>In-Game Trades</h2>
      <div class="empty"><span class="emoji">🤝</span><p>No trade data file present.</p></div>`);
    return;
  }
  const game = STATE.currentGame;
  const list = DATA.trades.perGame?.[game] || [];

  let html = `
    <h2>In-Game Trades — ${escapeHtml(gameInfo().label)}</h2>
    <p class="muted tiny">Traded Pokémon receive a <strong>1.5× experience boost</strong>, useful for racing the 18-hour clock.</p>
    <div class="warning">⚠️ <strong>Hand-curated from Bulbapedia.</strong> Verify each entry against your cartridge before tournament use. Edit <code>data/in-game-trades.json</code> to correct or expand.</div>
    <p class="muted tiny" style="margin-top:8px;">${list.length} known trade${list.length===1?"":"s"} for this game.</p>
  `;
  if (list.length === 0) {
    html += `<div class="empty"><span class="emoji">📭</span><p>No entries yet for ${escapeHtml(gameInfo().label)}.</p></div>`;
  } else {
    html += `<div class="row-list">${list.map(t => `
      <div class="row">
        <div class="row-main">
          <div class="name">${escapeHtml(t.gives || "?")} ${t.givesNickname ? `<span class="badge badge-tag">"${escapeHtml(t.givesNickname)}"</span>` : ""}</div>
          <div class="meta">From ${escapeHtml(t.npc || "NPC")} in ${escapeHtml(t.location || "?")} · wants ${escapeHtml(t.wants || "?")}</div>
          ${t.notes ? `<div class="muted tiny" style="margin-top:4px;">${escapeHtml(t.notes)}</div>` : ""}
          ${t.source ? `<div class="muted tiny" style="margin-top:4px;">↗ <a href="${escapeHtml(t.source)}" target="_blank" rel="noopener">${escapeHtml(t.source)}</a></div>` : ""}
        </div>
      </div>`).join("")}</div>`;
  }
  setContent(html);
}

// ============================ RULES PAGE ============================
function renderRulesPage() {
  const r = STATE.rules;
  const li = (s) => `<div class="row"><div class="row-main"><div class="name">${escapeHtml(s)}</div></div></div>`;
  const html = `
    <h2>Tournament Rules</h2>
    <p class="muted">Built into every team check; flagged automatically.</p>

    <h3>Format</h3>
    <div class="row-list">
      ${li("18 hours of fresh-cartridge gameplay, no outside help")}
      ${li("Trade-back evolutions are OK with a partner (Alakazam, etc.)")}
      ${li("Battle teams are level-capped at " + STATE.levelCap + " (toggle 55/60 above)")}
    </div>

    <h3>Legendaries (battle-team banned, OK for progression)</h3>
    <div class="row-list">${r.legendaries.map(li).join("")}</div>

    <h3>Banned moves — accuracy reducers</h3>
    <p class="muted tiny">${escapeHtml(r.bannedMoves.accuracyReducers.rule)}</p>
    <div class="row-list">${r.bannedMoves.accuracyReducers.moves.map(li).join("")}</div>

    <h3>Banned moves — non-damaging recovery</h3>
    <p class="muted tiny">${escapeHtml(r.bannedMoves.nonDamagingRecovery.rule)}</p>
    <div class="row-list">${r.bannedMoves.nonDamagingRecovery.moves.map(li).join("")}</div>

    <h3>Caution: damaging accuracy reducers</h3>
    <p class="muted tiny">${escapeHtml(r.warnMoves.damagingAccuracyReducers.rule)}</p>
    <div class="row-list">${r.warnMoves.damagingAccuracyReducers.moves.map(li).join("")}</div>

    <h3>Allowed: damage-based recovery</h3>
    <p class="muted tiny">${escapeHtml(r.warnMoves.drainAndPainSplit.rule)}</p>
    <div class="row-list">${r.warnMoves.drainAndPainSplit.moves.map(li).join("")}</div>
  `;
  setContent(html);
}

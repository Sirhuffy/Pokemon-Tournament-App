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
  customMoves: {},     // { pokemonName: [slot0|null, slot1|null, slot2|null, slot3|null] }
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
  availability: null, // optional — { perGame: { game: [pokemonName, ...] } } from build_pokedex_availability.py
  eggMoves: [],       // optional — [{ pokemon, eggMoves: { versionGroup: [moveName, ...] } }]
  trainers: [],       // optional — [{ id, name, role, ..., rosters: [{games, team}] }]
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
  eggByPokemon: {},   // { pokemonName -> { versionGroup -> [moveName, ...] } }
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
    const [rulesRes, pokemonRes, movesRes, learnsetsRes, encountersRes, naturesRes, itemsRes, machinesRes, evRes, candiesRes, tradesRes, availRes, eggRes, trainersRes] = await Promise.all([
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
      fetchJSON("data/pokedex-availability.json", false),
      fetchJSON("data/egg-moves.json", false),
      fetchJSON("data/trainers.json", false),
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
    DATA.availability = (availRes && availRes.perGame) ? availRes : null;
    DATA.eggMoves   = Array.isArray(eggRes) ? eggRes : [];
    DATA.trainers   = (trainersRes && Array.isArray(trainersRes.trainers)) ? trainersRes.trainers : [];

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
    DATA.eggMoves.forEach(e => IDX.eggByPokemon[e.pokemon] = e.eggMoves);

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
const LS_KEYS = {
  team: "ptc.team", game: "ptc.game", levelCap: "ptc.levelCap",
  page: "ptc.page", customMoves: "ptc.customMoves",
};

function saveState() {
  try {
    localStorage.setItem(LS_KEYS.team, JSON.stringify(STATE.team));
    localStorage.setItem(LS_KEYS.game, STATE.currentGame);
    localStorage.setItem(LS_KEYS.levelCap, String(STATE.levelCap));
    localStorage.setItem(LS_KEYS.page, STATE.currentPage);
    localStorage.setItem(LS_KEYS.customMoves, JSON.stringify(STATE.customMoves));
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
    const cm = JSON.parse(localStorage.getItem(LS_KEYS.customMoves) || "{}");
    if (cm && typeof cm === "object") STATE.customMoves = cm;
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
    case "dmgcalc":   return renderDmgCalcPage();
    case "trainers":  return renderTrainersPage();
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

/**
 * Wire a search <input> to filter a <select>'s options as the user types.
 * On iOS, hiding <option> elements is unreliable in the native picker, so we
 * rebuild the select's HTML on each input event instead. Original options
 * are cached so clearing the search restores the full list.
 *
 * @param {string} searchInputId - id of the <input type="search"> element
 * @param {string} selectId - id of the <select> element to filter
 * @param {string} [matchCountId] - optional id of an element to show "N of M" matches
 * @param {Function} [onSelect] - optional callback when select value changes via search
 */
function attachPokemonSearch(searchInputId, selectId, matchCountId, onSelect) {
  const searchEl = document.getElementById(searchInputId);
  const selectEl = document.getElementById(selectId);
  if (!searchEl || !selectEl) return;
  const countEl = matchCountId ? document.getElementById(matchCountId) : null;
  const originalHTML = selectEl.innerHTML;

  // Count "real" options (non-placeholder) for the match-count display
  const tmp = document.createElement("select");
  tmp.innerHTML = originalHTML;
  const totalReal = Array.from(tmp.querySelectorAll("option")).filter(o => o.value).length;

  const updateCount = (visible) => {
    if (!countEl) return;
    if (!searchEl.value.trim()) { countEl.textContent = ""; return; }
    countEl.textContent = visible === 1
      ? `1 match — tap dropdown to select`
      : `${visible} of ${totalReal} match`;
  };

  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    const previousValue = selectEl.value;

    if (!q) {
      selectEl.innerHTML = originalHTML;
      if ([...selectEl.options].some(o => o.value === previousValue)) {
        selectEl.value = previousValue;
      }
      updateCount(totalReal);
      return;
    }

    const tmpSel = document.createElement("select");
    tmpSel.innerHTML = originalHTML;
    let html = "";
    let visibleReal = 0;

    for (const child of tmpSel.children) {
      if (child.tagName === "OPTGROUP") {
        const matching = [...child.children].filter(o =>
          !o.value || o.textContent.toLowerCase().includes(q)
        );
        const hasReal = matching.some(o => o.value);
        if (hasReal) {
          html += `<optgroup label="${escapeHtml(child.label)}">`;
          for (const o of matching) {
            html += o.outerHTML;
            if (o.value) visibleReal++;
          }
          html += `</optgroup>`;
        }
      } else if (child.tagName === "OPTION") {
        if (!child.value || child.textContent.toLowerCase().includes(q)) {
          html += child.outerHTML;
          if (child.value) visibleReal++;
        }
      }
    }

    selectEl.innerHTML = html || `<option value="">— No matches —</option>`;
    if ([...selectEl.options].some(o => o.value === previousValue)) {
      selectEl.value = previousValue;
    }
    updateCount(visibleReal);
  });

  // If user picks a single match by hitting Enter, commit it to the select
  searchEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const real = [...selectEl.options].filter(o => o.value);
    if (real.length === 1) {
      selectEl.value = real[0].value;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      searchEl.blur();
      e.preventDefault();
    }
  });
}

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

// Pokemon-availability filter: prefer the user-curated list from
// pokedex-availability.json (built from tools/game_reference.xlsx).
// Falls back to a coarse dex-range heuristic when no list is loaded
// for the current game.
function isInRegionalDex(pokemon) {
  const list = DATA.availability?.perGame?.[STATE.currentGame];
  if (Array.isArray(list)) {
    return list.includes(pokemon.name);
  }
  // Fallback: dex range
  const family = gameInfo().family;
  if (family === "gsc") return pokemon.number <= 251;
  return pokemon.number <= 386;
}

// Whether the current game uses the curated availability list
function hasCuratedAvailability() {
  const list = DATA.availability?.perGame?.[STATE.currentGame];
  return Array.isArray(list);
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

// Returns the 4 moves displayed in the team card for a pokemon.
// For each slot, if customMoves has a non-null entry use it; otherwise
// auto-fill from bestLegalMoves, skipping any moves already in custom slots.
function getActiveMoves(pokemonName) {
  const slots = STATE.customMoves[pokemonName] || [null, null, null, null];
  const result = [];
  const usedNames = new Set();

  // Step 1: place all custom moves first (so auto-fill knows what's taken)
  for (let i = 0; i < 4; i++) {
    if (slots[i]) usedNames.add(slots[i]);
  }

  // Step 2: fetch auto picks excluding already-used moves
  const learnset = getLearnset(pokemonName).filter(m => m.level <= STATE.levelCap);
  const seen = new Set();
  const candidates = [];
  for (const m of learnset) {
    if (seen.has(m.move)) continue;
    seen.add(m.move);
    if (moveStatus(m.move) === "banned") continue;
    if (usedNames.has(m.move)) continue;
    candidates.push(m);
  }
  const p = IDX.pokemonByName[pokemonName];
  candidates.forEach(m => {
    const md = getMoveData(m.move);
    let score = 0;
    if (md) {
      score += md.power || 0;
      if (md.power && p && p.types.includes(md.type)) score += 30;
      if (!md.power) score += 5;
    }
    m.score = score;
  });
  candidates.sort((a, b) => b.score - a.score);

  // Step 3: walk slots, fill in
  let autoIdx = 0;
  for (let i = 0; i < 4; i++) {
    if (slots[i]) {
      const learn = getLearnset(pokemonName).find(m => m.move === slots[i]);
      result.push({
        move: slots[i],
        level: learn ? learn.level : null,
        custom: true,
      });
    } else if (autoIdx < candidates.length) {
      result.push({ ...candidates[autoIdx], custom: false });
      autoIdx++;
    } else {
      result.push(null);
    }
  }
  return result;
}

// Build the full list of moves a pokemon can have in the current game,
// grouped for the picker UI.
function getAllAvailableMoves(pokemonName) {
  const learnset = getLearnset(pokemonName);
  const cap = STATE.levelCap;
  const seen = new Set();

  const legal = [], overCap = [];
  for (const m of learnset) {
    if (seen.has(m.move)) continue;
    seen.add(m.move);
    if (m.level <= cap) legal.push(m);
    else overCap.push(m);
  }
  legal.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
  overCap.sort((a, b) => a.level - b.level);

  // TM/HM compatibility from machines.json (if loaded)
  let tms = [];
  if (DATA.machines) {
    const vg = gameInfo().learnsetKey;
    const compat = IDX.tmsByPokemon[pokemonName];
    if (compat && compat[vg]) {
      const tmIndex = {};
      (DATA.machines.perGame[vg] || []).forEach(t => { tmIndex[t.move] = t.tm; });
      tms = compat[vg]
        .filter(name => !seen.has(name)) // dedupe vs level-up
        .map(name => ({ move: name, tm: tmIndex[name] || null }))
        .sort((a, b) => a.move.localeCompare(b.move));
      tms.forEach(t => seen.add(t.move));
    }
  }

  // Egg moves (from build_egg_moves.py output)
  let eggs = [];
  const eggCompat = IDX.eggByPokemon[pokemonName];
  if (eggCompat) {
    const vg = gameInfo().learnsetKey;
    eggs = (eggCompat[vg] || [])
      .filter(name => !seen.has(name))
      .map(name => ({ move: name, eggOnly: true }));
    eggs.forEach(e => seen.add(e.move));
  }

  return { legal, overCap, tms, eggs };
}

function setCustomMove(pokemonName, slotIdx, moveName) {
  if (!STATE.customMoves[pokemonName]) STATE.customMoves[pokemonName] = [null, null, null, null];
  STATE.customMoves[pokemonName][slotIdx] = moveName;
  saveState();
}

function clearCustomMovesFor(pokemonName) {
  delete STATE.customMoves[pokemonName];
  saveState();
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
      STATE.customMoves = {};
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
  $$(".team-card .move-slot").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const name = btn.dataset.pokemon;
      const slot = parseInt(btn.dataset.slot, 10);
      openMovePicker(name, slot);
    });
  });
  $$(".team-card .reset-moves-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      clearCustomMovesFor(btn.dataset.name);
      toast(`Reset ${btn.dataset.name}'s moves to auto`);
      renderTeamPage();
    });
  });
}

function renderTeamCard(p) {
  const slots = getActiveMoves(p.name);
  const isLegend = isLegendary(p.name);
  const stats = p.baseStats;
  const total = Object.values(stats).reduce((a,b) => a+b, 0);
  const hasCustom = STATE.customMoves[p.name]?.some(s => s !== null);

  const eggMovesForPokemon = (IDX.eggByPokemon[p.name] || {})[gameInfo().learnsetKey] || [];

  const movesHtml = [0,1,2,3].map(i => {
    const slot = slots[i];
    if (!slot) {
      return `<button class="move move-slot empty" data-pokemon="${escapeHtml(p.name)}" data-slot="${i}">
        <div><span class="move-name muted">+ Slot ${i+1}</span>
          <div class="move-meta muted">Tap to pick a move</div></div>
        <span class="muted tiny">›</span>
      </button>`;
    }
    const md = getMoveData(slot.move);
    const status = moveStatus(slot.move);
    const isEgg = eggMovesForPokemon.includes(slot.move) && (!slot.level && slot.level !== 0);
    const badge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                  status === "warn"   ? `<span class="badge badge-warn">caution</span>` :
                  isEgg ? `<span class="badge badge-warn">egg only</span>` :
                  slot.custom ? `<span class="badge badge-tag">custom</span>` : "";
    const meta = md ? `${md.type} · ${md.category} · ${md.power || "—"}pw / ${md.accuracy || "—"}acc` : "";
    const lvl = slot.level !== null && slot.level !== undefined ? ` · Lv ${slot.level}` : "";
    return `<button class="move move-slot" data-pokemon="${escapeHtml(p.name)}" data-slot="${i}">
      <div>
        <span class="move-name">${escapeHtml(slot.move)}</span>${badge}
        <div class="move-meta">${escapeHtml(meta)}${lvl}</div>
      </div>
      <span class="muted tiny">edit ›</span>
    </button>`;
  }).join("");

  const typesHtml = p.types.map(t => `<span class="type-pill type-${t}">${t}</span>`).join("");

  const resetLink = hasCustom
    ? `<button class="btn btn-ghost reset-moves-btn" data-name="${escapeHtml(p.name)}" style="font-size:11px; min-height:30px; padding:4px 10px; margin-top:8px;">Reset moves to auto</button>`
    : "";

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
      ${resetLink}
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
  delete STATE.customMoves[name];
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
      <label class="flex"><input type="checkbox" id="regionOnly" ${pokedexFilter.regionOnly ? "checked" : ""}>
        ${hasCuratedAvailability() ? "Obtainable in this game only" : "Region only (rough)"}
      </label>
      <label class="flex"><input type="checkbox" id="includeLegendary" ${pokedexFilter.includeLegendary ? "checked" : ""}> Show legendaries</label>
    </div>
    ${!hasCuratedAvailability() ? `<p class="muted tiny" style="margin-top:6px;">⚠️ No curated obtainability list for ${escapeHtml(gameInfo().label)} yet — using a rough dex-range filter. Run <code>python3 tools/build_pokedex_availability.py</code> after adding a sheet for this game to fix.</p>` : ""}
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

    ${renderEggMovesSection(name)}

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

// ============================ MOVE PICKER MODAL ============================
const movePickerCtx = { pokemon: null, slot: 0, query: "" };

function openMovePicker(pokemonName, slotIdx) {
  movePickerCtx.pokemon = pokemonName;
  movePickerCtx.slot = slotIdx;
  movePickerCtx.query = "";

  const overlay = document.getElementById("movePickerOverlay");
  document.getElementById("movePickerTitle").textContent =
    `${pokemonName} — Slot ${slotIdx + 1}`;
  document.getElementById("movePickerSearch").value = "";

  // Bind once-per-open handlers
  overlay.onclick = (e) => { if (e.target === overlay) closeMovePicker(); };
  document.getElementById("movePickerClose").onclick = closeMovePicker;
  document.getElementById("movePickerSearch").oninput = (e) => {
    movePickerCtx.query = e.target.value;
    renderMovePickerBody();
  };
  document.getElementById("movePickerClear").onclick = () => {
    setCustomMove(pokemonName, slotIdx, null);
    closeMovePicker();
    toast("Slot reset to auto");
    renderTeamPage();
  };

  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  renderMovePickerBody();

  // ESC to close
  document.addEventListener("keydown", movePickerEsc);
}

function movePickerEsc(e) { if (e.key === "Escape") closeMovePicker(); }

function closeMovePicker() {
  document.getElementById("movePickerOverlay").hidden = true;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", movePickerEsc);
}

function renderMovePickerBody() {
  const { pokemon, slot, query } = movePickerCtx;
  const all = getAllAvailableMoves(pokemon);
  const customSlots = STATE.customMoves[pokemon] || [null,null,null,null];
  const otherSlotMoves = new Set(customSlots.map((m, i) => i === slot ? null : m).filter(Boolean));

  const q = query.trim().toLowerCase();
  const matches = (m) => !q || m.toLowerCase().includes(q);

  const renderRow = (moveName, level, tmTag, eggOnly) => {
    const md = getMoveData(moveName);
    const status = moveStatus(moveName);
    const inOther = otherSlotMoves.has(moveName);
    const badge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                  status === "warn"   ? `<span class="badge badge-warn">caution</span>` :
                  `<span class="badge badge-ok">ok</span>`;
    const tmLabel = tmTag ? `<span class="badge badge-tag">${escapeHtml(tmTag)}</span>` : "";
    const eggLabel = eggOnly ? `<span class="badge badge-warn">egg only</span>` : "";
    const lvl = level !== undefined && level !== null ? ` · Lv ${level}` : "";
    const meta = md ? `${md.type} · ${md.power || "—"}pw / ${md.accuracy || "—"}acc / ${md.pp || "—"}pp${lvl}` : "";
    const inOtherTag = inOther ? `<div class="muted tiny" style="margin-top:2px;">already in another slot</div>` : "";
    return `<button class="move-pick ${inOther ? "in-other-slot" : ""}" data-move="${escapeHtml(moveName)}">
      <div style="flex:1; min-width:0;">
        <div><span style="font-weight:600;">${escapeHtml(moveName)}</span> ${badge} ${tmLabel} ${eggLabel}</div>
        <div class="move-meta muted">${escapeHtml(meta)}</div>
        ${inOtherTag}
      </div>
      <span class="muted tiny">›</span>
    </button>`;
  };

  let html = "";
  const legalFiltered = all.legal.filter(m => matches(m.move));
  if (legalFiltered.length) {
    html += `<h4>Level-up — under cap (${all.legal.filter(m => moveStatus(m.move) !== "banned").length} legal)</h4>`;
    html += legalFiltered.map(m => renderRow(m.move, m.level, null, false)).join("");
  }
  const tmsFiltered = all.tms.filter(t => matches(t.move));
  if (tmsFiltered.length) {
    html += `<h4>TMs / HMs (${all.tms.length})</h4>`;
    html += tmsFiltered.map(t => renderRow(t.move, null, t.tm, false)).join("");
  }
  const eggsFiltered = (all.eggs || []).filter(e => matches(e.move));
  if (eggsFiltered.length) {
    html += `<h4>Egg moves — requires breeding (${all.eggs.length})</h4>`;
    html += `<p class="muted tiny" style="margin:-4px 0 6px;">⚠️ These are obtainable only by breeding the right parent. With an 18-hour clock, plan ahead — typical egg costs ~30 minutes.</p>`;
    html += eggsFiltered.map(e => renderRow(e.move, null, null, true)).join("");
  }
  const overFiltered = all.overCap.filter(m => matches(m.move));
  if (overFiltered.length) {
    html += `<h4>Above level cap — won't learn until you raise the cap (${all.overCap.length})</h4>`;
    html += overFiltered.map(m => renderRow(m.move, m.level, null, false)).join("");
  }
  if (!html) {
    html = `<div class="empty"><span class="emoji">🔎</span><p>No moves match.</p></div>`;
  }
  const body = document.getElementById("movePickerBody");
  body.innerHTML = html;
  body.querySelectorAll(".move-pick").forEach(btn => {
    btn.addEventListener("click", () => {
      const move = btn.dataset.move;
      setCustomMove(movePickerCtx.pokemon, movePickerCtx.slot, move);
      closeMovePicker();
      toast(`Set slot ${movePickerCtx.slot + 1} to ${move}`, "success");
      renderTeamPage();
    });
  });
}

// Returns HTML for the "Egg moves" panel, empty string if not loaded
// or no eggs in this game.
function renderEggMovesSection(pokemonName) {
  const compat = IDX.eggByPokemon[pokemonName];
  if (!compat) return "";
  const vg = gameInfo().learnsetKey;
  const eggs = (compat[vg] || []).slice().sort();
  if (eggs.length === 0) return "";
  const rows = eggs.map(m => {
    const md = getMoveData(m);
    const status = moveStatus(m);
    const statusBadge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                        status === "warn"   ? `<span class="badge badge-warn">caution</span>` : "";
    const meta = md ? `${md.type} · ${md.power || "—"}pw / ${md.accuracy || "—"}acc` : "";
    return `<div class="row">
      <div class="row-main">
        <div class="name">${escapeHtml(m)} <span class="badge badge-warn">egg only</span> ${statusBadge}</div>
        <div class="meta">${escapeHtml(meta)}</div>
      </div>
    </div>`;
  }).join("");
  return `<h3>Egg moves (${eggs.length})</h3>
          <p class="muted tiny" style="margin:-6px 0 8px;">Only obtainable via breeding — plan ahead given the 18-hour clock.</p>
          <div class="row-list">${rows}</div>`;
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
    <div class="search-select">
      <input type="search" id="ivPokemonSearch" placeholder="Type to search (e.g. Alak, 065)…" autocomplete="off" inputmode="search">
      <span class="match-count" id="ivPokemonCount"></span>
      <select id="ivPokemon">
        <option value="">— Select Pokémon —</option>
        ${teamOptions ? `<optgroup label="Your team">${teamOptions}</optgroup>` : ""}
        <optgroup label="All Pokémon">${allOptions}</optgroup>
      </select>
    </div>

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

  attachPokemonSearch("ivPokemonSearch", "ivPokemon", "ivPokemonCount");
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

// ============================ TRAINERS PAGE ============================
const ROLE_ORDER = { "Gym Leader": 0, "Elite Four": 1, "Champion": 2, "Rival": 3 };

function renderTrainersPage() {
  if (!DATA.trainers.length) {
    setContent(`<h2>Trainers</h2>
      <div class="empty"><span class="emoji">🥋</span>
        <p>No trainer data yet.</p>
        <p class="tiny">Schema is in <code>data/trainers.json</code>. Currently only Falkner is populated as a proof of concept — bulk scrape from Bulbapedia is next step.</p>
      </div>`);
    return;
  }
  // Filter to trainers whose roster includes the current game
  const game = STATE.currentGame;
  const relevant = DATA.trainers.filter(t =>
    t.rosters?.some(r => r.games.includes(game))
  );
  // Sort by role -> order within role
  relevant.sort((a, b) => {
    const r = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
    if (r !== 0) return r;
    return (a.order ?? 99) - (b.order ?? 99);
  });

  let html = `<h2>Trainers — ${escapeHtml(gameInfo().label)}</h2>
    <p class="muted tiny">${relevant.length} trainer${relevant.length === 1 ? "" : "s"} on file. Tap any to expand.</p>`;

  if (relevant.length === 0) {
    html += `<div class="empty"><span class="emoji">📭</span><p>No trainers populated for this game yet.</p></div>`;
  } else {
    let lastRole = null;
    for (const t of relevant) {
      if (t.role !== lastRole) {
        html += `<h3>${escapeHtml(t.role)}s</h3>`;
        lastRole = t.role;
      }
      const roster = t.rosters.find(r => r.games.includes(game));
      const summaryTeam = roster.team.map(p => `${escapeHtml(p.species)} L${p.level}`).join(" · ");
      html += `<details class="team-card" style="margin-bottom:10px;">
        <summary style="cursor:pointer; list-style:none;">
          <div class="header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <div class="name">${escapeHtml(t.name)}${t.specialty ? ` <span class="badge badge-tag">${escapeHtml(t.specialty)}</span>` : ""}</div>
              <div class="muted tiny" style="margin-top:2px;">${escapeHtml(t.location || "")}${t.badge ? ` · ${escapeHtml(t.badge)}` : ""}</div>
              <div class="muted tiny" style="margin-top:4px;">${summaryTeam}</div>
            </div>
            <span class="muted tiny">tap ›</span>
          </div>
        </summary>
        <div style="margin-top:12px;">
          ${t.title ? `<p class="muted tiny" style="font-style:italic;">"${escapeHtml(t.title)}"</p>` : ""}
          <div class="muted tiny" style="margin-bottom:10px;">
            ${roster.moneyReward ? `Reward: ¥${roster.moneyReward}` : ""}
            ${roster.tmReward ? ` · ${escapeHtml(roster.tmReward)}` : ""}
          </div>
          ${roster.team.map(renderTrainerPokemon).join("")}
          ${t.source ? `<p class="muted tiny" style="margin-top:8px;">↗ <a href="${escapeHtml(t.source)}" target="_blank" rel="noopener">verify on Bulbapedia</a></p>` : ""}
        </div>
      </details>`;
    }
  }
  setContent(html);
}

function renderTrainerPokemon(p) {
  const types = (IDX.pokemonByName[p.species]?.types || []).map(t => `<span class="type-pill type-${t}">${t}</span>`).join("");
  const moves = (p.moves || []).map(m => {
    const md = getMoveData(m);
    const status = moveStatus(m);
    const badge = status === "banned" ? `<span class="badge badge-banned">banned</span>` :
                  status === "warn"   ? `<span class="badge badge-warn">caution</span>` : "";
    const typeLabel = md ? `<span class="type-pill type-${md.type}" style="font-size:9px;">${md.type}</span>` : "";
    return `<div style="display:flex; justify-content:space-between; padding:4px 8px; background:var(--bg-elev-2); border-radius:6px; margin-bottom:4px; font-size:13px;">
      <span>${escapeHtml(m)} ${badge}</span>
      <span>${typeLabel}${md && md.power ? ` <span class="muted tiny">${md.power}pw</span>` : ""}</span>
    </div>`;
  }).join("");

  return `<div style="border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:8px; background:var(--bg-elev-2);">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <div>
        <strong>${escapeHtml(p.species)}</strong>
        <span class="muted">Lv ${p.level}</span>
      </div>
      <div>${types}</div>
    </div>
    ${p.heldItem ? `<div class="muted tiny" style="margin-top:4px;">Holds: ${escapeHtml(p.heldItem)}</div>` : ""}
    ${moves ? `<div style="margin-top:8px;">${moves}</div>` : ""}
  </div>`;
}

// ============================ DAMAGE CALCULATOR ============================
// Gen 1-3 use type-based physical/special split (not the move-by-move
// classification PokeAPI returns). Override accordingly.
const PHYSICAL_TYPES_GEN3 = new Set(["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel"]);
function getMoveCategoryGen3(md) {
  if (!md || !md.power) return "Status";
  if (md.category === "Status") return "Status";
  return PHYSICAL_TYPES_GEN3.has(md.type) ? "Physical" : "Special";
}

// Type-boosting hold items (10% in Gen 2, 20% in Gen 3).
// Items not in this map are ignored for the damage calc.
const TYPE_BOOST_ITEMS = {
  "Charcoal":      "Fire",
  "Mystic Water":  "Water",
  "Sea Incense":   "Water",
  "Magnet":        "Electric",
  "Miracle Seed":  "Grass",
  "Never-Melt Ice":"Ice",
  "Black Belt":    "Fighting",
  "Poison Barb":   "Poison",
  "Soft Sand":     "Ground",
  "Sharp Beak":    "Flying",
  "Twisted Spoon": "Psychic",
  "Silver Powder": "Bug",
  "Hard Stone":    "Rock",
  "Spell Tag":     "Ghost",
  "Black Glasses": "Dark",
  "Metal Coat":    "Steel",
  "Dragon Fang":   "Dragon",
  "Silk Scarf":    "Normal",   // Gen 3 only — Gen 2 had "Polkadot Bow"
};

const dmgCalcState = {
  attacker: null, defender: null, move: null,
  item: "", weather: "none", status: "none", crit: false,
};

function renderDmgCalcPage() {
  const allPokemon = DATA.pokemon.map(p => p.name).sort();
  const teamFirst = STATE.team.length
    ? `<optgroup label="Your team">${STATE.team.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")}</optgroup>`
    : "";
  const allOpts = `<optgroup label="All Pokémon">${DATA.pokemon.map(p => `<option value="${escapeHtml(p.name)}">#${p.number} ${escapeHtml(p.name)}</option>`).join("")}</optgroup>`;

  // Pick first team member as default if nothing chosen yet
  if (!dmgCalcState.attacker && STATE.team.length) dmgCalcState.attacker = STATE.team[0];
  if (!dmgCalcState.defender && STATE.team.length > 1) dmgCalcState.defender = STATE.team[1];

  const isGen2 = gameInfo().family === "gsc";
  const itemBoostPct = isGen2 ? 10 : 20;

  setContent(`
    <h2>Damage Calculator</h2>
    <p class="muted tiny">Tournament conditions: both Pokémon at level ${STATE.levelCap}, average IVs (Gen ${isGen2 ? "2: 8 DVs" : "3: 16 IVs"}), 0 EVs, neutral nature. Type-boost items add +${itemBoostPct}%.</p>

    <h3>Attacker</h3>
    <div class="search-select">
      <input type="search" id="dcAtkSearch" placeholder="Type to search…" autocomplete="off" inputmode="search">
      <span class="match-count" id="dcAtkCount"></span>
      <select id="dcAtk">
        <option value="">— Pick —</option>
        ${teamFirst}${allOpts}
      </select>
    </div>
    <div class="iv-grid" style="margin-top:8px;">
      <div>
        <label class="muted tiny">Held item</label>
        <select id="dcItem">
          <option value="">None</option>
          ${Object.keys(TYPE_BOOST_ITEMS).sort().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)} (+${itemBoostPct}% ${TYPE_BOOST_ITEMS[n]})</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="muted tiny">Status</label>
        <select id="dcStatus">
          <option value="none">None</option>
          <option value="burn">Burned (½ physical Atk)</option>
        </select>
      </div>
    </div>

    <h3>Defender</h3>
    <div class="search-select">
      <input type="search" id="dcDefSearch" placeholder="Type to search…" autocomplete="off" inputmode="search">
      <span class="match-count" id="dcDefCount"></span>
      <select id="dcDef">
        <option value="">— Pick —</option>
        ${teamFirst}${allOpts}
      </select>
    </div>

    <h3>Move &amp; Conditions</h3>
    <select id="dcMove">
      <option value="">— Pick a move (choose attacker first) —</option>
    </select>
    <div class="iv-grid" style="margin-top:8px;">
      <div>
        <label class="muted tiny">Weather</label>
        <select id="dcWeather">
          <option value="none">None</option>
          <option value="sun">Sunny Day (Fire ×1.5, Water ×0.5)</option>
          <option value="rain">Rain Dance (Water ×1.5, Fire ×0.5)</option>
        </select>
      </div>
      <div>
        <label class="muted tiny">Critical hit</label>
        <select id="dcCrit">
          <option value="false">No crit</option>
          <option value="true">Critical hit (×2)</option>
        </select>
      </div>
    </div>

    <div id="dcResult" style="margin-top:18px;"></div>
  `);

  // Restore state to controls
  $("#dcAtk").value = dmgCalcState.attacker || "";
  $("#dcDef").value = dmgCalcState.defender || "";
  $("#dcItem").value = dmgCalcState.item || "";
  $("#dcStatus").value = dmgCalcState.status || "none";
  $("#dcWeather").value = dmgCalcState.weather || "none";
  $("#dcCrit").value = String(dmgCalcState.crit);

  // Wire change handlers
  $("#dcAtk").addEventListener("change", e => { dmgCalcState.attacker = e.target.value || null; refreshMoveDropdown(); runDmgCalc(); });
  $("#dcDef").addEventListener("change", e => { dmgCalcState.defender = e.target.value || null; runDmgCalc(); });
  $("#dcMove").addEventListener("change", e => { dmgCalcState.move = e.target.value || null; runDmgCalc(); });
  $("#dcItem").addEventListener("change", e => { dmgCalcState.item = e.target.value; runDmgCalc(); });
  $("#dcStatus").addEventListener("change", e => { dmgCalcState.status = e.target.value; runDmgCalc(); });
  $("#dcWeather").addEventListener("change", e => { dmgCalcState.weather = e.target.value; runDmgCalc(); });
  $("#dcCrit").addEventListener("change", e => { dmgCalcState.crit = e.target.value === "true"; runDmgCalc(); });

  attachPokemonSearch("dcAtkSearch", "dcAtk", "dcAtkCount");
  attachPokemonSearch("dcDefSearch", "dcDef", "dcDefCount");

  refreshMoveDropdown();
  runDmgCalc();
}

function refreshMoveDropdown() {
  const sel = $("#dcMove");
  if (!sel) return;
  if (!dmgCalcState.attacker) {
    sel.innerHTML = `<option value="">— Pick a move (choose attacker first) —</option>`;
    return;
  }
  const all = getAllAvailableMoves(dmgCalcState.attacker);
  const damaging = (list, isEgg) => list
    .filter(m => {
      const md = getMoveData(m.move || m);
      return md && md.power; // damaging moves only
    })
    .map(m => ({ move: m.move || m, isEgg: !!isEgg, level: m.level || null, tm: m.tm || null }));

  const groups = [
    { label: "Level-up (legal)",  items: damaging(all.legal) },
    { label: "TMs/HMs",           items: damaging(all.tms) },
    { label: "Egg moves",         items: damaging(all.eggs || [], true) },
    { label: "Above level cap",   items: damaging(all.overCap) },
  ].filter(g => g.items.length);

  let html = `<option value="">— Pick a move —</option>`;
  for (const g of groups) {
    html += `<optgroup label="${g.label}">`;
    for (const m of g.items) {
      const md = getMoveData(m.move);
      const tag = m.isEgg ? " (egg)" : m.tm ? ` (${m.tm})` : m.level !== null ? ` Lv${m.level}` : "";
      html += `<option value="${escapeHtml(m.move)}">${escapeHtml(m.move)} — ${md.type}/${md.power}pw${tag}</option>`;
    }
    html += `</optgroup>`;
  }
  sel.innerHTML = html;
  // Try to keep previous selection
  if (dmgCalcState.move) sel.value = dmgCalcState.move;
}

// Average DV (Gen 2) or IV (Gen 3) used for tournament-condition calcs.
function avgIV() { return gameInfo().family === "gsc" ? 8 : 16; }

// Compute the actual stat at the level cap with average IVs and 0 EVs.
function computeStat(base, statKey) {
  const level = STATE.levelCap;
  const iv = avgIV();
  const isGen2 = gameInfo().family === "gsc";
  if (statKey === "hp") {
    if (isGen2) {
      // Gen 2 HP: floor((Base + DV) * 2 * Level / 100) + Level + 10
      return Math.floor((base + iv) * 2 * level / 100) + level + 10;
    }
    // Gen 3 HP: floor((2*Base + IV) * Level / 100) + Level + 10
    return Math.floor((2 * base + iv) * level / 100) + level + 10;
  }
  if (isGen2) {
    // Gen 2 non-HP: floor((Base + DV) * 2 * Level / 100) + 5
    return Math.floor((base + iv) * 2 * level / 100) + 5;
  }
  // Gen 3 non-HP: floor((2*Base + IV) * Level / 100) + 5  [neutral nature, 0 EV]
  return Math.floor((2 * base + iv) * level / 100) + 5;
}

function calculateDamage(attacker, defender, moveName, opts) {
  const md = getMoveData(moveName);
  if (!md || !md.power) return null;

  const cat = getMoveCategoryGen3(md);
  if (cat === "Status") return null;

  const level = STATE.levelCap;
  const isGen2 = gameInfo().family === "gsc";
  const itemBoost = isGen2 ? 1.10 : 1.20;

  // Attacker / defender stats at tournament conditions
  let atk = cat === "Physical" ? computeStat(attacker.baseStats.attack, "attack")
                                : computeStat(attacker.baseStats.spAttack, "spAttack");
  const def = cat === "Physical" ? computeStat(defender.baseStats.defense, "defense")
                                  : computeStat(defender.baseStats.spDefense, "spDefense");
  const defenderHP = computeStat(defender.baseStats.hp, "hp");

  // Burn halves physical Atk
  let burnApplied = false;
  if (opts.status === "burn" && cat === "Physical") {
    atk = Math.floor(atk / 2);
    burnApplied = true;
  }

  // Base damage (Gen 3 formula)
  let dmg = Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * md.power * atk / def) / 50) + 2;

  // Critical hit (×2)
  if (opts.crit) dmg *= 2;

  // STAB
  const stab = attacker.types.includes(md.type) ? 1.5 : 1;
  dmg = Math.floor(dmg * stab);

  // Type effectiveness
  let typeEff = 1;
  for (const defType of defender.types) {
    const c = TYPE_CHART[defType];
    if (!c) continue;
    if (c.immuneTo.includes(md.type)) typeEff *= 0;
    else if (c.weakTo.includes(md.type)) typeEff *= 2;
    else if (c.resists.includes(md.type)) typeEff *= 0.5;
  }
  dmg = Math.floor(dmg * typeEff);

  // Weather
  let weatherMod = 1;
  if (opts.weather === "sun") {
    if (md.type === "Fire") weatherMod = 1.5;
    if (md.type === "Water") weatherMod = 0.5;
  } else if (opts.weather === "rain") {
    if (md.type === "Water") weatherMod = 1.5;
    if (md.type === "Fire") weatherMod = 0.5;
  }
  dmg = Math.floor(dmg * weatherMod);

  // Item boost
  let itemMod = 1;
  if (opts.item && TYPE_BOOST_ITEMS[opts.item] === md.type) itemMod = itemBoost;
  dmg = Math.floor(dmg * itemMod);

  // Random factor 0.85 - 1.00
  const min = Math.floor(dmg * 0.85);
  const max = dmg;

  return {
    min, max, defenderHP,
    typeEff, stab, weatherMod, itemMod, burnApplied,
    minPct: (min / defenderHP * 100),
    maxPct: (max / defenderHP * 100),
    category: cat,
  };
}

function runDmgCalc() {
  const out = $("#dcResult");
  if (!out) return;
  const { attacker, defender, move, item, weather, status, crit } = dmgCalcState;
  if (!attacker || !defender || !move) {
    out.innerHTML = `<div class="empty"><span class="emoji">🧮</span><p>Pick attacker, defender, and move to see damage.</p></div>`;
    return;
  }
  const atkP = IDX.pokemonByName[attacker], defP = IDX.pokemonByName[defender];
  if (!atkP || !defP) return;
  const r = calculateDamage(atkP, defP, move, { item, weather, status, crit });
  if (!r) {
    out.innerHTML = `<div class="warning">${escapeHtml(move)} is a status move (no damage).</div>`;
    return;
  }

  const md = getMoveData(move);
  const effLabel = r.typeEff === 0 ? "0× — IMMUNE" :
                   r.typeEff === 0.25 ? "¼× (double resist)" :
                   r.typeEff === 0.5 ? "½× (resist)" :
                   r.typeEff === 1 ? "1× (neutral)" :
                   r.typeEff === 2 ? "2× (super effective)" :
                   r.typeEff === 4 ? "4× (quad)" :
                   `${r.typeEff}×`;

  // KO threshold (assumes max-damage random roll)
  const koHits = r.max > 0 ? Math.ceil(r.defenderHP / r.max) : "—";
  const koGuaranteed = r.min > 0 ? Math.ceil(r.defenderHP / r.min) : "—";

  out.innerHTML = `
    <div class="team-card">
      <div class="header">
        <div>
          <div class="name">${escapeHtml(attacker)} → ${escapeHtml(defender)}</div>
          <div class="muted tiny" style="margin-top:2px;">${escapeHtml(move)} <span class="type-pill type-${md.type}">${md.type}</span> · ${r.category} · ${md.power}pw</div>
        </div>
      </div>
      <hr class="hr">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px 14px; font-size:14px;">
        <div class="muted tiny">Damage range</div>
        <div style="font-weight:700;">${r.min} – ${r.max}</div>
        <div class="muted tiny">% of HP (${r.defenderHP})</div>
        <div style="font-weight:700; color:${r.maxPct >= 100 ? "var(--good)" : r.maxPct >= 50 ? "var(--warn)" : "var(--text)"};">${r.minPct.toFixed(1)}% – ${r.maxPct.toFixed(1)}%</div>
        <div class="muted tiny">Type effectiveness</div>
        <div>${effLabel}</div>
        <div class="muted tiny">KO in (best case)</div>
        <div>${koHits === 1 ? "1HKO ✓" : koHits + " hits"}</div>
        <div class="muted tiny">KO in (worst case)</div>
        <div>${koGuaranteed} hits</div>
      </div>
      <hr class="hr">
      <div class="muted tiny">
        Modifiers active: STAB ×${r.stab.toFixed(1)}${r.itemMod !== 1 ? `, Item ×${r.itemMod}` : ""}${r.weatherMod !== 1 ? `, Weather ×${r.weatherMod}` : ""}${crit ? ", Crit ×2" : ""}${r.burnApplied ? ", Burn (½ Atk)" : ""}
      </div>
    </div>
  `;
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

// Per-family region map image (tap-to-zoom reference)
const REGION_MAP_BY_FAMILY = {
  gsc:  { src: "icons/maps/johto_kanto.png", label: "Johto / Kanto", note: null },
  frlg: { src: "icons/maps/johto_kanto.png", label: "Kanto",         note: "Same map as GSC — Kanto routes are identical." },
  rse:  { src: "icons/maps/hoenn.png",       label: "Hoenn",         note: "ORAS-era map (Gen 6). Routes 101–134 are identical to RSE; some post-game features (Battle Resort, Soaring) don't exist in Gen 3." },
};

function regionMapHtml() {
  const m = REGION_MAP_BY_FAMILY[gameInfo().family];
  if (!m) return "";
  const noteHtml = m.note ? `<p class="muted tiny" style="margin:-4px 0 10px;">${escapeHtml(m.note)}</p>` : "";
  return `<div class="map-thumb-wrap" id="mapThumb" data-src="${escapeHtml(m.src)}">
    <img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.label)} region map" loading="lazy">
    <span class="map-zoom-hint">🔍 ${escapeHtml(m.label)} — tap to zoom</span>
  </div>${noteHtml}`;
}

function openFullscreenMap(src) {
  const overlay = document.getElementById("mapFullscreen");
  const img = document.getElementById("mapFullscreenImg");
  img.src = src;
  // Reset scroll on each open
  overlay.scrollLeft = 0;
  overlay.scrollTop = 0;
  // Default: fit width to viewport so the whole map is visible; user can pinch-zoom from there
  img.onload = () => {
    const vw = window.innerWidth;
    const naturalRatio = img.naturalHeight / img.naturalWidth;
    img.style.width = vw + "px";
    img.style.height = (vw * naturalRatio) + "px";
  };
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", mapFullscreenEsc);
}
function mapFullscreenEsc(e) { if (e.key === "Escape") closeFullscreenMap(); }
function closeFullscreenMap() {
  document.getElementById("mapFullscreen").hidden = true;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", mapFullscreenEsc);
}
// Bind close button once at startup
window.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("mapFullscreenClose");
  if (closeBtn) closeBtn.addEventListener("click", closeFullscreenMap);
});

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
    ${regionMapHtml()}
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

  // Tap-to-zoom on the region thumbnail
  const thumb = document.getElementById("mapThumb");
  if (thumb) thumb.addEventListener("click", () => openFullscreenMap(thumb.dataset.src));

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

  const family = gameInfo().family;
  const pickupTip = family === "frlg"
    ? " Use <strong>Meowth</strong> with Pickup Ability for more!"
    : family === "rse"
    ? " Use <strong>Zigzagoon</strong> with Pickup Ability for more!"
    : " Edit <code>tools/rare_candies.xlsx</code> and re-run <code>build_rare_candies.py</code> to add more.";

  let html = `
    <h2>Rare Candies — ${escapeHtml(gameInfo().label)}</h2>
    <p class="muted tiny">${list.length} known location${list.length===1?"":"s"} for this game.${pickupTip}</p>
  `;
  if (list.length === 0) {
    html += `<div class="empty"><span class="emoji">📭</span><p>No entries yet for ${escapeHtml(gameInfo().label)}.</p></div>`;
  } else {
    html += `<div class="row-list">${list.map(c => {
      const methodBadge = c.method ? `<span class="badge badge-tag">${escapeHtml(c.method)}</span>` : "";
      const areaLine = c.area ? `<div class="meta">${escapeHtml(c.area)}</div>` : "";
      const noteLine = c.notes ? `<div class="muted tiny" style="margin-top:4px;">📝 ${escapeHtml(c.notes)}</div>` : "";
      const sourceLine = c.source ? `<div class="muted tiny" style="margin-top:4px;">↗ <a href="${escapeHtml(c.source)}" target="_blank" rel="noopener">verify</a></div>` : "";
      const hasImages = Array.isArray(c.images) && c.images.length > 0;
      const photoHint = hasImages ? ` <span class="muted tiny">📸 tap to view</span>` : "";
      const mainBlock = `
        <div class="name">${escapeHtml(c.location)} ${methodBadge}${photoHint}</div>
        ${areaLine}
        ${noteLine}
        ${sourceLine}
      `;
      if (hasImages) {
        const imgsHtml = c.images.map(i => `
          <figure class="candy-img-wrap">
            <img src="${escapeHtml(i.src)}" alt="${escapeHtml(c.location)} candy location${i.label ? ` (${escapeHtml(i.label)})` : ""}" loading="lazy" data-fullscreen="${escapeHtml(i.src)}">
            ${i.label ? `<figcaption class="muted tiny">${escapeHtml(i.label)}</figcaption>` : ""}
          </figure>
        `).join("");
        return `<details class="row candy-row">
          <summary><div class="row-main">${mainBlock}</div></summary>
          <div class="candy-images">${imgsHtml}</div>
        </details>`;
      }
      return `<div class="row">
        <div class="row-main">${mainBlock}</div>
      </div>`;
    }).join("")}</div>`;
  }
  setContent(html);

  // Wire candy-image taps to the existing fullscreen overlay
  document.querySelectorAll(".candy-img-wrap img[data-fullscreen]").forEach(img => {
    img.addEventListener("click", () => openFullscreenMap(img.dataset.fullscreen));
  });
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

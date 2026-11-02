'use strict';

// This page keeps personal research in the visitor's browser. The optional
// gateway is requested only after a button click and never receives a stake.
const STORE_KEY = 'formline_research_workspace_v1';
const CODE_KEY = 'formline_access_code_session';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const emptyStore = () => ({ version: 1, races: [], bets: [], results: {} });
let store = loadStore();
let currentView = 'races';
let selectedMeeting = '';
let selectedRaceId = '';
let expandedRunnerId = '';
let selectedResultRaceId = '';
let mode = 'sportsbet';
let selectedStrategy = 'market';
let educationTab = 'bets';
let glossaryCategory = 'All';
let railTab = 'pending';
let resultOffset = 0;
let lastLookback = 24;
let feedCode = (() => { try { return sessionStorage.getItem(CODE_KEY) || ''; } catch { return ''; } })();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function safeUrl(value) {
  try { const url = new URL(String(value)); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
}
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function money(value) { return value == null ? '—' : '$' + Number(value).toFixed(2); }
function odds(value) { return number(value) > 1 ? Number(value).toFixed(2) : '—'; }
function dateTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Time unknown';
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));
}
function sydneyDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function datetimeLocal(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = type => p.find(x => x.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
function newId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function finitePositive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function validPrice(value) { const n = Number(value); return Number.isFinite(n) && n > 1 && n <= 10000 ? n : null; }
function raceById(id = selectedRaceId) { return store.races.find(r => r.id === id); }
function runnerById(race, id) { return race?.runners?.find(r => r.id === id); }
function raceStarted(race) { return !race?.startTime || new Date(race.startTime).getTime() <= Date.now(); }
function meetingKey(race) { return `${String(race.venue || '').toLowerCase()}|${sydneyDate(race.startTime)}`; }
function isScratch(runner) { return Boolean(runner?.scratched); }
function quoteFresh(runner) {
  if (runner?.source !== 'provider' || runner.quoteStale) return runner?.source !== 'provider';
  const stamp = Date.parse(runner.quoteAt || '');
  const maxAge = runner.quoteTier === 'card' ? 30 * 60 * 1000 : 2 * 60 * 1000;
  const age = Date.now() - stamp;
  return Number.isFinite(stamp) && age >= -30000 && age <= maxAge;
}
function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (parsed?.version === 1 && Array.isArray(parsed.races) && Array.isArray(parsed.bets) && parsed.results && typeof parsed.results === 'object') return parsed;
  } catch { /* An empty workspace is safer than a broken page. */ }
  return emptyStore();
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
  catch { notice('Browser storage is unavailable or full. Export a backup before leaving this page.', true); return false; }
}
function notice(text, error = false) {
  const node = $('#notice'); node.textContent = text; node.hidden = false; node.classList.toggle('error', error);
  clearTimeout(notice.timer); notice.timer = setTimeout(() => { node.hidden = true; }, 7000);
}
function empty(title, text) { return `<div class="empty-state"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }
function setBusy(button, busy, label) { if (!button) return; button.disabled = busy; if (label) button.textContent = busy ? 'Loading…' : label; }

function sydneyLocalToISO(day, displayTime) {
  const match = String(displayTime || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(String(day)) || !match) return '';
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === 'pm') hour += 12;
  const minute = Number(match[2]);
  const [year, month, date] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  const part = new Intl.DateTimeFormat('en', { timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset' }).formatToParts(new Date(wall)).find(x => x.type === 'timeZoneName')?.value || 'GMT+10';
  const offset = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const minutes = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3] || 0)) : 600;
  return new Date(wall - minutes * 60000).toISOString();
}

function normalizedProviderRunner(raw, fetchedAt) {
  const book = (Array.isArray(raw.bookmakers) ? raw.bookmakers : []).find(item => item?.key === 'sportsbet') || {};
  const quoteAt = book.last_update || fetchedAt || '';
  return {
    id: String(raw.runner_ref || `${raw.number}:${raw.name || raw.runner_name}`), providerRef: String(raw.runner_ref || ''),
    number: number(raw.number), name: String(raw.name || raw.runner_name || '').slice(0, 100),
    barrier: number(raw.barrier), weight: number(raw.weight ?? raw.weight_kg), jockey: String(raw.jockey || '').slice(0, 100),
    trainer: String(raw.trainer || '').slice(0, 100), runStyle: '', form: String(raw.form || raw.last10 || '').slice(0, 80),
    historyScore: '', historyNotes: '', conditionNotes: '', scratched: Boolean(raw.scratched),
    winOdds: validPrice(book.win_price), placeOdds: validPrice(book.place_price), top3Odds: validPrice(book.top3_price), top4Odds: validPrice(book.top4_price),
    quoteAt, quoteTier: String(book.refresh_tier || ''), quoteStale: Boolean(book.stale), source: 'provider'
  };
}
function normalizedPricedRace(raw, fetchedAt) {
  if (!raw?.race_id || !raw?.venue || !raw?.start_time) return null;
  const time = new Date(raw.start_time);
  if (Number.isNaN(time.getTime())) return null;
  const scratched = new Set((raw.scratchings || []).map(item => Number(item?.number)));
  return {
    id: `pe:${raw.race_id}`, providerId: String(raw.race_id), source: 'provider', sourceUrl: '',
    venue: String(raw.venue).slice(0, 90), raceNumber: number(raw.race_number), raceName: String(raw.race_name || `Race ${raw.race_number || ''}`).slice(0, 140),
    startTime: time.toISOString(), distance: number(raw.distance_m), paidPlaces: number(raw.places_paid), ground: String(raw.track_condition || '').slice(0, 45),
    raceClass: String(raw.race_class || '').slice(0, 100), notes: '', fetchedAt,
    runners: (Array.isArray(raw.runners) ? raw.runners : []).filter(x => x && (x.name || x.runner_name)).slice(0, 40).map(x => ({ ...normalizedProviderRunner(x, fetchedAt), scratched: Boolean(x.scratched || scratched.has(Number(x.number))) }))
  };
}
function normalizedAcceptanceRaces(card, fetchedAt) {
  if (!card || !Array.isArray(card.meetings)) return [];
  const races = [];
  for (const meeting of card.meetings) {
    if (!meeting || !Array.isArray(meeting.races)) continue;
    for (const item of meeting.races) {
      if (!item?.race_id) continue;
      const startTime = sydneyLocalToISO(card.date, item.start_time_local);
      if (!startTime) continue;
      const runners = (item.runners || []).filter(x => x && x.runner_name && !x.emergency).slice(0, 40).map(x => normalizedProviderRunner(x, fetchedAt));
      races.push({
        id: `pe:${item.race_id}`, providerId: String(item.race_id), source: 'provider', sourceUrl: '',
        venue: String(meeting.venue || '').slice(0, 90), raceNumber: number(item.race_number), raceName: String(item.race_name || `Race ${item.race_number || ''}`).slice(0, 140),
        startTime, distance: number(item.distance_m), paidPlaces: null, ground: String(meeting.track?.track_condition || '').slice(0, 45),
        raceClass: String(item.race_class || item.conditions || '').slice(0, 100), notes: '', fetchedAt,
        runners
      });
    }
  }
  return races;
}
function mergeFeedRace(next) {
  const index = store.races.findIndex(r => r.id === next.id);
  if (index < 0) { store.races.push(next); return; }
  const prior = store.races[index];
  const priorRunners = new Map((prior.runners || []).map(r => [r.id, r]));
  next.runners = next.runners.map(r => {
    const old = priorRunners.get(r.id);
    return old ? { ...r, runStyle: old.runStyle || '', historyScore: old.historyScore || '', historyNotes: old.historyNotes || '', conditionNotes: old.conditionNotes || '' } : r;
  });
  // A priced response can replace an acceptance-only card, but never erase its prices.
  if (!next.runners.some(r => r.winOdds) && prior.runners?.some(r => r.winOdds) && prior.fetchedAt === next.fetchedAt) return;
  next.paidPlaces ||= prior.paidPlaces;
  next.ground ||= prior.ground;
  next.notes = prior.notes || '';
  store.races[index] = next;
}
function normalizedProviderResult(raw, fetchedAt) {
  if (!raw?.race_id) return null;
  const fullField = Array.isArray(raw.runners) ? raw.runners : [];
  const placings = Array.isArray(raw.placings) ? raw.placings : [];
  const rows = fullField.length ? fullField : placings;
  const positions = {};
  const found = store.races.find(r => r.providerId === String(raw.race_id));
  if (found) for (const runner of found.runners || []) {
    const row = rows.find(p =>
      (runner.providerRef && p?.runner_ref && String(p.runner_ref) === runner.providerRef) ||
      (Number(p?.number) === runner.number && String(p?.name || p?.runner_name || '').toLowerCase() === runner.name.toLowerCase())
    );
    if (!row) continue;
    const position = number(row.position);
    if (position != null && position > 0) positions[runner.id] = position;
    else if (/scratch|withdraw/i.test(String(row.status || ''))) positions[runner.id] = 'scratch';
  }
  if (!found) for (const row of rows) {
    if (!row || (!row.runner_ref && !row.name)) continue;
    const ref = String(row.runner_ref || `${row.number}:${row.name}`);
    const position = number(row.position);
    if (position != null && position > 0) positions[ref] = position;
    else if (/scratch|withdraw/i.test(String(row.status || ''))) positions[ref] = 'scratch';
  }
  const positive = Object.values(positions).filter(v => Number(v) > 0);
  const duplicate = new Set(positive).size !== positive.length;
  return {
    raceId: `pe:${raw.race_id}`, status: raw.status === 'final' ? 'final' : 'provisional',
    ground: String(raw.track_condition || '').slice(0, 45), positions,
    special: Boolean(duplicate || (Array.isArray(raw.deductions) && raw.deductions.length) || raw.dead_heat),
    note: '', source: 'provider', fetchedAt, savedAt: new Date().toISOString()
  };
}

async function gateway(action, params = {}) {
  const inputCode = $('#feedCode')?.value?.trim();
  if (inputCode) { feedCode = inputCode; try { sessionStorage.setItem(CODE_KEY, feedCode); } catch { /* Session only. */ } }
  if (!feedCode) throw Error('Enter the FormLine access code on the Race board first.');
  const url = new URL('/api/puntersedge', location.href);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let response;
  try { response = await fetch(url, { headers: { 'X-FormLine-Access-Code': feedCode, Accept: 'application/json' }, cache: 'no-store' }); }
  catch { throw Error('The protected data connection could not be reached.'); }
  let data;
  try { data = await response.json(); } catch { throw Error('The protected data connection returned an unreadable response.'); }
  if (!response.ok) throw Error(data.error || 'The protected data request failed.');
  return data;
}

function setView(view) {
  if (!['races', 'journal', 'results', 'performance', 'strategies', 'education', 'method'].includes(view)) return;
  currentView = view;
  $$('.view').forEach(node => { node.hidden = node.id !== `view-${view}`; });
  $$('.side-nav [data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#currentViewTitle').textContent = ({ races: 'Race board', journal: 'Paper journal', results: 'Results', performance: 'Performance', strategies: 'Strategies', education: 'Education', method: 'Method & data' })[view];
  closeNav();
  if (view === 'races') renderBoard();
  if (view === 'journal') renderJournal();
  if (view === 'results') renderResults();
  if (view === 'performance') renderPerformance();
  if (view === 'strategies') renderStrategies();
  if (view === 'education') renderEducation();
  if (view === 'method') renderMethod();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function openNav() { $('#toolSidebar').classList.add('open'); $('#navScrim').hidden = false; $('#menuToggle').setAttribute('aria-expanded', 'true'); }
function closeNav() { $('#toolSidebar').classList.remove('open'); $('#navScrim').hidden = true; $('#menuToggle').setAttribute('aria-expanded', 'false'); }
function openRail() { $('#paperRail').classList.add('open'); $('#railScrim').hidden = false; $('#railToggle').setAttribute('aria-expanded', 'true'); renderRail(); }
function closeRail() { $('#paperRail').classList.remove('open'); $('#railScrim').hidden = true; $('#railToggle').setAttribute('aria-expanded', 'false'); }
function renderAll() { if (currentView === 'races') renderBoard(); else setView(currentView); renderRail(); }

function renderBoard() {
  store.races.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || Number(a.raceNumber || 0) - Number(b.raceNumber || 0));
  const groups = new Map();
  for (const race of store.races) {
    const key = meetingKey(race);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(race);
  }
  const keys = [...groups.keys()];
  if (!groups.has(selectedMeeting)) {
    const soonest = store.races.find(r => !raceStarted(r)) || store.races.at(-1);
    selectedMeeting = soonest ? meetingKey(soonest) : '';
  }
  const meetingRaces = groups.get(selectedMeeting) || [];
  if (!meetingRaces.some(r => r.id === selectedRaceId)) {
    selectedRaceId = (meetingRaces.find(r => !raceStarted(r)) || meetingRaces[0])?.id || '';
    expandedRunnerId = '';
  }
  $('#meetingCount').textContent = String(keys.length);
  $('#meetingList').innerHTML = keys.length ? keys.map(key => {
    const races = groups.get(key), first = races[0];
    return `<button type="button" class="meeting-button ${selectedMeeting === key ? 'active' : ''}" data-meeting="${esc(key)}"><strong>${esc(first.venue || 'Unknown venue')}</strong><small>${esc(sydneyDate(first.startTime))} · ${races.length} races</small></button>`;
  }).join('') : empty('No meetings yet', 'Add a race above, or use the protected feed once it is configured.');
  $('#raceTabs').innerHTML = meetingRaces.map(r => `<button type="button" role="tab" aria-selected="${r.id === selectedRaceId}" class="race-tab ${r.id === selectedRaceId ? 'active' : ''}" data-race="${esc(r.id)}"><b>R${esc(r.raceNumber ?? '—')}</b><small>${esc(dateTime(r.startTime))}</small></button>`).join('');
  renderRaceDetail();
}
function runnerSourceLabel(runner) {
  const source = runner.source === 'provider' ? 'Provider quote' : 'Your entered quote';
  if (!runner.quoteAt) return source;
  return `${source} · ${dateTime(runner.quoteAt)}${runner.source === 'provider' && !quoteFresh(runner) ? ' · STALE' : ''}`;
}
function renderRunnerCard(runner, race) {
  const open = runner.id === expandedRunnerId;
  const facts = [runner.barrier != null ? `Gate ${runner.barrier}` : '', runner.weight != null ? `${runner.weight}kg` : '', runner.runStyle || '', runner.form ? `Form ${runner.form}` : ''].filter(Boolean);
  return `<div class="runner-card ${open ? 'open' : ''} ${runner.scratched ? 'scratch' : ''}"><button class="runner-summary" type="button" data-expand-runner="${esc(runner.id)}" aria-expanded="${open}"><span class="saddle">${esc(runner.number ?? '—')}</span><span><strong>${esc(runner.name)}${runner.scratched ? ' · SCRATCHED' : ''}</strong><small>${esc(facts.join(' · ') || 'Runner details pending')}</small></span><span class="runner-prices"><span>WIN<b>${esc(odds(runner.winOdds))}</b></span><span>PLACE<b>${esc(odds(runner.placeOdds))}</b></span></span></button>${open ? `<div class="runner-body"><div class="runner-meta"><span>Jockey: ${esc(runner.jockey || '—')}</span><span>Trainer: ${esc(runner.trainer || '—')}</span><span>Record: ${esc(runner.historyScore || '—')}</span><span>Runner type: ${esc(runner.runStyle || 'Unknown')}</span></div><p><strong>Past runs:</strong> ${esc(runner.historyNotes || 'No history entered or loaded.')}</p><p><strong>Ground notes:</strong> ${esc(runner.conditionNotes || 'No ground record entered or loaded.')}</p><p class="quote-note">${esc(runnerSourceLabel(runner))}. Top 3: ${esc(odds(runner.top3Odds))}; Top 4: ${esc(odds(runner.top4Odds))}. Confirm any quote with the bookmaker.</p><div class="runner-tools"><button class="button button-quiet" type="button" data-edit-runner="${esc(runner.id)}">Edit runner</button>${!runner.scratched && !raceStarted(race) ? `<button class="button button-primary" type="button" data-select-runner="${esc(runner.id)}">Use in paper bet</button>` : ''}${race.providerId ? `<button class="button button-quiet" type="button" data-load-form="${esc(race.id)}">Load recent form</button>` : ''}</div></div>` : ''}</div>`;
}
function runnerEditorHtml() {
  return `<details class="editor-card" id="runnerEditor"><summary><span>＋</span> Add or edit a runner</summary><form id="runnerForm" class="editor-form"><input type="hidden" name="runnerId"><div class="field-grid"><label>Number <input name="number" type="number" min="1" max="99" required></label><label>Horse <input name="name" maxlength="100" required></label><label>Barrier <input name="barrier" type="number" min="1" max="40"></label><label>Weight (kg) <input name="weight" type="number" min="30" max="80" step="0.5"></label><label>Jockey <input name="jockey" maxlength="100"></label><label>Trainer <input name="trainer" maxlength="100"></label><label>Runner type <select name="runStyle"><option value="">Unknown</option><option>Leader</option><option>On pace</option><option>Midfield</option><option>Backmarker</option><option>Versatile</option></select></label><label>Form string <input name="form" maxlength="80" placeholder="e.g. 1-324"></label><label>1st–2nd–3rd record <input name="historyScore" maxlength="35" placeholder="e.g. 4-3-0"></label><label>Quote observed (your device time) <input name="quoteAt" type="datetime-local"></label><label>Win odds <input name="winOdds" type="number" min="1.01" step="0.01" inputmode="decimal"></label><label>Place odds <input name="placeOdds" type="number" min="1.01" step="0.01" inputmode="decimal"></label><label>Top 3 leg odds <input name="top3Odds" type="number" min="1.01" step="0.01" inputmode="decimal"></label><label>Top 4 leg odds <input name="top4Odds" type="number" min="1.01" step="0.01" inputmode="decimal"></label><label class="field-wide">Past run history <textarea name="historyNotes" rows="3" maxlength="2000" placeholder="Date, distance, ground and finishing place for each run."></textarea></label><label class="field-wide">Ground / condition notes <textarea name="conditionNotes" rows="2" maxlength="1500" placeholder="How has this horse gone on similar ground?"></textarea></label><label class="result-flag field-wide"><input name="scratched" type="checkbox"> Scratched / withdrawn</label></div><p class="field-help">Runner style, form and prices are research notes. They do not create a probability forecast.</p><div class="form-actions"><button class="button button-primary" type="submit">Save runner</button><button class="button button-quiet" type="button" id="cancelRunnerEdit">Cancel</button></div></form></details>`;
}
function marketOptions(race) { return (race.runners || []).filter(r => !r.scratched).map(r => `<option value="${esc(r.id)}">${esc(r.number ?? '—')}. ${esc(r.name)}</option>`).join(''); }
function bettingHtml(race) {
  const active = !raceStarted(race), activeRunners = race.runners.filter(r => !r.scratched);
  if (!active) return `<div class="race-section"><h3>Paper bets are closed</h3><p>The entered jump time has passed. Use Results to record the finish, then review any decisions made before the jump.</p></div>`;
  if (!activeRunners.length) return `<div class="race-section"><h3>Add runners to begin</h3><p>A paper selection needs an active runner and an actual quote.</p></div>`;
  const first = activeRunners[0];
  return `<section class="race-section" id="paperEntry"><h3>Build a paper selection</h3><p>Selections are recorded before the jump. Confirm the real quote yourself; no money is sent anywhere.</p><div class="mode-switch" role="group" aria-label="Betting context"><button type="button" data-mode="sportsbet" class="${mode === 'sportsbet' ? 'active' : ''}" aria-pressed="${mode === 'sportsbet'}">Online Sportsbet</button><button type="button" data-mode="track" class="${mode === 'track' ? 'active' : ''}" aria-pressed="${mode === 'track'}">At the races</button></div><form class="bet-form" id="singleForm"><label>Horse<select name="runnerId" required>${marketOptions(race)}</select></label><label>Market<select name="market"><option value="win">Win</option><option value="place" ${!race.paidPlaces ? 'disabled' : ''}>Place${race.paidPlaces ? ` · ${race.paidPlaces} paid` : ' · paid places unknown'}</option></select></label><label>Actual decimal odds<input name="odds" type="number" min="1.01" step="0.01" inputmode="decimal" required placeholder="e.g. 4.20"></label><label>Paper stake ($)<input name="stake" type="number" min="0.01" max="100000" step="0.01" value="5" inputmode="decimal" required></label><div class="bet-preview" id="singlePreview">${mode === 'track' ? 'Enter the on-course price you saw.' : `Saved win quote for ${esc(first.name)}: ${esc(odds(first.winOdds))}. Recheck before recording.`}</div><label class="result-flag field-wide"><input name="confirmed" type="checkbox" required> I checked the actual quote and race terms before recording this paper bet.</label><button class="button button-primary field-wide" type="submit">Save pre-race paper bet</button></form>${mode === 'sportsbet' && activeRunners.length >= 2 ? `<div class="multi-panel"><h4>Two horses in Top 3 or Top 4</h4><p>Select different runners. Enter the bookmaker’s actual combined quote; individual leg prices cannot be multiplied to get it.</p><form class="bet-form" id="multiForm"><label>First horse<select name="firstId" required>${marketOptions(race)}</select></label><label>First finish<select name="firstMarket"><option value="top3">Top 3</option><option value="top4">Top 4</option></select></label><label>Second horse<select name="secondId" required>${marketOptions(race)}</select></label><label>Second finish<select name="secondMarket"><option value="top3">Top 3</option><option value="top4">Top 4</option></select></label><label>Actual combined odds<input name="odds" type="number" min="1.01" step="0.01" inputmode="decimal" required></label><label>Paper stake ($)<input name="stake" type="number" min="0.01" max="100000" step="0.01" value="5" inputmode="decimal" required></label><div class="bet-preview" id="multiPreview">Both outcomes must happen. There is no combined quote in this feed.</div><label class="result-flag field-wide"><input name="confirmed" type="checkbox" required> I checked the actual combined quote and Top 3/4 terms.</label><button class="button button-primary field-wide" type="submit">Save pre-race paper multi</button></form></div>` : ''}</section>`;
}
function renderRaceDetail() {
  const race = raceById();
  if (!race) { $('#raceDetail').innerHTML = empty('Choose a race', 'Add a race above, or load the protected card when the gateway is configured.'); return; }
  const source = safeUrl(race.sourceUrl);
  const facts = [`R${race.raceNumber ?? '—'}`, race.distance ? `${race.distance}m` : '', race.ground || 'Ground not entered', race.paidPlaces ? `${race.paidPlaces} places paid` : 'Paid places unknown', race.raceClass || '', raceStarted(race) ? 'Started' : 'Upcoming'].filter(Boolean);
  $('#raceDetail').innerHTML = `<div class="race-title-row"><div><p class="eyebrow">${esc(race.venue)} · ${esc(dateTime(race.startTime))}</p><h2>${esc(race.raceName)}</h2><p>${race.source === 'provider' ? `PuntersEdge card checked ${esc(dateTime(race.fetchedAt))}` : race.source === 'result-only' ? 'Result-only card' : 'Your manually entered card'}</p></div><div class="race-actions"><button class="button button-quiet" type="button" data-edit-race="${esc(race.id)}">Edit race</button>${race.providerId ? `<button class="button button-quiet" type="button" data-load-meeting="${esc(race.id)}">Check meeting</button>` : ''}</div></div><div class="fact-list">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>${race.notes ? `<div class="race-note">${esc(race.notes)}</div>` : ''}${source ? `<a class="race-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer">Open card source ↗</a>` : ''}<section class="race-section"><h3>Field <span class="subtle">${race.runners.length} runners</span></h3><p>Tap a horse for jockey, weight, form, ground history and price details. A blank runner style means it has not been established.</p><div class="runner-list">${race.runners.length ? race.runners.slice().sort((a, b) => Number(a.number || 0) - Number(b.number || 0)).map(r => renderRunnerCard(r, race)).join('') : empty('No runners entered', 'Use Add or edit a runner below to build this field.')}</div></section>${runnerEditorHtml()}${bettingHtml(race)}<section class="race-section"><h3>Earlier races here</h3><p>Final results saved for the same meeting can help you compare how the track played. One result alone does not prove a bias.</p>${renderEarlierResults(race)}</section>`;
  if (!raceStarted(race)) fillSingleQuote();
  if ($('#multiForm')) { $('#multiForm').elements.secondId.value = race.runners.filter(r => !r.scratched)[1]?.id || ''; updateMultiPreview(); }
}
function renderEarlierResults(race) {
  const rows = store.races.filter(r => r.id !== race.id && meetingKey(r) === meetingKey(race) && new Date(r.startTime) < new Date(race.startTime) && store.results[r.id]?.status === 'final').slice(-6).reverse();
  if (!rows.length) return `<p class="field-help">No earlier final results saved for this meeting.</p>`;
  return rows.map(r => { const res = store.results[r.id]; const winner = r.runners.find(x => Number(res.positions?.[x.id]) === 1); return `<div class="result-summary"><strong>R${esc(r.raceNumber)} · ${esc(winner?.name || 'Winner not recorded')}</strong> · ${esc(res.ground || r.ground || 'Ground unknown')} · ${esc(dateTime(r.startTime))}</div>`; }).join('');
}
function fillSingleQuote() {
  const form = $('#singleForm'); if (!form) return;
  const race = raceById(), runner = runnerById(race, form.elements.runnerId.value), market = form.elements.market.value;
  const stored = runner?.[market === 'win' ? 'winOdds' : 'placeOdds'];
  const usable = mode === 'sportsbet' && quoteFresh(runner) && validPrice(stored);
  form.elements.odds.value = usable ? stored : '';
  const text = mode === 'track' ? 'Enter the on-course price you saw.' : !runner ? 'Select a horse.' : !quoteFresh(runner) ? 'Saved provider quote is stale. Enter a currently confirmed price.' : stored ? `Saved ${market} quote ${odds(stored)} at ${dateTime(runner.quoteAt)}. Recheck before recording.` : 'No saved quote for this market. Enter the current actual price.';
  $('#singlePreview').textContent = text;
}
function updateMultiPreview() {
  const form = $('#multiForm'); if (!form) return;
  const race = raceById(), a = runnerById(race, form.elements.firstId.value), b = runnerById(race, form.elements.secondId.value);
  const aMarket = form.elements.firstMarket.value, bMarket = form.elements.secondMarket.value;
  $('#multiPreview').textContent = !a || !b ? 'Choose two horses.' : a.id === b.id ? 'Choose two different horses.' : `${a.name} ${aMarket.toUpperCase()} leg ${odds(a[aMarket + 'Odds'])} + ${b.name} ${bMarket.toUpperCase()} leg ${odds(b[bMarket + 'Odds'])}. Enter the actual combined quote separately.`;
}

function settleBet(bet, result) {
  if (!result || result.status !== 'final') return { status: 'pending', profit: null, note: 'Awaiting a final result.' };
  if (result.special) return { status: 'review', profit: null, note: 'Special result, dead heat, deduction or scratching needs manual review.' };
  const positions = bet.legs.map(leg => result.positions?.[leg.runnerId]);
  if (positions.some(x => x === 'scratch')) return { status: 'review', profit: null, note: 'A selected runner was scratched; operator rules need review.' };
  if (positions.some(x => x == null || x === '')) return { status: 'review', profit: null, note: 'A selected runner has no recorded final position.' };
  const won = bet.legs.every((leg, index) => {
    const position = positions[index] === 'out' ? Infinity : Number(positions[index]);
    const threshold = leg.market === 'win' ? 1 : leg.market === 'place' ? Number(bet.paidPlaces) : leg.market === 'top3' ? 3 : 4;
    return Number.isFinite(threshold) && position <= threshold;
  });
  return { status: won ? 'won' : 'lost', profit: won ? bet.stake * (bet.odds - 1) : -bet.stake, note: won ? 'Settled from recorded final positions at the frozen quote.' : 'Recorded finish missed the selected market.' };
}
function settleAll() {
  for (const bet of store.bets) {
    const outcome = settleBet(bet, store.results[bet.raceId]);
    bet.status = outcome.status; bet.profit = outcome.profit; bet.settlementNote = outcome.note;
  }
}
function betLabel(bet) {
  return (bet.legs || []).map(leg => `${leg.runnerName} ${leg.market === 'win' ? 'to win' : leg.market === 'place' ? 'to place' : `Top ${leg.market.slice(-1)}`}`).join(' + ');
}
function metrics() {
  const settled = store.bets.filter(b => b.status === 'won' || b.status === 'lost');
  const stake = settled.reduce((sum, b) => sum + Number(b.stake || 0), 0);
  const profit = settled.reduce((sum, b) => sum + Number(b.profit || 0), 0);
  return { settled, stake, profit, roi: stake ? profit / stake : null, pending: store.bets.filter(b => b.status === 'pending').length, review: store.bets.filter(b => b.status === 'review').length };
}
function metric(label, value, sub = '', negative = false) { return `<div class="metric ${negative ? 'negative' : ''}"><small>${esc(label)}</small><strong>${esc(value)}</strong><p>${esc(sub)}</p></div>`; }
function renderJournal() {
  const m = metrics();
  $('#journalSummary').innerHTML = metric('PAPER DECISIONS', store.bets.length, 'Frozen before listed jump') + metric('AWAITING RESULT', m.pending, 'No final result yet') + metric('SETTLED', m.settled.length, 'Simple outcomes only') + metric('NEEDS REVIEW', m.review, 'Special terms or missing places');
  $('#journalList').innerHTML = store.bets.length ? store.bets.slice().reverse().map(bet => `<article class="journal-entry"><div class="journal-entry-head"><div><strong>${esc(betLabel(bet))}</strong><small>${esc(bet.venue)} · R${esc(bet.raceNumber)} · ${esc(dateTime(bet.createdAt))}</small></div><span class="status-pill ${esc(bet.status)}">${esc(bet.status)}</span></div><p>${esc(bet.mode === 'track' ? 'At the races' : 'Online Sportsbet')} · ${esc(bet.kind === 'multi' ? 'Same Race Multi' : 'Single')} · Frozen quote ${esc(odds(bet.odds))} · Paper stake ${esc(money(bet.stake))}</p><p>${esc(bet.settlementNote || 'Awaiting a final result.')}</p><footer><span>Potential gross return ${esc(money(bet.stake * bet.odds))}</span><strong>${bet.profit == null ? 'Pending' : `Net ${money(bet.profit)}`}</strong></footer></article>`).join('') : empty('No paper decisions yet', 'Add a future race and record a quote before its jump time.');
}
function renderRail() {
  const pending = store.bets.filter(b => b.status === 'pending');
  const settled = store.bets.filter(b => b.status !== 'pending');
  $('#railCount').textContent = String(pending.length);
  $$('.rail-tabs button').forEach(b => { const active = b.dataset.rail === railTab; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); });
  const rows = (railTab === 'pending' ? pending : settled).slice().reverse().slice(0, 30);
  $('#railContent').innerHTML = rows.length ? rows.map(bet => `<article class="rail-item ${esc(bet.status)}"><strong>${esc(betLabel(bet))}</strong><p>${esc(bet.venue)} R${esc(bet.raceNumber)} · ${esc(bet.status)}</p><b>${esc(odds(bet.odds))} · ${esc(money(bet.stake))}</b>${bet.profit == null ? '' : `<p>Net ${esc(money(bet.profit))}</p>`}</article>`).join('') : `<div class="rail-empty">${railTab === 'pending' ? 'No paper bets waiting for results.' : 'No settled paper bets yet.'}</div>`;
}
function renderResults() {
  const races = store.races.slice().sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
  if (!races.some(r => r.id === selectedResultRaceId)) selectedResultRaceId = races[0]?.id || '';
  $('#resultRaceList').innerHTML = races.length ? races.map(r => `<button type="button" data-result-race="${esc(r.id)}" class="${selectedResultRaceId === r.id ? 'active' : ''}"><strong>${esc(r.venue)} R${esc(r.raceNumber ?? '—')}</strong><small>${esc(sydneyDate(r.startTime))} · ${esc(store.results[r.id]?.status || 'No result')}</small></button>`).join('') : empty('No races', 'Add a race or load the protected card first.');
  renderResultEditor();
}
function resultOptions(value) {
  const options = [['', 'Not recorded'], ['1', '1st'], ['2', '2nd'], ['3', '3rd'], ['4', '4th'], ['out', 'Outside Top 4'], ['scratch', 'Scratched']];
  return options.map(([key, label]) => `<option value="${esc(key)}" ${String(value ?? '') === key ? 'selected' : ''}>${label}</option>`).join('');
}
function renderResultEditor() {
  const race = raceById(selectedResultRaceId);
  if (!race) { $('#resultEditor').innerHTML = empty('Select a race', 'The final order can be entered here once a race has runners.'); return; }
  const result = store.results[race.id] || {};
  const rows = (race.runners || []).slice().sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  $('#resultEditor').innerHTML = `<h2>${esc(race.venue)} R${esc(race.raceNumber)} · ${esc(race.raceName)}</h2><p>${esc(dateTime(race.startTime))} · ${result.source === 'provider' ? `Provider result checked ${dateTime(result.fetchedAt)}` : 'Manual result entry'}. Only final results settle ordinary paper bets.</p>${result.status ? `<div class="result-summary">Current status: <strong>${esc(result.status)}</strong>. Reported ground: ${esc(result.ground || race.ground || 'unknown')}.</div>` : ''}<form class="result-form" id="resultForm"><label>Ground at finish <input name="ground" maxlength="45" value="${esc(result.ground || race.ground || '')}" placeholder="e.g. Soft 5"></label><label>Result status<select name="status"><option value="provisional" ${result.status !== 'final' ? 'selected' : ''}>Provisional</option><option value="final" ${result.status === 'final' ? 'selected' : ''}>Final</option></select></label>${rows.length ? rows.map(r => `<div class="result-row"><span><strong>${esc(r.number ?? '—')}. ${esc(r.name)}</strong><small>${r.scratched ? 'Marked scratched on card' : ''}</small></span><label>Finish<select name="position:${esc(r.id)}">${resultOptions(result.positions?.[r.id] ?? (r.scratched ? 'scratch' : ''))}</select></label></div>`).join('') : `<p class="field-help">No runners on this card. Add them in the Race board to record individual placings.</p>`}<label>Result source / notes <input name="note" maxlength="500" value="${esc(result.note || '')}" placeholder="Official link or review note"></label><label class="result-flag"><input name="special" type="checkbox" ${result.special ? 'checked' : ''}> Special outcome: dead heat, deductions, protest or unclear settlement. Mark affected paper bets for review.</label><div class="form-actions"><button class="button button-primary" type="submit">Save result</button><button class="button button-quiet" type="button" data-show-view="journal">View paper journal</button></div></form>`;
}
function renderPerformance() {
  const m = metrics(), wins = m.settled.filter(b => b.status === 'won').length;
  $('#performanceMetrics').innerHTML = metric('SETTLED PAPER BETS', m.settled.length, m.settled.length < 100 ? 'Fewer than 100: too small for a return conclusion' : 'Review by market below') + metric('TOTAL STAKED', money(m.stake), 'Across settled records') + metric('NET RESULT', money(m.profit), 'Gross returns minus stake', m.profit < 0) + metric('ROI', m.roi == null ? '—' : `${(m.roi * 100).toFixed(1)}%`, `${wins} won · ${m.settled.length - wins} lost`, m.roi < 0);
  const groups = [['Win singles', b => b.kind === 'single' && b.legs[0]?.market === 'win'], ['Place singles', b => b.kind === 'single' && b.legs[0]?.market === 'place'], ['Top 3/4 multis', b => b.kind === 'multi']];
  $('#performanceBreakdown').innerHTML = `<div class="breakdown-card"><h2>By paper market</h2><table class="data-table"><thead><tr><th>Market</th><th>Settled</th><th>Staked</th><th>Net</th><th>ROI</th></tr></thead><tbody>${groups.map(([name, match]) => { const bets = m.settled.filter(match), stake = bets.reduce((s, b) => s + b.stake, 0), profit = bets.reduce((s, b) => s + b.profit, 0); return `<tr><td>${name}</td><td>${bets.length}</td><td>${money(stake)}</td><td>${money(profit)}</td><td>${stake ? `${(profit / stake * 100).toFixed(1)}%` : '—'}</td></tr>`; }).join('')}</tbody></table><p class="field-help">Pending and review items are excluded. Recorded odds and results are not independently verified.</p></div>`;
}

const strategies = [
  { id: 'market', name: 'Market gap', status: 'Research method', lead: 'Compare an offered fixed price with a probability estimate from several independent bookmaker books.', steps: [
    ['INPUTS', 'Full current market books', 'A proper comparison needs every runner’s quote from at least three other bookmakers, with margins removed. One bookmaker price alone cannot establish a fair chance.'],
    ['RULE', 'Estimated chance × odds − 1', 'A positive result is an estimated gap, not a guaranteed edge. The localhost model used +5% as an unvalidated paper-test flag.'],
    ['TEST', 'Freeze, settle, compare', 'Save prices and estimates before the jump, then assess later outcomes against a market-only baseline and all recorded no-bets.'] ], caution: 'This public workspace has no market-consensus model. It shows raw implied chance from a price only; it does not claim a positive-value selection.' },
  { id: 'prices', name: 'Price shopping', status: 'Comparison', lead: 'For the same runner and market, a higher accepted decimal quote improves the return if that outcome wins.', steps: [
    ['INPUTS', 'Current comparable quotes', 'Compare win with win, place with the same paid-place terms, and check timestamps and bookmaker rules.'],
    ['RULE', 'Same outcome, stronger quote', 'The payout at $4.20 is greater than at $4.00 for a winning $1 stake, assuming identical terms.'],
    ['TEST', 'Record what was actually offered', 'Freeze the quote and observation time. Later starting prices do not prove an earlier offer was available.'] ], caution: 'A better quote changes payout, not the horse’s underlying chance. No live price comparison is calculated here.' },
  { id: 'ground', name: 'Ground & form', status: 'Study only', lead: 'Read a horse’s prior finishes on similar going and at comparable distances before deciding what to investigate.', steps: [
    ['INPUTS', 'Reported ground and recent runs', 'Use the race-day track rating, its observed time, and past runs with known finishing places.'],
    ['DISPLAY', '1st–2nd–3rd count', 'A record such as 4–3–0 means four wins, three seconds and no thirds in the stated sample. Check the sample size.'],
    ['TEST', 'Compare later races', 'Record the ground feature before each race, then see whether it improves predictions beyond the market baseline on untouched later races.'] ], caution: 'One good run on Soft ground is not a reliable Soft-ground probability. These notes do not adjust prices or rank horses automatically.' },
  { id: 'multi', name: 'Two horses Top 3/4', status: 'Paper test', lead: 'Record a same-race combination where two different horses must each finish in their chosen Top 3 or Top 4 market.', steps: [
    ['INPUTS', 'Two distinct runners', 'Each leg may be Top 3 or Top 4. Check field size and the bookmaker’s exact market terms.'],
    ['RULE', 'Use the actual combined quote', 'The outcomes share one race and are dependent. Do not multiply leg prices to invent the multi quote.'],
    ['TEST', 'Freeze both legs and settle', 'Record the real combined price before the jump and compare both legs with official final positions. Review scratches, dead heats and deductions.'] ], caution: 'This public page calculates paper payouts, not joint probabilities or fair prices. An attractive combined quote is not evidence of value.' }
];
function renderStrategies() {
  $('#strategyTabs').innerHTML = strategies.map(s => `<button type="button" role="tab" data-strategy="${s.id}" aria-selected="${selectedStrategy === s.id}" class="${selectedStrategy === s.id ? 'active' : ''}">${esc(s.name)}</button>`).join('');
  const s = strategies.find(x => x.id === selectedStrategy) || strategies[0];
  $('#strategyPanel').innerHTML = `<p class="eyebrow">${esc(s.status)}</p><h2>${esc(s.name)}</h2><p class="strategy-lead">${esc(s.lead)}</p><div class="strategy-steps">${s.steps.map(([label, title, body]) => `<div><small>${esc(label)}</small><strong>${esc(title)}</strong><p>${esc(body)}</p></div>`).join('')}</div><div class="strategy-caution">${esc(s.caution)}</div><div class="form-actions"><button class="button button-primary" type="button" data-show-view="races">Open race board →</button><button class="button button-quiet" type="button" data-show-view="education">Learn the terms</button></div>`;
}

const lessons = {
  bets: { title: 'Decimal odds', lead: 'At $4.00, a winning $10 fixed-odds bet returns $40 in total: $30 profit plus the original $10 stake. The raw implied chance is 1 ÷ 4.00 = 25%; bookmaker margin means that is not a fair forecast on its own.', rows: [
    ['Win and place', 'Win needs first. Place needs a finish within the published number of paid positions; that number can vary by race.'],
    ['Fixed odds, SP and tote', 'Fixed odds are the accepted quote. SP is recorded around the jump, not necessarily available earlier. Tote payouts come from a pool.'],
    ['Implied chance and overround', 'Raw implied chance is 1 divided by decimal odds. Across all runners, raw chances often add to more than 100%; the excess is the bookmaker overround.'],
    ['Stake, return and profit', 'Stake is the amount risked. Gross return includes stake. Net profit is return minus stake; a losing single loses the stake.'],
    ['Each way', 'Two separate bets on one horse: a win bet and a place bet. This workspace records them separately.'],
    ['Exacta and Same Race Multi', 'An exacta requires first and second in order. A Same Race Multi combines outcomes in one race; the combined price must come from the bookmaker.'] ] },
  racing: { title: 'What “Good 4” means', lead: 'Australian turf ratings describe the surface. Good 4 sits in the Good 3–4 band; Soft 5–7 is rain affected, and Heavy 8–10 is wetter. A rating can change during a meeting.', rows: [
    ['Ground or going', 'The reported state of the surface. Note when the report was observed, and retain each past run’s exact rating.'],
    ['Form string and 1st–2nd–3rd record', 'A form string compresses prior finishes. A score such as 4–3–0 means four wins, three seconds and no thirds in the specified sample, not necessarily a career tally.'],
    ['Barrier, jockey and weight', 'Barrier is the allocated gate; the jockey rides the horse; allocated weight is the load carried. None is automatic proof of an advantage.'],
    ['Runner type', 'Leader, on pace, midfield and backmarker describe likely settling positions. A horse can race differently when the pace or draw changes.'],
    ['Maiden and benchmark', 'A maiden is yet to win. Benchmark handicaps use a published rating in eligibility and weight conditions; check the official race terms.'],
    ['Interim and final results', 'Interim placings may change after protest or review. Only official final positions should settle a paper record.'] ] },
  testing: { title: 'What a strategy must prove', lead: 'Record every prediction with only information available before the jump. Compare it with later outcomes and a simple market baseline. A small profitable-looking run can be luck.', rows: [
    ['Forward test and backtest', 'A forward test freezes decisions now. A valid backtest uses historical odds and features that were available at each earlier decision time.'],
    ['Price shopping', 'A higher accepted quote improves the payout on the same winning outcome, but says nothing by itself about fair chance.'],
    ['Ground and form study', 'One win from one Soft run is not a 100% future chance. Small-sample records are context, not probabilities.'],
    ['Paper bet and snapshot', 'A paper bet is hypothetical. The frozen record captures entered price, market, race and runner before the jump, reducing hindsight bias.'],
    ['ROI and drawdown', 'ROI is net profit divided by total settled stake. Drawdown is the fall from a prior cumulative high. Track both with sample size.'],
    ['Calibration and Brier score', 'Calibration checks whether predicted probabilities match observed frequencies. Brier score measures probability forecast error; this page does not generate probabilities to score.'] ] }
};
const glossary = [
  ['Barrier', 'Race & form', 'The starting gate allocated to a runner; also called the draw.', 'draw gate'],
  ['Benchmark', 'Race & form', 'A handicap rating used to define eligibility and weights. BM64 is a benchmark 64 race.', 'bm rating'],
  ['Blinkers', 'Race & form', 'Headgear that limits a horse’s side vision. A gear change is context, not proof of improvement.', 'gear'],
  ['Class', 'Race & form', 'A race’s eligibility or quality band. Check the exact published conditions.', 'grade'],
  ['Colt', 'Race & form', 'A male horse aged three or younger that has not been gelded.', 'young male'],
  ['Dam', 'Race & form', 'A horse’s mother.', 'mother pedigree'],
  ['Dead heat', 'Race & form', 'A tied finishing position declared by officials; settlement can differ from a normal finish.', 'tie'],
  ['Distance', 'Race & form', 'The race length, usually shown in metres in Australia.', 'trip metres'],
  ['Filly', 'Race & form', 'A female horse aged three or younger.', 'young female'],
  ['First up', 'Race & form', 'A horse’s first race after a spell or break.', '1st up fresh'],
  ['Form', 'Race & form', 'Past performances shown as a short string. A zero commonly means tenth or worse; x can mark a spell.', 'last starts'],
  ['Gelding', 'Race & form', 'A castrated male horse.', 'male horse'],
  ['Going', 'Race & form', 'The racing surface condition, such as Good, Soft or Heavy; also called ground.', 'ground track condition'],
  ['Good 4', 'Race & form', 'A turf rating in the Good band. Track ratings can change during a meeting.', 'good track'],
  ['Group race', 'Race & form', 'A high-class black-type race. Group 1 is highest, then Groups 2 and 3.', 'g1 g2 g3'],
  ['Handicap', 'Race & form', 'A race where runners can carry different allocated weights intended to balance chances.', 'weight'],
  ['Heavy', 'Race & form', 'The wettest Australian turf rating band, commonly Heavy 8–10.', 'heavy track'],
  ['Jockey', 'Race & form', 'The rider of the horse.', 'rider'],
  ['Listed race', 'Race & form', 'A black-type race below the three Group levels.', 'listed'],
  ['Maiden', 'Race & form', 'A horse yet to win a race. A maiden race is for eligible non-winners.', 'maiden race'],
  ['Mare', 'Race & form', 'A female horse aged four or older.', 'female horse'],
  ['Rail position', 'Race & form', 'Where the inside rail is set for a meeting; changes can affect the racing line.', 'rail'],
  ['Scratching', 'Race & form', 'A withdrawn runner. Late scratchings can affect fixed-odds payouts.', 'scratch withdrawn'],
  ['Second up', 'Race & form', 'A horse’s second race after a spell or break.', '2nd up'],
  ['Silks', 'Race & form', 'The jockey’s coloured jacket and cap identifying the ownership.', 'colours'],
  ['Sire', 'Race & form', 'A horse’s father.', 'father pedigree'],
  ['Soft', 'Race & form', 'A rain-affected turf band, commonly Soft 5–7.', 'soft track'],
  ['Speedmap', 'Race & form', 'A forecast of where runners may settle during the race; it is not a result.', 'pace map'],
  ['Trainer', 'Race & form', 'The person responsible for preparing a horse to race.', 'stable'],
  ['Weight', 'Race & form', 'The allocated load carried by the runner, including rider and equipment.', 'kg claim'],
  ['Each way', 'Odds & bets', 'Two bets on one horse: one to win and one to place, using two stakes.', 'ew'],
  ['Exacta', 'Odds & bets', 'Pick the first two finishers in the correct order.', 'exotic'],
  ['Favourite', 'Odds & bets', 'The runner with the shortest quoted win price at that time.', 'favorite fav'],
  ['First Four', 'Odds & bets', 'Pick the first four finishers in the correct order.', 'first 4'],
  ['Fixed odds', 'Odds & bets', 'The decimal price accepted for a fixed-odds bet, subject to operator rules.', 'price'],
  ['Implied chance', 'Odds & bets', 'One divided by decimal odds; the raw price includes bookmaker margin.', 'probability'],
  ['Overround', 'Odds & bets', 'The amount by which all raw implied chances exceed 100%, often called margin.', 'margin'],
  ['Place', 'Odds & bets', 'A runner must finish in the paid positions for that race.', 'top finish'],
  ['Quinella', 'Odds & bets', 'Pick the first two finishers in either order.', 'exotic'],
  ['Same Race Multi', 'Odds & bets', 'Combine outcomes from one race. Individual leg prices cannot simply be multiplied.', 'srm multi'],
  ['SP', 'Odds & bets', 'Starting price recorded at or after the jump; not proof of an earlier available quote.', 'starting price'],
  ['Stake', 'Odds & bets', 'The amount risked. A winning gross fixed-odds return includes the stake.', 'return profit'],
  ['Top 3 / Top 4', 'Odds & bets', 'A finish-position market within the first three or four, subject to bookmaker terms.', 'top3 top4'],
  ['Tote', 'Odds & bets', 'Pool betting where dividends are determined from the final pool.', 'totalisator'],
  ['Trifecta', 'Odds & bets', 'Pick the first three finishers in the correct order.', 'exotic'],
  ['Win', 'Odds & bets', 'The runner must finish first.', 'winner'],
  ['Drifter', 'Slang', 'A runner whose quoted odds are getting longer.', 'drift easing'],
  ['Firmer', 'Slang', 'A runner whose quoted odds are shortening.', 'shortener backed'],
  ['Mudder / mudlark', 'Slang', 'A horse thought to perform well on wet ground; check the actual sample.', 'wet tracker'],
  ['Rogue', 'Slang', 'Traditionally an ill-tempered horse. Different from a roughie.', 'rouge difficult horse'],
  ['Roughie', 'Slang', 'A long-priced outsider. Long odds alone do not make it good value.', 'roughy roguhe outsider'],
  ['Backtest', 'Testing', 'Evaluate a rule on older races using only information available before each race.', 'historic test'],
  ['Brier score', 'Testing', 'A probability forecast error measure where lower is better.', 'calibration'],
  ['Drawdown', 'Testing', 'The decline in cumulative results from an earlier high point.', 'loss run'],
  ['Forward test', 'Testing', 'Record decisions and prices before future races, then compare with final results.', 'paper test'],
  ['Market consensus', 'Testing', 'An aggregate probability estimate from multiple bookmaker books after margins are adjusted.', 'model'],
  ['Paper bet', 'Testing', 'A hypothetical selection recorded for testing; no wager is placed.', 'simulation'],
  ['Price shopping', 'Testing', 'Compare current prices for the same outcome; a higher price does not itself prove value.', 'compare odds'],
  ['ROI', 'Testing', 'Net profit divided by total stake across settled paper bets.', 'return on investment'],
  ['Value', 'Testing', 'A price above a trustworthy fair-price estimate. This workspace does not calculate a fair price.', 'edge expected value']
];
function renderEducation() {
  $$('.education-tabs button').forEach(button => { const active = button.dataset.education === educationTab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  if (educationTab === 'glossary') { renderGlossary(); return; }
  const lesson = lessons[educationTab] || lessons.bets;
  $('#educationContent').innerHTML = `<div class="lesson-lead"><h2>${esc(lesson.title)}</h2><p>${esc(lesson.lead)}</p></div><div class="lesson-grid">${lesson.rows.map(([term, meaning]) => `<details><summary>${esc(term)}</summary><p>${esc(meaning)}</p></details>`).join('')}</div>`;
}
function renderGlossary(query = '') {
  const categories = ['All', 'Race & form', 'Odds & bets', 'Slang', 'Testing'];
  const rows = glossary.filter(([term, category, definition, aliases]) => (glossaryCategory === 'All' || category === glossaryCategory) && (!query || [term, category, definition, aliases].join(' ').toLowerCase().includes(query.toLowerCase()))).sort((a, b) => a[0].localeCompare(b[0]));
  $('#educationContent').innerHTML = `<div class="glossary-toolbar"><input class="glossary-search" id="glossarySearch" type="search" value="${esc(query)}" placeholder="Search racing terms" aria-label="Search racing terms"><div class="glossary-filters">${categories.map(category => `<button type="button" data-glossary="${esc(category)}" class="${glossaryCategory === category ? 'active' : ''}" aria-pressed="${glossaryCategory === category}">${esc(category)}</button>`).join('')}</div></div><p class="glossary-count">${rows.length} of ${glossary.length} terms</p><div class="glossary-grid">${rows.length ? rows.map(([term, category, definition]) => `<article class="glossary-entry"><small>${esc(category)}</small><h3>${esc(term)}</h3><p>${esc(definition)}</p></article>`).join('') : empty('No matching terms', 'Try another word or category.')}</div>`;
}
function renderMethod() {
  $('#storageSummary').textContent = `${store.races.length} races · ${store.bets.length} paper bets · ${Object.keys(store.results).length} results saved in this browser.`;
}

function saveRace(form) {
  const data = new FormData(form), existing = raceById(String(data.get('raceId') || ''));
  const startTime = new Date(String(data.get('startTime') || ''));
  if (Number.isNaN(startTime.getTime())) throw Error('Enter a valid jump time.');
  const race = existing || { id: newId(), source: 'manual', providerId: '', runners: [] };
  Object.assign(race, {
    venue: String(data.get('venue') || '').trim().slice(0, 90), raceNumber: Number(data.get('raceNumber')),
    raceName: String(data.get('raceName') || '').trim().slice(0, 140), startTime: startTime.toISOString(),
    distance: finitePositive(data.get('distance')), paidPlaces: Number(data.get('paidPlaces')),
    ground: String(data.get('ground') || '').trim().slice(0, 45), raceClass: String(data.get('raceClass') || '').trim().slice(0, 100),
    sourceUrl: safeUrl(data.get('sourceUrl')), notes: String(data.get('notes') || '').trim().slice(0, 2000)
  });
  if (!race.venue || !race.raceName || !Number.isInteger(race.raceNumber) || race.raceNumber < 1 || race.raceNumber > 30) throw Error('Enter a venue, race name and valid race number.');
  if (!existing) store.races.push(race);
  selectedRaceId = race.id; selectedMeeting = meetingKey(race);
  saveStore(); form.reset(); $('#raceEditor').open = false; renderAll(); notice('Race saved in this browser.');
}
function editRace(race) {
  const form = $('#raceForm');
  form.elements.raceId.value = race.id;
  for (const [name, value] of Object.entries({ venue: race.venue, raceNumber: race.raceNumber, raceName: race.raceName, startTime: datetimeLocal(race.startTime), distance: race.distance, paidPlaces: race.paidPlaces || 3, ground: race.ground, raceClass: race.raceClass, sourceUrl: race.sourceUrl, notes: race.notes })) form.elements[name].value = value ?? '';
  $('#raceEditor').open = true; $('#raceEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function saveRunner(form) {
  const race = raceById(); if (!race) throw Error('Choose a race first.');
  const data = new FormData(form), old = runnerById(race, String(data.get('runnerId') || ''));
  const runner = old || { id: newId(), providerRef: '' };
  Object.assign(runner, {
    number: Number(data.get('number')), name: String(data.get('name') || '').trim().slice(0, 100),
    barrier: finitePositive(data.get('barrier')), weight: finitePositive(data.get('weight')),
    jockey: String(data.get('jockey') || '').trim().slice(0, 100), trainer: String(data.get('trainer') || '').trim().slice(0, 100),
    runStyle: String(data.get('runStyle') || ''), form: String(data.get('form') || '').trim().slice(0, 80),
    historyScore: String(data.get('historyScore') || '').trim().slice(0, 35), historyNotes: String(data.get('historyNotes') || '').trim().slice(0, 2000),
    conditionNotes: String(data.get('conditionNotes') || '').trim().slice(0, 1500), scratched: data.get('scratched') === 'on',
    winOdds: validPrice(data.get('winOdds')), placeOdds: validPrice(data.get('placeOdds')),
    top3Odds: validPrice(data.get('top3Odds')), top4Odds: validPrice(data.get('top4Odds')),
    quoteAt: data.get('quoteAt') ? new Date(String(data.get('quoteAt'))).toISOString() : '', quoteTier: '', quoteStale: false, source: 'manual'
  });
  if (!runner.name || !Number.isInteger(runner.number) || runner.number < 1 || runner.number > 99) throw Error('Enter a horse name and runner number.');
  if (race.runners.some(r => r.id !== runner.id && r.number === runner.number)) throw Error('That runner number is already on this card.');
  if (!old) race.runners.push(runner);
  expandedRunnerId = runner.id;
  saveStore(); renderAll(); notice('Runner saved in this browser.');
}
function editRunner(runner) {
  renderRaceDetail();
  const form = $('#runnerForm');
  form.elements.runnerId.value = runner.id;
  for (const [name, value] of Object.entries({ number: runner.number, name: runner.name, barrier: runner.barrier, weight: runner.weight, jockey: runner.jockey, trainer: runner.trainer, runStyle: runner.runStyle, form: runner.form, historyScore: runner.historyScore, quoteAt: datetimeLocal(runner.quoteAt), winOdds: runner.winOdds, placeOdds: runner.placeOdds, top3Odds: runner.top3Odds, top4Odds: runner.top4Odds, historyNotes: runner.historyNotes, conditionNotes: runner.conditionNotes })) form.elements[name].value = value ?? '';
  form.elements.scratched.checked = Boolean(runner.scratched);
  $('#runnerEditor').open = true; $('#runnerEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function frozenBet(race, kind, legs, price, stake) {
  return {
    id: newId(), raceId: race.id, providerId: race.providerId || '', createdAt: new Date().toISOString(),
    raceStart: race.startTime, venue: race.venue, raceNumber: race.raceNumber, raceName: race.raceName,
    ground: race.ground || '', paidPlaces: race.paidPlaces || null, mode, kind,
    legs: legs.map(({ runner, market }) => ({ runnerId: runner.id, runnerName: runner.name, runnerNumber: runner.number, market, barrier: runner.barrier, weight: runner.weight, runStyle: runner.runStyle, form: runner.form })),
    odds: price, stake, priceSource: mode === 'track' ? 'on-course manual' : 'Sportsbet quote confirmed by user',
    status: 'pending', profit: null, settlementNote: 'Awaiting a final result.'
  };
}
function saveSingle(form) {
  const race = raceById(); if (!race || raceStarted(race)) throw Error('Paper decisions close at the listed jump time.');
  const data = new FormData(form), runner = runnerById(race, String(data.get('runnerId'))), market = String(data.get('market'));
  const price = validPrice(data.get('odds')), stake = finitePositive(data.get('stake'));
  if (!runner || runner.scratched || !['win', 'place'].includes(market)) throw Error('Select an active horse and win or place market.');
  if (market === 'place' && !race.paidPlaces) throw Error('Enter the number of paid places on the race card first.');
  if (!price || !stake || stake > 100000) throw Error('Enter valid decimal odds and paper stake.');
  if (data.get('confirmed') !== 'on') throw Error('Confirm the actual quote and race terms.');
  store.bets.push(frozenBet(race, 'single', [{ runner, market }], price, stake));
  saveStore(); renderAll(); notice('Pre-race paper bet frozen. No bookmaker bet was placed.');
}
function saveMulti(form) {
  const race = raceById(); if (!race || raceStarted(race) || mode !== 'sportsbet') throw Error('Online paper multis close at the listed jump time.');
  const data = new FormData(form), first = runnerById(race, String(data.get('firstId'))), second = runnerById(race, String(data.get('secondId')));
  const firstMarket = String(data.get('firstMarket')), secondMarket = String(data.get('secondMarket'));
  const price = validPrice(data.get('odds')), stake = finitePositive(data.get('stake'));
  if (!first || !second || first.id === second.id || first.scratched || second.scratched) throw Error('Choose two different active horses.');
  if (!['top3', 'top4'].includes(firstMarket) || !['top3', 'top4'].includes(secondMarket)) throw Error('Choose Top 3 or Top 4 for each horse.');
  if (!price || !stake || stake > 100000) throw Error('Enter the actual combined decimal quote and paper stake.');
  if (data.get('confirmed') !== 'on') throw Error('Confirm the actual combined quote and race terms.');
  store.bets.push(frozenBet(race, 'multi', [{ runner: first, market: firstMarket }, { runner: second, market: secondMarket }], price, stake));
  saveStore(); renderAll(); notice('Pre-race paper multi frozen at your entered combined quote.');
}
function saveResult(form) {
  const race = raceById(selectedResultRaceId); if (!race) throw Error('Choose a race first.');
  const data = new FormData(form), positions = {};
  for (const runner of race.runners) {
    const value = String(data.get(`position:${runner.id}`) || '');
    positions[runner.id] = ['out', 'scratch'].includes(value) ? value : value ? Number(value) : '';
  }
  const numeric = Object.values(positions).filter(v => Number.isInteger(v) && v > 0);
  const duplicate = new Set(numeric).size !== numeric.length;
  const special = data.get('special') === 'on' || duplicate;
  const prior = store.results[race.id];
  store.results[race.id] = { raceId: race.id, status: String(data.get('status')) === 'final' ? 'final' : 'provisional', ground: String(data.get('ground') || '').trim().slice(0, 45), positions, special, note: String(data.get('note') || '').trim().slice(0, 500), source: 'manual', savedAt: new Date().toISOString(), fetchedAt: prior?.fetchedAt || '' };
  settleAll(); saveStore(); renderResults(); renderRail(); notice(duplicate ? 'Duplicate places detected. Related bets need manual review.' : 'Result saved; final simple outcomes were settled.');
}

function createResultOnlyRace(raw, fetchedAt) {
  const id = `pe:${raw.race_id}`;
  if (raceById(id)) return;
  const fullField = Array.isArray(raw.runners) ? raw.runners : [];
  const placings = Array.isArray(raw.placings) ? raw.placings : [];
  const runners = fullField.length ? fullField : placings;
  const time = new Date(raw.start_time || fetchedAt);
  store.races.push({
    id, providerId: String(raw.race_id), source: 'result-only', sourceUrl: '',
    venue: String(raw.venue || 'Unknown venue').slice(0, 90), raceNumber: number(raw.race_number),
    raceName: String(raw.race_name || `Race ${raw.race_number || ''}`).slice(0, 140),
    startTime: Number.isNaN(time.getTime()) ? fetchedAt : time.toISOString(),
    distance: number(raw.distance_m), paidPlaces: null, ground: String(raw.track_condition || '').slice(0, 45),
    raceClass: '', notes: 'Result-only card imported from the protected feed; no pre-race odds are available.', fetchedAt,
    runners: runners.filter(p => p?.name).slice(0, 40).map(p => ({ ...normalizedProviderRunner({ ...p, runner_ref: p.runner_ref || `${p.number}:${p.name}` }, fetchedAt), winOdds: null, placeOdds: null, top3Odds: null, top4Odds: null }))
  });
}
function absorbResults(rows, fetchedAt) {
  let count = 0, final = 0;
  for (const raw of rows || []) {
    if (!raw?.race_id) continue;
    createResultOnlyRace(raw, fetchedAt);
    const result = normalizedProviderResult(raw, fetchedAt);
    if (!result) continue;
    const old = store.results[result.raceId];
    if (old?.status === 'final' && result.status !== 'final') continue;
    store.results[result.raceId] = result; count++;
    if (result.status === 'final') final++;
  }
  settleAll(); saveStore(); renderAll();
  return { count, final };
}
async function loadBoard() {
  const button = $('#loadBoard'); setBusy(button, true, '↻ Load card');
  $('#feedStatus').textContent = 'Checking protected feed…';
  try {
    const data = await gateway('board', { date: $('#feedDate').value });
    const fetchedAt = data.fetched_at || new Date().toISOString();
    const acceptanceRows = normalizedAcceptanceRaces(data.acceptances, fetchedAt);
    for (const race of acceptanceRows) mergeFeedRace(race);
    for (const raw of data.races || []) { const race = normalizedPricedRace(raw, fetchedAt); if (race) mergeFeedRace(race); }
    saveStore(); renderAll();
    const remaining = data.usage?.credits_remaining;
    $('#feedStatus').textContent = `Checked ${dateTime(fetchedAt)} · ${data.races?.length || 0} priced races${acceptanceRows.length ? ` + ${acceptanceRows.length} acceptance card races` : ''}${remaining == null ? '' : ` · ${remaining} credits left`}`;
    notice(data.acceptance_error ? `Priced races loaded. Full card: ${data.acceptance_error}` : 'Protected race card loaded. Recheck quotes before use.');
  } catch (error) { $('#feedStatus').textContent = error.message; notice(error.message, true); }
  finally { setBusy(button, false, '↻ Load upcoming'); }
}
async function loadResults(nextPage = false) {
  const button = nextPage ? $('#loadMoreResults') : $('#loadResults');
  const hours = Number($('#resultLookback').value);
  if (!nextPage || hours !== lastLookback) { resultOffset = 0; lastLookback = hours; }
  else resultOffset += 200;
  if (resultOffset > 1800) { notice('The feed allows up to ten results pages per lookback.', true); return; }
  setBusy(button, true, nextPage ? 'Next page' : '↻ Load results');
  try {
    const data = await gateway('results', { hours_back: hours, offset: resultOffset });
    const info = absorbResults(data.results, data.fetched_at || new Date().toISOString());
    $('#loadMoreResults').hidden = !data.has_more || resultOffset >= 1800;
    notice(`${info.count} results saved from this page; ${info.final} final. ${data.usage?.credits_remaining ?? '—'} credits left.`);
  } catch (error) { if (nextPage) resultOffset -= 200; notice(error.message, true); }
  finally { setBusy(button, false, nextPage ? 'Next page' : '↻ Load results'); }
}
async function loadMeeting(race) {
  if (!race?.providerId) return;
  try {
    const data = await gateway('meeting', { date: sydneyDate(race.startTime), venue: race.venue });
    const matching = (data.track?.meetings || []).find(m => String(m?.venue || '').toLowerCase() === race.venue.toLowerCase());
    const ground = matching?.current?.track_condition;
    if (ground) for (const same of store.races.filter(r => meetingKey(r) === meetingKey(race))) same.ground = String(ground).slice(0, 45);
    const info = absorbResults(data.results, data.fetched_at || new Date().toISOString());
    notice(`Meeting checked: ${ground || 'ground unchanged'}; ${info.final} final results. Verify observation time at the official source.`);
  } catch (error) { notice(error.message, true); }
}
async function loadForm(race) {
  if (!race?.providerId) return;
  try {
    const data = await gateway('form', { race_id: race.providerId, runs: 20 });
    const rows = Array.isArray(data.form?.runners) ? data.form.runners : [];
    for (const raw of rows) {
      const runner = race.runners.find(r => r.providerRef && r.providerRef === String(raw.runner_ref || '') || r.number === Number(raw.number) && r.name === String(raw.name || ''));
      if (!runner) continue;
      const runs = Array.isArray(raw.runs) ? raw.runs : [];
      const known = runs.filter(x => x?.status === 'ran' && Number.isInteger(Number(x.position)) && Number(x.position) > 0);
      const score = [1, 2, 3].map(pos => known.filter(x => Number(x.position) === pos).length).join('-');
      if (!runner.historyScore) runner.historyScore = score;
      if (!runner.historyNotes || runner.historyNotes.startsWith('Provider form checked')) {
        runner.historyNotes = `Provider form checked ${dateTime(data.fetched_at)}. ${runs.slice(0, 20).map(x => `${x.date || x.race_date || 'Date unknown'} · ${x.distance_m || '?'}m · ${x.track_condition || 'ground unknown'} · ${x.position || x.status || 'finish unknown'}`).join('; ')}`.slice(0, 2000);
      }
    }
    saveStore(); renderAll(); notice(`Recent form checked for ${rows.length} runners. Records are descriptive, not a prediction.`);
  } catch (error) { notice(error.message, true); }
}

function exportBackup() {
  const body = JSON.stringify(store, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `formline-research-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Backup downloaded. Store it somewhere private.');
}
function validImportedStore(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.races) || !Array.isArray(data.bets) || !data.results || typeof data.results !== 'object' || Array.isArray(data.results)) return false;
  if (data.races.length > 350 || data.bets.length > 5000 || Object.keys(data.results).length > 500) return false;
  const idOk = value => typeof value === 'string' && /^[A-Za-z0-9:._-]{1,120}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
  if (!data.races.every(r => idOk(r?.id) && typeof r.venue === 'string' && typeof r.raceName === 'string' && !Number.isNaN(Date.parse(r.startTime)) && Array.isArray(r.runners) && r.runners.length <= 40 && r.runners.every(x => idOk(x?.id) && typeof x.name === 'string'))) return false;
  if (!data.bets.every(b => idOk(b?.id) && idOk(b?.raceId) && !Number.isNaN(Date.parse(b.createdAt)) && validPrice(b.odds) && finitePositive(b.stake) && Array.isArray(b.legs) && [1, 2].includes(b.legs.length) && b.legs.every(l => idOk(l?.runnerId) && ['win', 'place', 'top3', 'top4'].includes(l?.market)))) return false;
  if (!Object.entries(data.results).every(([key, r]) => idOk(key) && ['final', 'provisional'].includes(r?.status) && r.positions && typeof r.positions === 'object' && !Array.isArray(r.positions))) return false;
  return true;
}
async function importBackup(file) {
  if (!file) return;
  if (file.size > 5_000_000) throw Error('Choose a FormLine backup smaller than 5 MB.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { throw Error('That file is not valid JSON.'); }
  if (!validImportedStore(parsed)) throw Error('That file is not a supported FormLine workspace backup.');
  if (!confirm(`Replace this browser's ${store.races.length} races and ${store.bets.length} paper bets with the imported backup? Export your current data first if needed.`)) return;
  store = parsed; settleAll(); selectedMeeting = ''; selectedRaceId = ''; selectedResultRaceId = '';
  saveStore(); renderAll(); notice('Backup imported into this browser.');
}

document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.view) { setView(target.dataset.view); return; }
  if (target.dataset.showView) { setView(target.dataset.showView); return; }
  if (target.dataset.meeting) { selectedMeeting = target.dataset.meeting; selectedRaceId = ''; renderBoard(); return; }
  if (target.dataset.race) { selectedRaceId = target.dataset.race; expandedRunnerId = ''; renderBoard(); return; }
  if (target.dataset.expandRunner) { expandedRunnerId = expandedRunnerId === target.dataset.expandRunner ? '' : target.dataset.expandRunner; renderRaceDetail(); return; }
  if (target.dataset.editRace) { const race = raceById(target.dataset.editRace); if (race) editRace(race); return; }
  if (target.dataset.editRunner) { const runner = runnerById(raceById(), target.dataset.editRunner); if (runner) editRunner(runner); return; }
  if (target.dataset.selectRunner) { const form = $('#singleForm'); if (form) { form.elements.runnerId.value = target.dataset.selectRunner; fillSingleQuote(); $('#paperEntry')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
  if (target.dataset.resultRace) { selectedResultRaceId = target.dataset.resultRace; renderResults(); return; }
  if (target.dataset.mode) { mode = target.dataset.mode; renderRaceDetail(); return; }
  if (target.dataset.rail) { railTab = target.dataset.rail; renderRail(); return; }
  if (target.dataset.strategy) { selectedStrategy = target.dataset.strategy; renderStrategies(); return; }
  if (target.dataset.education) { educationTab = target.dataset.education; renderEducation(); return; }
  if (target.dataset.glossary) { glossaryCategory = target.dataset.glossary; renderGlossary($('#glossarySearch')?.value || ''); return; }
  if (target.dataset.loadMeeting) { loadMeeting(raceById(target.dataset.loadMeeting)); return; }
  if (target.dataset.loadForm) { loadForm(raceById(target.dataset.loadForm)); return; }
  if (target.id === 'menuToggle') { $('#toolSidebar').classList.contains('open') ? closeNav() : openNav(); return; }
  if (target.id === 'navScrim') { closeNav(); return; }
  if (target.id === 'railToggle') { $('#paperRail').classList.contains('open') ? closeRail() : openRail(); return; }
  if (target.id === 'railClose' || target.id === 'railScrim') { closeRail(); return; }
  if (target.id === 'cancelRaceEdit') { $('#raceForm').reset(); $('#raceForm').elements.raceId.value = ''; $('#raceEditor').open = false; return; }
  if (target.id === 'cancelRunnerEdit') { $('#runnerForm').reset(); $('#runnerForm').elements.runnerId.value = ''; $('#runnerEditor').open = false; return; }
  if (target.id === 'loadBoard') { loadBoard(); return; }
  if (target.id === 'loadResults') { loadResults(false); return; }
  if (target.id === 'loadMoreResults') { loadResults(true); return; }
  if (target.id === 'exportData') { exportBackup(); }
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!['raceForm', 'runnerForm', 'singleForm', 'multiForm', 'resultForm'].includes(form.id)) return;
  event.preventDefault();
  try {
    if (form.id === 'raceForm') saveRace(form);
    else if (form.id === 'runnerForm') saveRunner(form);
    else if (form.id === 'singleForm') saveSingle(form);
    else if (form.id === 'multiForm') saveMulti(form);
    else saveResult(form);
  } catch (error) { notice(error.message, true); }
});
document.addEventListener('change', event => {
  if (event.target.closest('#singleForm') && ['runnerId', 'market'].includes(event.target.name)) fillSingleQuote();
  if (event.target.closest('#multiForm') && ['firstId', 'secondId', 'firstMarket', 'secondMarket'].includes(event.target.name)) updateMultiPreview();
});
document.addEventListener('input', event => {
  if (event.target.id === 'glossarySearch') {
    const query = event.target.value; renderGlossary(query);
    const input = $('#glossarySearch'); input.focus(); input.setSelectionRange(query.length, query.length);
  }
});
$('#importData').addEventListener('change', async event => {
  try { await importBackup(event.target.files?.[0]); } catch (error) { notice(error.message, true); }
  event.target.value = '';
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeNav(); closeRail(); } });

settleAll();
const today = sydneyDate(new Date());
$('#feedDate').value = today;
$('#feedDate').min = today;
$('#feedDate').max = sydneyDate(new Date(Date.now() + 3 * 86400000));
$('#feedStatus').textContent = feedCode ? 'Access code saved for this browser session · connection not checked' : 'Connection not checked · access code required';
renderBoard();
renderRail();

'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const CODE_KEY = 'formline_access_code_session';
const state = { date: '', meeting: '', race: '', publicMeetings: [], privateMeetings: [], savedMeetings: [], boardCache: new Map(), formCache: new Map(), qldCards: new Set(), code: '', analysis: null, loadingRace: '', requestId: 0 };
try { state.code = sessionStorage.getItem(CODE_KEY) || ''; } catch { /* Session storage can be unavailable. */ }
function dateKey(value) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function dayAt(offset) { return dateKey(new Date(Date.now() + offset * 86400000)); }
function dateLabel(key, options = {}) { return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: options.weekday || 'short', day: 'numeric', month: 'short' }).format(new Date(`${key}T12:00:00+11:00`)); }
function timeLabel(value) { if (!value || !Number.isFinite(Date.parse(value))) return 'Time TBC'; return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)); }
function safeUrl(value) { try { const url = new URL(String(value)); return url.protocol === 'https:' && /(^|\.)(racingnsw\.com\.au|racing\.com|racingqueensland\.com\.au|racingaustralia\.horse|vrc\.com\.au|racehub\.com\.au|racingandsports\.com\.au)$/.test(url.hostname) ? url.href : ''; } catch { return ''; } }
function meetingId(row) { return `${row.date}|${String(row.venue || '').trim().toLowerCase()}`; }
function raceId(row, meeting) { return `${meetingId(meeting)}|${Number(row.number)}`; }
function todayPlusRange(key, max = 6) { return key >= dayAt(0) && key <= dayAt(max); }
function withinFeedRange(key) { return key >= dayAt(0) && key <= dayAt(3); }
function officialLink(url, label = 'Official card ↗') { const safe = safeUrl(url); return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : ''; }
function scheduleNote(message) { $('#scheduleStatus').textContent = message; }
function localStart(day, display) {
  if (Number.isFinite(Date.parse(display))) return new Date(display).toISOString();
  const match = String(display || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return '';
  let hour = Number(match[1]) % 12; if (match[3].toLowerCase() === 'pm') hour += 12;
  const wall = Date.UTC(...day.split('-').map((n, index) => index === 1 ? Number(n) - 1 : Number(n)), hour, Number(match[2]));
  const zone = new Intl.DateTimeFormat('en', { timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset' }).formatToParts(new Date(wall)).find(x => x.type === 'timeZoneName')?.value || 'GMT+11';
  const offset = zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const minutes = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3] || 0)) : 660;
  return new Date(wall - minutes * 60000).toISOString();
}
function normalisePublic(meetings) {
  return (Array.isArray(meetings) ? meetings : []).filter(row => row?.date && row?.venue && todayPlusRange(row.date)).map(row => ({
    ...row, source_url: safeUrl(row.source_url), races: (Array.isArray(row.races) ? row.races : []).filter(r => Number.isInteger(Number(r?.number)) && Number(r.number) > 0).map(r => ({ ...r, number: Number(r.number), source_url: safeUrl(r.source_url || row.source_url), start_time: r.start_time || '', preview_url: safeUrl(r.preview_url) }))
  }));
}
function savedMeetings() {
  try {
    const store = JSON.parse(localStorage.getItem('formline_research_workspace_v1') || 'null');
    if (!Array.isArray(store?.races)) return [];
    const map = new Map();
    for (const race of store.races) {
      if (!Number.isFinite(Date.parse(race.startTime || ''))) continue;
      const date = dateKey(new Date(race.startTime));
      if (!todayPlusRange(date) || !race.venue || !Number.isInteger(Number(race.raceNumber))) continue;
      const key = `${date}|${String(race.venue).toLowerCase()}`;
      if (!map.has(key)) map.set(key, { date, venue: race.venue, state: '', feature: 'Saved research', source_url: safeUrl(race.sourceUrl), source: 'saved', races: [] });
      map.get(key).races.push({ number: Number(race.raceNumber), name: race.raceName, start_time: race.startTime, distance_m: race.distance, source_url: safeUrl(race.sourceUrl), privateRace: race });
    }
    return [...map.values()];
  } catch { return []; }
}
function mergedMeetings(date = state.date) {
  const map = new Map();
  for (const row of [...state.publicMeetings, ...state.savedMeetings, ...state.privateMeetings]) {
    if (row.date !== date) continue;
    const id = meetingId(row), old = map.get(id);
    if (!old) { map.set(id, { ...row, races: row.races.slice() }); continue; }
    const raceMap = new Map(old.races.map(r => [Number(r.number), r]));
    for (const race of row.races) {
      const previous = raceMap.get(Number(race.number));
      raceMap.set(Number(race.number), { ...previous, ...race,
        source_url: race.source_url || previous?.source_url || '',
        start_time: race.start_time || previous?.start_time || '',
        preview_url: race.preview_url || previous?.preview_url || '' });
    }
    map.set(id, { ...old, ...row, feature: row.feature || old.feature, source_url: row.source_url || old.source_url, races: [...raceMap.values()].sort((a, b) => a.number - b.number) });
  }
  return [...map.values()].sort((a, b) => a.venue.localeCompare(b.venue));
}
function selectedMeeting() { return mergedMeetings().find(row => meetingId(row) === state.meeting); }
function selectedRace() { const meeting = selectedMeeting(); return meeting?.races.find(row => raceId(row, meeting) === state.race); }
function renderDates() {
  $('#dateTabs').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const date = dayAt(i), count = mergedMeetings(date).length;
    return `<button type="button" data-date="${date}" aria-pressed="${date === state.date}"><strong>${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : esc(dateLabel(date).split(',')[0])}</strong><small>${esc(dateLabel(date).replace(/^\w+,?\s*/, ''))} · ${count} meeting${count === 1 ? '' : 's'}</small></button>`;
  }).join('');
}
function renderMeetings() {
  const meetings = mergedMeetings(); $('#meetingCount').textContent = String(meetings.length);
  $('#meetingList').innerHTML = meetings.length ? meetings.map(row => `<button type="button" class="meeting-choice" data-meeting-id="${esc(meetingId(row))}" aria-pressed="${meetingId(row) === state.meeting}"><span><strong>${esc(row.venue)}</strong><small>${esc(row.state || row.feature || 'Australia')} · ${row.races.length ? `${row.races.length} race${row.races.length === 1 ? '' : 's'} listed` : row.race_count ? `${row.race_count} scheduled · program pending` : 'Fields pending'}</small></span><span aria-hidden="true">↗</span></button>`).join('') : `<div class="empty-state"><strong>No card published here yet</strong><p>Try another day or load your private card. Racing NSW, Racing.com and Racing Queensland publish current official information.</p></div>`;
  $('#scheduleSource').innerHTML = `Schedule entries are dated and linked to their source. Times and fields may change. ${officialLink('https://www.racingnsw.com.au/race-time-information/', 'NSW times ↗')} ${officialLink('https://www.racing.com/group-races-calendar', 'Victorian features ↗')} ${officialLink('https://www.racingqueensland.com.au/racing/full-calendar', 'Queensland calendar ↗')}`;
}
function renderRaces() {
  const meeting = selectedMeeting();
  $('#selectedMeetingDate').textContent = meeting ? dateLabel(meeting.date, { weekday: 'long' }).toUpperCase() : 'CHOOSE A MEETING';
  $('#selectedMeetingTitle').textContent = meeting ? meeting.venue + (meeting.feature ? ` · ${meeting.feature}` : '') : 'Race card';
  const source = safeUrl(meeting?.state === 'QLD' ? 'https://www.racingqueensland.com.au/racing/full-calendar' : meeting?.source_url); $('#meetingSourceLink').hidden = !source; if (source) $('#meetingSourceLink').href = source;
  $('#raceList').innerHTML = !meeting ? '<p class="loading">Select a meeting to see its races.</p>' : meeting.races.length ? meeting.races.map(r => {
    const started = r.start_time && Date.parse(r.start_time) <= Date.now();
    return `<button type="button" class="today-race ${started ? 'started' : ''}" data-race-id="${esc(raceId(r, meeting))}" aria-pressed="${state.race === raceId(r, meeting)}"><span>R${r.number}</span><span><strong>${esc(r.name || `Race ${r.number}`)}</strong><small>${esc(r.distance_m ? `${r.distance_m}m · ` : '')}${esc(r.preview_url ? 'Publisher preview linked on open' : 'Open to check selections and field')}</small></span><span>${esc(timeLabel(r.start_time))}</span></button>`;
  }).join('') : `<div class="empty-state"><strong>Race order is not published in this card yet</strong><p>Open the linked official meeting or load the private acceptance card when it becomes available.</p></div>`;
  if (meeting?.meeting_id && !state.qldCards.has(meetingId(meeting))) $('#raceList').insertAdjacentHTML('beforeend', `<button type="button" id="loadQldCard" class="today-race"><span>↻</span><span><strong>Load Queensland race program</strong><small>Official open data · may have fewer races before acceptances</small></span><span>Open</span></button>`);
}
function renderBoard() { renderDates(); renderMeetings(); renderRaces(); }
function infoPanel(race, meeting, body) {
  const jump = race.start_time && Date.parse(race.start_time) <= Date.now();
  const source = meeting.state === 'QLD' ? 'https://www.racingqueensland.com.au/racing/full-calendar' : race.source_url || meeting.source_url;
  return `<div class="analysis-top"><div><p class="eyebrow">${esc(meeting.venue)} · R${race.number} · ${esc(dateLabel(meeting.date))}</p><h3>${esc(race.name || `Race ${race.number}`)}</h3><p>${esc(timeLabel(race.start_time))} AEDT · ${jump ? 'Scheduled jump has passed' : 'Upcoming'} · Analysis runs only when this race is opened</p></div>${officialLink(source)}</div><div class="analysis-facts">${race.distance_m ? `<span>${esc(race.distance_m)}m</span>` : ''}${meeting.state ? `<span>${esc(meeting.state)}</span>` : ''}<span>${esc(meeting.feature || 'Thoroughbred')}</span></div>${body}`;
}
function noAnalysisReason(race, meeting, message, warning = true) {
  const distance = Number(race.distance_m);
  const lens = Number.isFinite(distance) && distance > 0 && distance <= 1200
    ? 'For this shorter trip, review early speed, the effective gate, rail and likely cover. The draw alone is not a prediction.'
    : Number.isFinite(distance) && distance >= 2000
      ? 'For this longer trip, look for relevant staying runs, current fitness, weight and how the horse handles today’s ground.'
      : 'Compare recent runs near this distance, class, likely early position and the current ground for every active runner.';
  const preview = race.preview_url ? `<p class="analysis-foot">A separate publisher has a race preview: ${officialLink(race.preview_url, 'Open external preview ↗')}</p>` : '';
  $('#analysisPanel').innerHTML = infoPanel(race, meeting, `<p class="analysis-state ${warning ? 'warning' : ''}">${esc(message)}</p><div class="prediction-card"><p class="eyebrow">WHAT THE ANALYSIS WILL CHECK</p><p>${esc(lens)}</p></div>${preview}<p class="analysis-foot">Two-horse Top 3/4/5 proposals need a complete accepted field and fresh win-market data. We do not invent runner selections or combined prices.</p>`);
}
function renderAnalysis() {
  const race = selectedRace(), meeting = selectedMeeting(), analysis = state.analysis;
  if (!race || !meeting) { $('#analysisPanel').innerHTML = '<div class="empty-state"><strong>Choose a race above</strong><p>Selections and placement ideas will appear here when a complete, current field is available.</p></div>'; return; }
  if (state.loadingRace === state.race) { $('#analysisPanel').innerHTML = infoPanel(race, meeting, '<p class="analysis-state">Checking the selected race’s field, form and prices…</p>'); return; }
  if (!analysis || analysis.raceId !== state.race) { noAnalysisReason(race, meeting, 'Open a race to analyse it. A private access code is needed for current fields and market data.'); return; }
  const model = analysis.model;
  if (model.status !== 'ready') { noAnalysisReason(race, meeting, model.reason || 'No reliable pre-race analysis is available.'); return; }
  const cards = model.selections.slice(0, 3).map(row => `<article class="prediction-card"><p class="eyebrow">${['FIRST LOOK', 'SECOND LOOK', 'THIRD LOOK'][row.rank - 1] || 'WATCH'}</p><h4>#${esc(row.runner.number)} ${esc(row.runner.name)}</h4><div class="analysis-facts">${row.runner.barrier != null ? `<span>Gate ${esc(row.runner.barrier)}</span>` : ''}${row.runner.weight != null ? `<span>${esc(row.runner.weight)}kg</span>` : ''}</div>${row.reasons.map(reason => `<p>• ${esc(reason)}</p>`).join('')}<p class="risk"><strong>Check:</strong> ${esc(row.risks.join(' '))}</p></article>`).join('');
  const choices = model.proposals.map((row, index) => `<article class="multi-card" data-proposal="${index}"><p class="eyebrow">PLACEMENT SCENARIO ${index + 1}</p><h4>${esc(row.legs.map(leg => `${leg.runner.name} Top ${leg.market.slice(3)}`).join(' + '))}</h4><div class="multi-legs">${row.legs.map(leg => `<span>#${esc(leg.runner.number)} ${esc(leg.runner.name)} · Top ${esc(leg.market.slice(3))}</span>`).join('')}</div>${row.reasons.map(reason => `<p>${esc(reason)}</p>`).join('')}<p class="risk">${esc(row.risks.join(' '))}</p><p><strong>Combined quote:</strong> check with bookmaker</p></article>`).join('');
  $('#analysisPanel').innerHTML = infoPanel(race, meeting, `<p class="analysis-state">${esc(model.basis)} · ${esc(model.fieldSize)} active runners · checked ${esc(timeLabel(model.analysedAt))} AEDT. This is a descriptive market-led ranking, not a tested edge.</p><div class="analysis-actions"><label for="scenarioFilter">Placement filter</label><select id="scenarioFilter"><option value="all">All available scenarios</option><option value="top3">Both Top 3</option><option value="top4">Both Top 4</option><option value="top5">Both Top 5</option></select><button type="button" class="secondary" id="refreshRace">Refresh this race</button></div><div class="prediction-list">${cards}</div><section class="multi-section"><h3>Two-horse same-race ideas</h3><p>Top 3/4/5 means both horses finish inside their specified bands, in either order. Exacta is a separate exact-order market. Availability depends on the bookmaker and final field.</p><div id="multiList" class="multi-list">${choices}</div></section><p class="analysis-foot">${esc(model.limitations.join(' '))} Confirm scratchings, ground, rider and the actual combined quote before recording a paper selection. ${officialLink(race.source_url || meeting.source_url)}</p>`);
}
function filterProposals() {
  const value = $('#scenarioFilter')?.value || 'all';
  $('#noScenario')?.remove();
  document.querySelectorAll('#multiList [data-proposal]').forEach(node => {
    const row = state.analysis?.model?.proposals?.[Number(node.dataset.proposal)];
    node.hidden = value !== 'all' && !row?.legs?.every(leg => leg.market === value);
  });
  if (value !== 'all' && ![...document.querySelectorAll('#multiList [data-proposal]')].some(node => !node.hidden)) $('#multiList').insertAdjacentHTML('beforeend', '<p id="noScenario" class="analysis-foot">This finish band is unavailable for the saved field size. Check the bookmaker’s current market list.</p>');
  else $('#noScenario')?.remove();
}
async function gateway(action, params = {}) {
  if (!state.code) throw Error('Enter your FormLine access code below, then load the selected day.');
  const url = new URL('/api/puntersedge', location.href); url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { 'X-FormLine-Access-Code': state.code, Accept: 'application/json' }, cache: 'no-store' });
  let body = null; try { body = await response.json(); } catch { /* Keep error clear. */ }
  if (!response.ok) throw Error(body?.error || `Private feed returned HTTP ${response.status}.`);
  return body;
}
function normalisePrivate(data, date) {
  const priced = Array.isArray(data.races) ? data.races : [];
  const pricedById = new Map(priced.map(row => [String(row.race_id), row]));
  const byVenueRace = new Map(priced.map(row => [`${String(row.venue).toLowerCase()}|${Number(row.race_number)}`, row]));
  const meetings = [];
  for (const meeting of data.acceptances?.meetings || []) {
    if (!meeting?.venue) continue;
    const rows = [];
    for (const raw of meeting.races || []) {
      const price = pricedById.get(String(raw.race_id)) || byVenueRace.get(`${String(meeting.venue).toLowerCase()}|${Number(raw.race_number)}`);
      const scratched = new Set((price?.scratchings || []).map(row => Number(row.number)));
      const priceByRef = new Map((price?.runners || []).map(row => [String(row.runner_ref || ''), row]));
      const priceByNumber = new Map((price?.runners || []).map(row => [Number(row.number), row]));
      const runners = (raw.runners || []).filter(row => row && !row.emergency && (row.runner_name || row.name)).map(row => {
        const market = row.runner_ref ? priceByRef.get(String(row.runner_ref)) || priceByNumber.get(Number(row.number)) : priceByNumber.get(Number(row.number));
        return { ...row, ...market, name: String(row.runner_name || row.name || market?.name || ''), scratched: Boolean(row.scratched || market?.scratched || scratched.has(Number(row.number))), emergency: false };
      });
      rows.push({ number: Number(raw.race_number), name: raw.race_name || price?.race_name || `Race ${raw.race_number}`, start_time: price?.start_time || localStart(date, raw.start_time_local), distance_m: Number(raw.distance_m || price?.distance_m) || null, source_url: '', privateRace: { venue: meeting.venue, raceName: raw.race_name || price?.race_name, raceNumber: Number(raw.race_number), startTime: price?.start_time || localStart(date, raw.start_time_local), distance: Number(raw.distance_m || price?.distance_m) || null, ground: price?.track_condition || meeting.track?.track_condition || '', fieldComplete: runners.length > 0, providerId: String(raw.race_id || price?.race_id || ''), runners } });
    }
    meetings.push({ date, venue: String(meeting.venue), state: 'Private card', feature: '', source_url: '', source: 'private', races: rows });
  }
  for (const row of priced) {
    const key = `${String(row.venue).toLowerCase()}|${Number(row.race_number)}`;
    if (meetings.some(meeting => meeting.venue.toLowerCase() === String(row.venue).toLowerCase() && meeting.races.some(r => r.number === Number(row.race_number)))) continue;
    let meeting = meetings.find(m => m.venue.toLowerCase() === String(row.venue).toLowerCase());
    if (!meeting) { meeting = { date, venue: row.venue, state: 'Private card', feature: '', source_url: '', source: 'private', races: [] }; meetings.push(meeting); }
    meeting.races.push({ number: Number(row.race_number), name: row.race_name, start_time: row.start_time, distance_m: row.distance_m, source_url: '', privateRace: { venue: row.venue, raceName: row.race_name, raceNumber: Number(row.race_number), startTime: row.start_time, distance: row.distance_m, ground: row.track_condition, fieldComplete: false, providerId: String(row.race_id), runners: row.runners || [] } });
  }
  return meetings;
}
async function loadPrivateCard(date, force = false) {
  if (!withinFeedRange(date)) throw Error('The protected feed covers today through three days ahead. Later fields may not be declared yet.');
  const cached = state.boardCache.get(date);
  if (!force && cached && Date.now() - cached.checkedAt < 60000) return cached.data;
  const data = await gateway('board', { date });
  const meetings = normalisePrivate(data, date);
  state.privateMeetings = state.privateMeetings.filter(row => row.date !== date).concat(meetings);
  state.boardCache.set(date, { data, checkedAt: Date.now() });
  state.savedMeetings = savedMeetings();
  scheduleNote(`${meetings.length} private meeting${meetings.length === 1 ? '' : 's'} loaded for ${dateLabel(date)} · public schedule remains source-linked.`);
  $('#feedStatus').textContent = `Card checked ${timeLabel(data.fetched_at)} · ${data.usage?.credits_remaining ?? '—'} credits left`;
  renderBoard();
  return data;
}
async function loadFormForRace(privateRace) {
  if (!privateRace?.providerId) return;
  const data = state.formCache.get(privateRace.providerId) || await gateway('form', { race_id: privateRace.providerId, runs: 20 });
  const rows = Array.isArray(data.form?.runners) ? data.form.runners : [];
  for (const raw of rows) {
    const runner = privateRace.runners.find(row => String(row.runner_ref || '') && String(row.runner_ref) === String(raw.runner_ref || '') || Number(row.number) === Number(raw.number) && String(row.name).toLowerCase() === String(raw.name || raw.runner_name || '').toLowerCase());
    if (runner) runner.recentRuns = Array.isArray(raw.runs) ? raw.runs : [];
  }
  state.formCache.set(privateRace.providerId, data);
}
async function loadQueenslandCard(meeting) {
  if (!meeting?.meeting_id || state.qldCards.has(meetingId(meeting))) return;
  const response = await fetch(`/api/schedule?action=card&meeting_id=${encodeURIComponent(meeting.meeting_id)}&date=${encodeURIComponent(meeting.date)}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `Queensland race program returned HTTP ${response.status}.`);
  const original = state.publicMeetings.find(row => meetingId(row) === meetingId(meeting) && row.meeting_id);
  if (!original) return;
  original.races = normalisePublic([{ ...original, races: data.races }])[0]?.races || [];
  state.qldCards.add(meetingId(meeting));
  renderBoard();
}
async function analyseSelectedRace(force = false) {
  const requestId = ++state.requestId;
  let meeting = selectedMeeting(), race = selectedRace();
  if (!meeting || !race) return;
  state.loadingRace = state.race; renderAnalysis();
  try {
    if (state.code && withinFeedRange(meeting.date)) {
      await loadPrivateCard(meeting.date, force);
      if (requestId !== state.requestId) return;
      meeting = selectedMeeting(); race = selectedRace();
    }
    const privateRace = race?.privateRace;
    if (!privateRace) { state.analysis = { raceId: state.race, model: { status: 'no-field', reason: state.code ? 'This race is not yet in the protected acceptance card. Check the official source and try closer to race day.' : 'Enter your FormLine access code below to request the current field when it is available.' } }; return; }
    if (privateRace.providerId && state.code) {
      try { await loadFormForRace(privateRace); } catch (error) { $('#feedStatus').textContent = `Card loaded; detailed form unavailable: ${error.message}`; }
    }
    if (requestId !== state.requestId) return;
    state.analysis = { raceId: state.race, model: window.FormLinePredictions.analyse(privateRace) };
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.analysis = { raceId: state.race, model: { status: 'feed-error', reason: error.message } };
    $('#feedStatus').textContent = error.message;
  } finally { if (requestId === state.requestId) { state.loadingRace = ''; renderBoard(); renderAnalysis(); } }
}
function selectDate(date) {
  if (!todayPlusRange(date)) return;
  state.requestId++; state.date = date; state.meeting = ''; state.race = ''; state.analysis = null;
  const first = mergedMeetings()[0]; if (first) state.meeting = meetingId(first);
  renderBoard(); renderAnalysis();
  if (first?.meeting_id) loadQueenslandCard(first).catch(() => {});
}
function selectMeeting(id) {
  if (!mergedMeetings().some(row => meetingId(row) === id)) return;
  state.requestId++; state.meeting = id; state.race = ''; state.analysis = null; renderBoard(); renderAnalysis();
  const meeting = selectedMeeting();
  if (meeting?.meeting_id && !state.qldCards.has(id)) loadQueenslandCard(meeting).catch(error => { $('#raceList').insertAdjacentHTML('beforeend', `<p class="analysis-state warning">${esc(error.message)}</p>`); });
}
function selectRace(id) {
  const meeting = selectedMeeting(); if (!meeting?.races.some(row => raceId(row, meeting) === id)) return;
  state.race = id; state.analysis = null; renderBoard(); analyseSelectedRace(); $('#analysis').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#menuToggle').addEventListener('click', () => { const open = !document.body.classList.contains('menu-open'); document.body.classList.toggle('menu-open', open); $('#menuToggle').setAttribute('aria-expanded', String(open)); $('#appSidebar').inert = !open; });
$('#menuScrim').addEventListener('click', () => { document.body.classList.remove('menu-open'); $('#menuToggle').setAttribute('aria-expanded', 'false'); $('#appSidebar').inert = true; });
$('#appSidebar nav').addEventListener('click', () => { document.body.classList.remove('menu-open'); $('#menuToggle').setAttribute('aria-expanded', 'false'); $('#appSidebar').inert = true; });
$('#appSidebar').inert = matchMedia('(max-width:700px)').matches;
matchMedia('(max-width:700px)').addEventListener('change', event => { $('#appSidebar').inert = event.matches; document.body.classList.remove('menu-open'); $('#menuToggle').setAttribute('aria-expanded', 'false'); });
document.addEventListener('click', event => {
  const date = event.target.closest('[data-date]'); if (date) { selectDate(date.dataset.date); return; }
  const meeting = event.target.closest('[data-meeting-id]'); if (meeting) { selectMeeting(meeting.dataset.meetingId); return; }
  const race = event.target.closest('[data-race-id]'); if (race) { selectRace(race.dataset.raceId); return; }
  if (event.target.id === 'refreshRace') { analyseSelectedRace(true); return; }
  if (event.target.id === 'loadQldCard') { const row = selectedMeeting(); if (row) loadQueenslandCard(row).catch(error => { $('#raceList').insertAdjacentHTML('beforeend', `<p class="analysis-state warning">${esc(error.message)}</p>`); }); }
});
document.addEventListener('change', event => { if (event.target.id === 'scenarioFilter') filterProposals(); });
$('#feedForm').addEventListener('submit', async event => {
  event.preventDefault();
  const code = $('#feedCode').value.trim();
  if (code) { state.code = code; try { sessionStorage.setItem(CODE_KEY, code); } catch { /* Session only. */ } }
  const button = $('#feedForm button'); button.disabled = true; $('#feedStatus').textContent = 'Checking protected card…';
  try { await loadPrivateCard(state.date, true); const first = mergedMeetings()[0]; if (!state.meeting && first) state.meeting = meetingId(first); renderBoard(); $('#feedStatus').textContent += ' · Select a race to analyse.'; }
  catch (error) { $('#feedStatus').textContent = error.message; }
  finally { button.disabled = false; }
});
(async function init() {
  state.date = dayAt(0); state.savedMeetings = savedMeetings();
  $('#todayTag').textContent = dateLabel(state.date, { weekday: 'long' }).toUpperCase();
  $('#feedStatus').textContent = state.code ? 'Access code saved for this browser session · no request made' : 'No private request made';
  const results = await Promise.allSettled([
    fetch('data/upcoming-races-2026-11-05.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(Error('Public schedule unavailable'))),
    fetch('/api/schedule', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(Error('Queensland feed unavailable')))
  ]);
  const fixture = results[0].status === 'fulfilled' ? results[0].value : null;
  const queensland = results[1].status === 'fulfilled' ? results[1].value : null;
  state.publicMeetings = normalisePublic([...(fixture?.meetings || []), ...(queensland?.meetings || [])]);
  const first = mergedMeetings()[0]; if (first) state.meeting = meetingId(first);
  scheduleNote(`${state.publicMeetings.length} listed meeting${state.publicMeetings.length === 1 ? '' : 's'} in the next seven days · selected NSW/VIC cards${queensland ? ' + live Queensland schedule' : ''}.`);
  renderBoard(); renderAnalysis();
  const meeting = selectedMeeting();
  if (meeting?.meeting_id) loadQueenslandCard(meeting).catch(() => {});
}()).catch(error => { scheduleNote(error.message); renderBoard(); });

'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { key: '', date: '', meetings: [], meetingIndex: -1, raceIndex: -1, odds: new Map(), form: new Map(), results: new Map(), busy: false, requestId: 0 };
  const venueKey = () => `${state.date}|${selectedMeeting()?.venue || ''}`;
  const raceKey = () => `${venueKey()}|${selectedRace()?.number || ''}`;
  const selectedMeeting = () => state.meetings[state.meetingIndex];
  const selectedRace = () => selectedMeeting()?.races[state.raceIndex];

  function sydneyDate(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function dayAt(offset) { return sydneyDate(new Date(Date.now() + offset * 86400000)); }
  function dateLabel(date) { return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00+11:00`)); }
  function timeLabel(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Time TBC';
    return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));
  }
  function stampLabel(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'time unknown';
    return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));
  }
  function status(message, error = false) { const node = $('#peStatus'); node.textContent = message; node.dataset.state = error ? 'error' : 'ready'; }
  function setBusy(busy) { state.busy = busy; $('#peForm button[type="submit"]').disabled = busy; }
  function price(value) { const number = Number(value); return Number.isFinite(number) && number > 1 ? `$${number.toFixed(2)}` : '—'; }
  function text(value, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : String(value); }
  function runnerMatch(a, b) { return Number(a.number) === Number(b.number) && String(a.name || a.runner_name || '').toLowerCase() === String(b.name || b.runner_name || '').toLowerCase(); }

  async function personalApi(action, params = {}) {
    if (!state.key) throw Error('Enter your personal PuntersEdge API key to load Sydney data.');
    const url = new URL('/api/puntersedge', location.href);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: { 'X-PuntersEdge-API-Key': state.key, Accept: 'application/json' }, cache: 'no-store' });
    let body;
    try { body = await response.json(); } catch { throw Error('The personal data connection returned an unreadable response.'); }
    if (!response.ok) throw Error(body?.error || `Personal data request failed (HTTP ${response.status}).`);
    return body;
  }

  function renderMeetings() {
    $('#peMeetingTabs').innerHTML = state.meetings.length ? state.meetings.map((meeting, index) => `<button type="button" data-pe-meeting="${index}" aria-pressed="${index === state.meetingIndex}"><strong>${esc(meeting.venue)}</strong><small>${meeting.races?.length || 0} race${meeting.races?.length === 1 ? '' : 's'} · ${esc(meeting.track?.track_condition || 'Ground TBC')}</small></button>`).join('') : `<p class="pe-empty">${state.date ? 'No Sydney metropolitan meeting is in this acceptance card. Try another date.' : 'Load a card to see available Sydney meetings.'}</p>`;
  }
  function renderRaces() {
    const meeting = selectedMeeting();
    $('#peRaceTabs').innerHTML = meeting?.races?.length ? meeting.races.map((race, index) => `<button type="button" data-pe-race="${index}" aria-pressed="${index === state.raceIndex}"><strong>R${esc(race.number)}</strong><small>${esc(race.name || `Race ${race.number}`)}</small></button>`).join('') : '';
  }
  function formForRunner(runner) {
    const card = state.form.get(raceKey());
    return card?.runners?.find(item => runnerMatch(item, runner)) || null;
  }
  function oddsForRunner(runner) {
    const card = state.odds.get(venueKey());
    const race = card?.races?.find(item => Number(item.number) === Number(selectedRace()?.number));
    return race?.runners?.find(item => runnerMatch(item, runner)) || null;
  }
  function resultForRace() {
    const card = state.results.get(venueKey());
    return card?.results?.find(item => Number(item.number ?? item.race_number) === Number(selectedRace()?.number)) || null;
  }
  function runHistory(form) {
    if (!form) return '<p>Load form history for this race to see prior runs and ground conditions.</p>';
    const stats = form.stats || {};
    const runs = Array.isArray(form.runs) ? form.runs : [];
    const placed = [1, 2, 3].map(position => runs.filter(run => Number(run.position) === position).length);
    const summary = `<p class="pe-form-summary">Held starts ${esc(text(stats.starts, '0'))} · wins ${esc(text(stats.wins, '0'))} · places ${esc(text(stats.places, '0'))}. In the ${runs.length} recent rows shown: ${placed.join('-')} wins-seconds-thirds. These are not necessarily career totals.</p>`;
    if (!runs.length) return `${summary}<p>No earlier runs held.</p>`;
    return `${summary}<div class="pe-history">${runs.map(run => `<div><strong>${esc(text(run.date))} · ${esc(text(run.venue))}</strong><span>${esc(run.distance_m ? `${run.distance_m}m · ` : '')}${esc(text(run.track_condition, 'Ground TBC'))} · ${esc(run.position ? `Finished ${run.position}` : text(run.status, 'Result TBC'))}${run.barrier ? ` · gate ${esc(run.barrier)}` : ''}${run.weight_kg ? ` · ${esc(run.weight_kg)}kg` : ''}</span></div>`).join('')}</div>`;
  }
  function runnerHtml(runner) {
    const odds = oddsForRunner(runner), form = formForRunner(runner);
    const scratched = runner.scratched === true, emergency = runner.emergency === true;
    const label = scratched ? 'SCRATCHED' : emergency ? 'EMERGENCY' : runner.scratched === null ? 'SCRATCHING STATUS UNCONFIRMED' : '';
    const quotes = odds ? `<div class="pe-odds"><span>Win <strong>${price(odds.win_price)}</strong></span><span>Place <strong>${price(odds.place_price)}</strong></span><span>Top 3 <strong>${price(odds.top3_price)}</strong></span><span>Top 4 <strong>${price(odds.top4_price)}</strong></span></div><small>${odds.stale ? 'Quote marked stale · ' : ''}Quote observed ${esc(timeLabel(odds.last_update))}</small>` : '<small>Odds not loaded or not available yet.</small>';
    return `<details class="pe-runner ${scratched ? 'scratched' : ''}"><summary><span class="pe-number">#${esc(text(runner.number))}</span><span class="pe-horse"><strong>${esc(text(runner.name))}</strong><small>${esc(text(runner.last10, 'Form —'))}${label ? ` · ${esc(label)}` : ''}</small></span><span class="pe-draw">Gate ${esc(text(runner.barrier))}</span><span class="pe-weight">${runner.weight_kg ? `${esc(runner.weight_kg)}kg` : 'Weight TBC'}</span></summary><div class="pe-runner-body"><p>Jockey: <strong>${esc(text(runner.jockey, 'TBC'))}</strong> · Trainer: <strong>${esc(text(runner.trainer, 'TBC'))}</strong></p>${runner.last_start_date ? `<p>Last start: ${esc(runner.last_start_date)} · ${runner.last_start_position ? `finished ${esc(runner.last_start_position)}` : 'finish unreported'}</p>` : ''}${quotes}${runHistory(form)}</div></details>`;
  }
  function renderDetail() {
    const meeting = selectedMeeting(), race = selectedRace();
    if (!meeting || !race) { $('#peDetail').innerHTML = '<div class="pe-empty">Choose a Sydney meeting and race to inspect its field.</div>'; return; }
    const runners = Array.isArray(race.runners) ? race.runners : [];
    const result = resultForRace();
    const placements = Array.isArray(result?.placings) && result.placings.length ? result.placings : result?.runners;
    const finishers = Array.isArray(placements) ? placements.filter(row => Number(row.position) > 0).sort((a, b) => Number(a.position) - Number(b.position)).slice(0, 4) : [];
    $('#peDetail').innerHTML = `<div class="pe-race-head"><div><p class="eyebrow">${esc(meeting.venue)} · R${esc(race.number)} · ${esc(dateLabel(state.date))}</p><h3>${esc(text(race.name, `Race ${race.number}`))}</h3><p>${esc(text(race.start_time_local, 'Time TBC'))} Sydney time · ${race.distance_m ? `${esc(race.distance_m)}m · ` : ''}${esc(text(race.race_class, 'Class TBC'))}</p></div><span class="pe-field-count">${runners.length} accepted</span></div><div class="pe-facts"><span>${esc(text(meeting.track?.track_condition, 'Ground TBC'))}</span>${meeting.track?.rail ? `<span>Rail ${esc(meeting.track.rail)}</span>` : ''}${meeting.track?.weather ? `<span>${esc(meeting.track.weather)}</span>` : ''}<span>${esc(text(race.runner_set_status, 'Field status unknown').replaceAll('_', ' '))}</span></div><div class="pe-actions"><button type="button" data-pe-action="odds">Check current odds · 4 credits</button><button type="button" data-pe-action="form">Load form history · 3 credits</button><button type="button" data-pe-action="results">Check results · 2 credits</button></div><p class="pe-note">Odds may move; the bookmaker’s actual quote controls. Form and results are recorded snapshots. Verify scratchings and final placings at the official source.</p>${finishers.length ? `<div class="pe-results"><strong>${esc(text(result.status, 'Reported result'))}</strong><p>${finishers.map(row => `${esc(row.position)}. ${esc(text(row.name || row.runner_name))}`).join(' · ')}</p></div>` : ''}<div class="pe-runner-list">${runners.length ? runners.map(runnerHtml).join('') : '<p class="pe-empty">This meeting has no accepted runners in the current card.</p>'}</div><p class="pe-provider-credit">Personal data from <a href="https://puntersedge.online/" target="_blank" rel="noopener noreferrer">PuntersEdge ↗</a>. This view is for the key holder only.</p>`;
  }
  function renderAll() { renderMeetings(); renderRaces(); renderDetail(); }

  async function loadCard() {
    if (state.busy) return;
    const input = $('#peKey');
    if (input.value.trim()) state.key = input.value.trim();
    input.value = '';
    if (!state.key) { status('Enter your personal PuntersEdge API key to load Sydney data.', true); return; }
    const date = $('#peDate').value;
    if (date < dayAt(0) || date > dayAt(3)) { status('Choose today or one of the next three Sydney dates.', true); return; }
    const requestId = ++state.requestId;
    setBusy(true); status(`Loading Sydney acceptances for ${dateLabel(date)}…`);
    try {
      const data = await personalApi('card', { date });
      if (requestId !== state.requestId) return;
      state.date = date; state.meetings = Array.isArray(data.meetings) ? data.meetings : [];
      state.meetingIndex = state.meetings.length ? 0 : -1; state.raceIndex = state.meetings[0]?.races?.length ? 0 : -1;
      state.odds.clear(); state.form.clear(); state.results.clear(); renderAll();
      status(state.meetings.length ? `${state.meetings.length} Sydney meeting${state.meetings.length === 1 ? '' : 's'} loaded · acceptance read ${stampLabel(data.as_of)} · ${text(data.usage?.credits_remaining, '—')} credits before this request.` : `No Sydney metro meeting published for ${dateLabel(date)}. Try another date.`);
    } catch (error) { if (requestId === state.requestId) status(error.message, true); }
    finally { if (requestId === state.requestId) setBusy(false); }
  }
  async function loadExtra(action) {
    if (state.busy || !selectedRace()) return;
    const requestId = state.requestId;
    const venue = selectedMeeting().venue, raceNumber = selectedRace().number;
    setBusy(true); status(`Checking ${action} for ${selectedMeeting().venue} R${selectedRace().number}…`);
    const key = action === 'form' ? raceKey() : venueKey();
    const params = { date: state.date, venue: selectedMeeting().provider_venue || venue };
    if (action === 'form') params.race_number = raceNumber;
    try {
      const data = await personalApi(action, params);
      if (requestId !== state.requestId) return;
      state[action].set(key, data);
      renderDetail();
      status(`${action === 'odds' ? 'Odds' : action === 'form' ? 'Form history' : 'Results'} checked for ${venue} · ${text(data.usage?.credits_remaining, '—')} credits before this request.`);
    } catch (error) { if (requestId === state.requestId) status(error.message, true); }
    finally { if (requestId === state.requestId) setBusy(false); }
  }
  function forget() {
    state.requestId++; state.key = ''; state.date = ''; state.meetings = []; state.meetingIndex = -1; state.raceIndex = -1;
    state.odds.clear(); state.form.clear(); state.results.clear(); $('#peKey').value = ''; setBusy(false); renderAll();
    status('Personal key and race data cleared from this tab.');
  }

  $('#peDate').min = dayAt(0); $('#peDate').max = dayAt(3); $('#peDate').value = dayAt(0);
  $('#peForm').addEventListener('submit', event => { event.preventDefault(); loadCard(); });
  $('#peForget').addEventListener('click', forget);
  $('#peMeetingTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-pe-meeting]'); if (!button) return;
    state.requestId++;
    state.meetingIndex = Number(button.dataset.peMeeting); state.raceIndex = selectedMeeting()?.races?.length ? 0 : -1; renderAll();
  });
  $('#peRaceTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-pe-race]'); if (!button) return;
    state.requestId++;
    state.raceIndex = Number(button.dataset.peRace); renderAll();
  });
  $('#peDetail').addEventListener('click', event => {
    const button = event.target.closest('[data-pe-action]'); if (button) loadExtra(button.dataset.peAction);
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-pe-date]');
    if (link && link.dataset.peDate >= dayAt(0) && link.dataset.peDate <= dayAt(3)) $('#peDate').value = link.dataset.peDate;
  });
  renderAll();
})();

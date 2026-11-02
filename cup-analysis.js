'use strict';

const el = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let historyData;
let forecastData;
let cupCard;
let activeScenario = 'balanced';

function sourceLink(url, label) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    const host = parsed.hostname.replace(/^www\./, '').replace(/^vrc-prod-cdn-[^.]+\./, '');
    const display = label || host;
    return `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(display)} ↗</a>`;
  } catch { return ''; }
}

function sources(urls, max = 3) {
  return `<div class="source-links">${[...new Set(urls || [])].slice(0, max).map(url => sourceLink(url)).join('')}</div>`;
}

function styleGroup(row) {
  const value = String(row.run_style || '').toLowerCase();
  if (/unverified|not verified|unclear|inferred|expected/.test(value) || row.run_style_basis === 'pre-race expectation') return 'unclear';
  if (/midfield|mid-field|covered/.test(value)) return 'midfield';
  if (/backmarker|back half|back-half|off pace|from the back|near rear|late closer/.test(value)) return 'back';
  if (/leader|on pace|on-pace|forward|prominent|handy/.test(value)) return 'leader';
  return 'unclear';
}

function renderStats() {
  const rows = historyData.years.flatMap(year => year.top4);
  const winners = rows.filter(row => row.place === 1);
  const winnerWeights = winners.map(row => Number(row.weight_kg));
  const winnerGates = winners.map(row => Number(row.barrier));
  const inside = winners.filter(row => row.barrier <= 6).length;
  el('history-stats').innerHTML = `
    <div class="history-stat"><strong>${historyData.years.length}</strong><span>Modern Cup renewals checked, 2011–2025</span></div>
    <div class="history-stat"><strong>${rows.length}</strong><span>Top-four profiles with gate, listed kg, rider and race role</span></div>
    <div class="history-stat"><strong>${inside} / ${winners.length}</strong><span>Winners from stalls 1–6; the others started wider</span></div>`;
  const bands = [[1,6],[7,12],[13,18],[19,24]];
  const counts = bands.map(([lo,hi]) => ({ label: `${lo}–${hi}`, all: rows.filter(row => row.barrier >= lo && row.barrier <= hi).length, wins: winners.filter(row => row.barrier >= lo && row.barrier <= hi).length }));
  const max = Math.max(...counts.map(item => item.all));
  el('gate-chart').innerHTML = `<h3>Where the top four started</h3><p>Counts across 15 Cups · effective starting stall · darker segment marks winners</p>${counts.map(item => `<div class="gate-bar-row"><span>Gate ${item.label}</span><div class="gate-track" role="img" aria-label="Gates ${item.label}: ${item.all} top-four finishers, ${item.wins} winners"><div class="gate-fill" style="width:${Math.round(item.all/max*100)}%"><span class="winner-fill" style="width:${Math.round(item.wins/item.all*100)}%"></span></div></div><strong>${item.all} / ${item.wins} W</strong></div>`).join('')}<div class="chart-legend"><span><i></i>Winners</span><span><i></i>Other top-four runners</span><span>Winner weights: ${Math.min(...winnerWeights)}–${Math.max(...winnerWeights)}kg; gates: ${Math.min(...winnerGates)}–${Math.max(...winnerGates)}</span></div>`;
}

function runnerCard(row) {
  const note = row.run_style_basis && row.run_style_basis !== 'observed' ? `<p><strong>Role basis:</strong> ${escapeHtml(row.run_style_basis)}</p>` : '';
  return `<article class="history-runner"><div class="history-runner-head"><span>${row.place}</span><h4>${escapeHtml(row.horse)}</h4></div><div class="history-runner-meta"><span>Gate ${escapeHtml(row.barrier)}</span><span>Listed ${escapeHtml(row.weight_kg)}kg</span><span>${escapeHtml(row.jockey)}</span></div><p><strong>In this Cup:</strong> ${escapeHtml(row.run_style)}</p>${note}<p><strong>Lead-up:</strong> ${escapeHtml(row.history)}</p><p><strong>Why the placing makes sense:</strong> ${escapeHtml(row.why)}</p>${sources(row.source_urls)}</article>`;
}

function renderHistory() {
  const yearValue = el('history-year').value;
  const styleValue = el('history-style').value;
  const descending = [...historyData.years].reverse();
  const items = descending.map(year => {
    if (yearValue !== 'all' && Number(yearValue) !== year.year) return '';
    const runners = styleValue === 'all' ? year.top4 : year.top4.filter(row => styleGroup(row) === styleValue);
    if (!runners.length) return '';
    return `<details class="history-year" ${year.year === 2025 || yearValue !== 'all' ? 'open' : ''}><summary><strong>${year.year}</strong><span>${escapeHtml(year.going)} · ${escapeHtml(year.top4[0].horse)} won</span><em>${runners.length} shown</em></summary><div class="history-year-body"><p class="history-story"><strong>How it ran:</strong> ${escapeHtml(year.race_story)}</p><div class="history-top4">${runners.map(runnerCard).join('')}</div>${year.data_note ? `<p class="history-caveat"><strong>Data note:</strong> ${escapeHtml(year.data_note)}</p>` : ''}${sources(year.source_urls || year.story_sources, 4)}</div></details>`;
  }).filter(Boolean);
  el('history-years').innerHTML = items.join('') || '<p class="loading">No top-four runner matches these filters. Choose another year or running position.</p>';
}

function renderForecast() {
  el('forecast-cards').innerHTML = forecastData.top4.map(item => `<article class="forecast-card"><div class="forecast-rank" aria-label="Forecast place ${item.rank}">${item.rank}</div><div><h3>#${item.number} ${escapeHtml(item.horse)}</h3><div class="runner-line"><span>Gate ${item.barrier}</span><span>${item.weight_kg}kg</span><span>${escapeHtml(item.jockey)}</span><span>${escapeHtml(item.style)}</span></div><p><strong>Recent form:</strong> ${escapeHtml(item.recent_form)}</p><p class="forecast-case"><strong>Why here:</strong> ${escapeHtml(item.case)}</p><p class="forecast-risk"><strong>What could undo it:</strong> ${escapeHtml(item.risk)}</p><p class="forecast-lens"><strong>History lens:</strong> ${escapeHtml(item.historical_lens)}</p>${sources(item.sources)}</div></article>`).join('');
  el('forecast-alternatives').innerHTML = `<strong>Close alternatives</strong>${forecastData.next_two.map(item => `<p><b>#${item.number} ${escapeHtml(item.horse)}:</b> ${escapeHtml(item.note)}</p>`).join('')}`;
  el('scenario-tabs').innerHTML = forecastData.scenarios.map(item => `<button type="button" role="tab" id="scenario-${escapeHtml(item.id)}" aria-controls="scenario-panel" aria-selected="${item.id === activeScenario}" class="${item.id === activeScenario ? 'active' : ''}" data-scenario="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join('');
  renderScenario();
  el('forecast-logic').innerHTML = `<li><strong>Trip and likely position:</strong> Gate 9 suits Point Of Law's forward style; gate 18 is workable for Trustyourinstinct only if he finds cover. Inner gates can also create a traffic problem for a closer.</li><li><strong>Staying form:</strong> Hopewell Rock and Trustyourinstinct have strong 2816m evidence. Shockletz has a 2500m Flemington win, so her extra 700m remains a genuine uncertainty.</li><li><strong>Handicap and rider:</strong> The top four span 51–57kg. The best 15-year winners span 51–57.5kg; that range alone cannot rank them. McDonald's 2021 Cup win adds experience, while Coffey's clearance is a dated update.</li><li><strong>Race shape:</strong> Several forward types could make the early pace firm. A slower first half would give the on-pace runners more control. Revisit the order after the official going and any scratches.</li>`;
}

function renderScenario() {
  const item = forecastData.scenarios.find(row => row.id === activeScenario) || forecastData.scenarios[0];
  el('scenario-panel').textContent = item.summary;
  for (const button of el('scenario-tabs').querySelectorAll('[role="tab"]')) {
    const active = button.dataset.scenario === item.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  el('scenario-panel').setAttribute('aria-labelledby', `scenario-${item.id}`);
}

function renderField() {
  const selections = new Map(forecastData.top4.map(item => [item.number, item.rank]));
  const rows = cupCard.cup_profiles.map(item => `<tr class="${selections.has(item.number) ? 'forecast-row' : ''}"><td>${item.number}</td><td>${escapeHtml(item.horse)}${selections.has(item.number) ? ` · forecast ${selections.get(item.number)}` : ''}</td><td>${escapeHtml(item.barrier)}</td><td>${escapeHtml(item.weight_kg)}</td><td>${escapeHtml(item.jockey)}</td><td>${escapeHtml(forecastData.style_signals[String(item.number)] || 'Unclear')}</td><td>${escapeHtml(item.last10 || '—')}</td><td>${escapeHtml(item.case)}</td></tr>`).join('');
  el('field-table').innerHTML = `<table class="field-table"><caption class="sr-only">2026 Melbourne Cup 24-runner field with barrier, weight, jockey, recent running position and form</caption><thead><tr><th scope="col">No.</th><th scope="col">Horse</th><th scope="col">Gate</th><th scope="col">kg</th><th scope="col">Jockey</th><th scope="col">Recent pace signal</th><th scope="col">Last 10</th><th scope="col">Form case</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function setMenu(open, returnFocus = false) {
  const mobile = matchMedia('(max-width:700px)').matches;
  const active = !!open && mobile;
  document.body.classList.toggle('menu-open', active);
  el('analysisMenuToggle').setAttribute('aria-expanded', String(active));
  el('analysisSidebar').inert = mobile && !active;
  if (active) document.querySelector('#analysisSidebar nav a')?.focus();
  else if (returnFocus) el('analysisMenuToggle').focus();
}

el('analysisMenuToggle').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open'), true));
el('analysisMenuScrim').addEventListener('click', () => setMenu(false, true));
el('analysisSidebar').addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
matchMedia('(max-width:700px)').addEventListener('change', () => setMenu(false));
setMenu(false);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false, true);
  const tab = event.target.closest('#scenario-tabs [role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !forecastData) return;
  const current = forecastData.scenarios.findIndex(item => item.id === tab.dataset.scenario);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? forecastData.scenarios.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + forecastData.scenarios.length) % forecastData.scenarios.length;
  event.preventDefault(); activeScenario = forecastData.scenarios[next].id; renderScenario(); el(`scenario-${activeScenario}`).focus();
});
el('scenario-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-scenario]');
  if (button) { activeScenario = button.dataset.scenario; renderScenario(); }
});
el('history-year').addEventListener('change', renderHistory);
el('history-style').addEventListener('change', renderHistory);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

Promise.allSettled([
  fetch('melbourne-cup-history-2011-2025.json', {cache:'no-store'}).then(response => { if (!response.ok) throw Error('Historical results unavailable'); return response.json(); }),
  fetch('cup-forecast-2026.json', {cache:'no-store'}).then(response => { if (!response.ok) throw Error('Forecast unavailable'); return response.json(); }),
  fetch('melbourne-cup-2026.json', {cache:'no-store'}).then(response => { if (!response.ok) throw Error('2026 field unavailable'); return response.json(); })
]).then(results => {
  if (results[0].status === 'fulfilled' && results[0].value.years?.length === 15) {
    historyData = results[0].value;
    el('history-year').innerHTML += [...historyData.years].reverse().map(item => `<option value="${item.year}">${item.year}</option>`).join('');
    renderStats(); renderHistory();
  } else el('history-years').innerHTML = '<p class="loading">Historical results could not load. Reload to try again.</p>';
  if (results[1].status === 'fulfilled' && results[1].value.top4?.length === 4) {
    forecastData = results[1].value;
    renderForecast();
  } else el('forecast-cards').innerHTML = '<p class="loading">Forecast could not load. Reload to try again.</p>';
  if (results[2].status === 'fulfilled' && results[2].value.cup_profiles?.length === 24) cupCard = results[2].value;
  if (forecastData && cupCard) renderField();
  else el('field-table').innerHTML = '<p class="loading">Declared field could not load. Reload to try again.</p>';
});

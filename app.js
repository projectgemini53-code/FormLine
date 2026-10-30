'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let research;
let selectedRace = 1;
let selectedRank = 1;

function safeSource(id) {
  const source = research.sources[id];
  if (!source) return '';
  const url = source.url;
  const allowed = /^https:\/\/(?:www|mdata)\.racingnsw\.com\.au\//.test(url);
  if (!allowed) return '';
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} <span aria-hidden="true">↗</span></a>`;
}
function sources(ids) { return [...new Set(ids || [])].map(safeSource).filter(Boolean).join(''); }
function ranked(race) {
  const picks=race.ranked||[];if(!picks.length)return '';
  const chosen=picks.find(item=>item.place===selectedRank)||picks[0];
  return `<section class="rankings"><div class="rankings-heading"><p class="eyebrow">RESEARCH ORDER · PROVISIONAL</p><h3>First, second and third</h3><p>Select a horse to see the public form behind the order and what may change it.</p></div><div class="rank-cards">${picks.map(item=>`<button type="button" class="rank-card ${item.place===chosen.place?'active':''}" data-rank="${item.place}" aria-pressed="${item.place===chosen.place}"><small>${['','1ST','2ND','3RD'][item.place]}</small><strong>#${esc(item.number)} ${esc(item.horse)}</strong><span>View reasoning →</span></button>`).join('')}</div><div class="rank-detail"><p class="eyebrow">WHY ${['','FIRST','SECOND','THIRD'][chosen.place]}</p><h4>${esc(chosen.horse)}</h4><p>${esc(chosen.reason)}</p><p><strong>Watch:</strong> ${esc(chosen.watch)}</p><div class="source-links">${sources(chosen.sources)}</div></div><p class="rank-disclaimer">This is a provisional form ranking, not a guarantee of the finishing order or a value bet. Check final scratchings, track and odds.</p></section>`;
}

function render() {
  const race = research.races.find(item => item.number === selectedRace) || research.races[0];
  $('#snapshot-date').textContent = `Prepared ${research.prepared_at} AEDT`;
  $('#track-snapshot').textContent = research.track_snapshot;
  $('#track-time').textContent = `Official report checked ${research.track_checked_at || research.prepared_at}`;
  $('#method-copy').innerHTML = `<p>${esc(research.method_note)}</p><p>${esc(research.coverage_note)}</p>`;
  $('#race-tabs').innerHTML = research.races.map(item => `<button type="button" role="tab" id="race-tab-${item.number}" aria-controls="race-panel" aria-selected="${item.number === race.number}" tabindex="${item.number === race.number ? 0 : -1}" class="race-tab ${item.number === race.number ? 'active' : ''}" data-race="${item.number}"><strong>R${item.number}</strong><span>${esc(item.time)}</span><small>${esc(item.name)}</small></button>`).join('');
  $('#race-index-list').innerHTML = research.races.map(item => `<button type="button" class="index-row ${item.number === race.number ? 'active' : ''}" data-race="${item.number}" ${item.number === race.number ? 'aria-current="true"' : ''}><span>R${item.number}</span><span><strong>${esc(item.lean)}</strong><small>${esc(item.name)}</small></span><span aria-hidden="true">↗</span></button>`).join('');
  $('#race-panel').setAttribute('aria-labelledby', `race-tab-${race.number}`);
  $('#race-panel').innerHTML = `<div class="race-heading"><p class="eyebrow">RACE ${race.number} · ${esc(race.time)} AEDT</p><h2>${esc(race.name)}</h2><div class="fact-list"><span>${esc(race.distance_m)}m</span><span>${esc(race.grade)}</span><span>${esc(race.feed)}</span></div></div>
    <div class="lean"><p class="eyebrow">RESEARCH LEAN · #${esc(race.lean_number)}</p><h3>${esc(race.lean)}</h3><p>${esc(race.thesis)}</p></div>
    ${ranked(race)}
    <section class="evidence"><h3>Why this horse is in focus</h3><ol>${race.evidence.map((point, index) => `<li><span class="evidence-number">${String(index + 1).padStart(2, '0')}</span><div><p>${esc(point.text)}</p><div class="source-links">${sources(point.sources)}</div></div></li>`).join('')}</ol></section>
    <div class="assessment-grid"><section><p class="eyebrow">OTHER RUNNERS</p><h3>Who could beat the lean</h3><p>${esc(race.alternatives)}</p></section><section><p class="eyebrow">TRACK SCENARIO</p><h3>If the going changes</h3><p>${esc(race.ground)}</p></section><section><p class="eyebrow">MAIN DOUBT</p><h3>What could go wrong</h3><p>${esc(race.risk)}</p></section></div>
    <div class="before-jump"><div><p class="eyebrow">BEFORE THE JUMP</p><h3>Race-day checks</h3><p>${esc(race.race_day)}</p></div><div><p class="eyebrow">PRICE DISCIPLINE</p><p>No pre-approved bet. Check the final runner, place terms and current quote. A form case alone does not prove value.</p></div></div>
    <div class="references"><h3>Sources for R${race.number}</h3><div class="source-links">${sources(race.source_ids)}</div></div>`;
}

function selectRace(number, focus = true) {
  const parsed = Number(number);
  if (!research?.races.some(item => item.number === parsed)) return;
  selectedRace = parsed;
  selectedRank = 1;
  history.replaceState(null, '', `#race-${parsed}`);
  render();
  if (focus) {
    $(`#race-tab-${parsed}`).focus();
    $('#race-panel').scrollIntoView({behavior:'smooth', block:'start'});
  }
}

document.addEventListener('click', event => {
  const rank=event.target.closest('[data-rank]');
  if(rank){selectedRank=Number(rank.dataset.rank);const y=window.scrollY;render();window.scrollTo(0,y);$(`[data-rank="${selectedRank}"]`)?.focus({preventScroll:true});return;}
  const button = event.target.closest('[data-race]');
  if (button) selectRace(button.dataset.race);
});
document.addEventListener('keydown', event => {
  const current = event.target.closest('#race-tabs [role="tab"]');
  if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const index = Number(current.dataset.race) - 1;
  const next = event.key === 'Home' ? 1 : event.key === 'End' ? 10 : ((index + (event.key === 'ArrowRight' ? 1 : -1) + 10) % 10) + 1;
  event.preventDefault();
  selectRace(next, false);
  $(`#race-tab-${next}`).focus();
});

fetch('golden-eagle-2026.json', {cache:'no-store'})
  .then(response => { if (!response.ok) throw Error('Research file unavailable'); return response.json(); })
  .then(data => {
    if (!Array.isArray(data.races) || data.races.length !== 10) throw Error('The race card is incomplete');
    research = data;
    const match = location.hash.match(/^#race-(10|[1-9])$/);
    selectedRace = match ? Number(match[1]) : 1;
    render();
  })
  .catch(error => { $('#race-panel').innerHTML = `<div class="loading">${esc(error.message)}. Reload the page to try again.</div>`; });

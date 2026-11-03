'use strict';

// Frozen pre-race sensitivity study. Factor grades are editorial readings of
// the linked form, not measured win probabilities or a fitted betting model.
const lineupSources = {
  vrc: 'https://www.vrc.com.au/latest-news/every-runner-in-the-2026-lexus-melbourne-cup/',
  field: 'https://www.vrc.com.au/latest-news/lexus-melbourne-cup-field-and-barriers-announced-for-166th-running/',
  wetMonaco: 'https://www.racing.com/news/2026/10/03/news-review-Flemington-Mr-Monaco-031026',
  wetBraddock: 'https://www.racing.com/news/2026/11/02/news-tipping-melbourne-cup-runner-by-runner',
  fastGoodie: 'https://www.vrc.com.au/latest-news/quick-look-at-the-2026-lexus-melbourne-cup-contenders/',
  trackSnapshot: 'https://www.racingqueensland.com.au/racing/profiles/track/thoroughbred/flem',
  trackLatest: 'https://www.vrc.com.au/track-and-weather-conditions/'
};
const lineupCandidates = [
  { no: 1, horse: 'Sons And Lovers', gate: 3, kg: 57.5, form: 4, staying: 5, map: 4, wet: 1, pace: 1, cupRider: 0, formNote: '3000m Red Sea Turf win and strong Group form; the VRC review says he handles varied ground.', rainNote: 'All-ground evidence is positive, though not a guaranteed Soft-track advantage.', risk: 'Highest weight in this shortlist and no Flemington start.', sources: ['vrc'] },
  { no: 2, horse: 'Trustyourinstinct', gate: 18, kg: 57, form: 4, staying: 4, map: 2, wet: 0, pace: 3, cupRider: 1, formNote: '2816m Curragh Cup win and Irish St Leger fourth; James McDonald won the 2021 Cup.', rainNote: 'No clear Soft-track adjustment established from the cited Cup previews.', risk: 'Gate 18, 57kg and a first 3200m flat test.', sources: ['vrc'] },
  { no: 4, horse: 'Middle Earth', gate: 1, kg: 56.5, form: 3, staying: 5, map: 1, wet: 0, pace: 2, cupRider: 1, formNote: 'Third in the 2025 Cup; Mark Zahra has two Cup wins.', rainNote: 'No robust wet-ground adjustment in the cited runner review.', risk: 'An inside draw may trap a settling horse; 56.5kg.', sources: ['vrc'] },
  { no: 10, horse: 'Goodie Two Shoes', gate: 19, kg: 55, form: 3, staying: 5, map: 2, wet: -2, pace: 1, cupRider: 0, formNote: 'Second in the 2025 Cup and a 2816m Goodwood winner this year.', rainNote: 'Joseph O’Brien described her as a fast-ground horse; rain is a concern, not proof of failure.', risk: 'Higher weight than in last year’s Cup and wide gate.', sources: ['vrc', 'fastGoodie'] },
  { no: 11, horse: 'Juja Kibo', gate: 14, kg: 55, form: 5, staying: 2, map: 3, wet: 0, pace: 2, cupRider: 0, formNote: 'Won The Metropolitan and Moonee Valley Gold Cup this campaign.', rainNote: 'No clear Soft-track edge established from the cited runner review.', risk: 'Previous Sydney Cup run raises a 3200m stamina question.', sources: ['vrc'] },
  { no: 12, horse: 'Hopewell Rock', gate: 15, kg: 54.5, form: 4, staying: 4, map: 3, wet: 0, pace: 2, cupRider: 0, formNote: 'Won over 2816m at Goodwood, then narrowly missed in the Ebor.', rainNote: 'Ground response at Flemington is untested; neutral adjustment reflects uncertainty.', risk: 'First Australian start and no 3200m run.', sources: ['vrc'] },
  { no: 14, horse: 'Soul Of Spain', gate: 5, kg: 54.5, form: 3, staying: 5, map: 2, wet: 0, pace: 2, cupRider: 0, formNote: 'Second in the 2026 Sydney Cup over 3200m.', rainNote: 'No verified Soft-track preference used by this score.', risk: 'Recent Caulfield Cup finish and race-class question.', sources: ['vrc'] },
  { no: 16, horse: 'So You Are', gate: 7, kg: 54, form: 5, staying: 2, map: 4, wet: 0, pace: 0, cupRider: 0, formNote: 'Four recent staying wins including the Bendigo Cup; on-pace map from gate 7.', rainNote: 'Ground adjustment left neutral without a decisive cited Soft-track record.', risk: 'First 3200m start.', sources: ['vrc'] },
  { no: 18, horse: 'James J Braddock', gate: 24, kg: 53.5, form: 3, staying: 3, map: 0, wet: 3, pace: 2, cupRider: 1, formNote: 'Third in the Epsom Derby; Craig Williams won the 2019 Cup.', rainNote: 'His Derby placing came in very heavy conditions; Racing.com identifies rain as a possible help.', risk: 'Gate 24 makes a clear, economical trip difficult; 3200m is new.', sources: ['vrc', 'wetBraddock'] },
  { no: 20, horse: 'Point Of Law', gate: 9, kg: 53, form: 5, staying: 3, map: 5, wet: 0, pace: 0, cupRider: 0, formNote: 'Won the Geelong Cup from on pace; gate 9 and 53kg favour an economical map.', rainNote: 'No established rain bonus; the recent Australian win does not settle his wet-ground response.', risk: 'Only five starts and no 3200m race.', sources: ['vrc'] },
  { no: 22, horse: 'Mr Monaco', gate: 16, kg: 52.5, form: 4, staying: 3, map: 2, wet: 2, pace: 1, cupRider: 0, formNote: 'Won the Bart Cummings at Flemington and was third in the Moonee Valley Gold Cup.', rainNote: 'Maher chose wet Flemington ground for his Bart Cummings win; this is the clearest local wet result in the shortlist.', risk: 'Previous Sydney Cup fade and a first Cup ride for Jabez Johnstone.', sources: ['vrc', 'wetMonaco'] },
  { no: 23, horse: 'Zakouma', gate: 10, kg: 52, form: 3, staying: 4, map: 4, wet: 0, pace: 2, cupRider: 0, formNote: 'Won the 2800m Andrew Ramsden at Flemington; gate 10 and 52kg.', rainNote: 'No clear ground bonus used; recent short-trip runs make form comparison harder.', risk: 'No recent 3200m test.', sources: ['vrc'] },
  { no: 24, horse: 'Shockletz', gate: 17, kg: 51, form: 4, staying: 2, map: 2, wet: 0, pace: 3, cupRider: 0, formNote: 'Won the 2500m Archer Stakes at Flemington and has the field’s lowest weight.', rainNote: 'No strong cited Soft-track sample; rain is left neutral rather than assumed helpful.', risk: 'No 3200m performance and needs a suitable tempo from gate 17.', sources: ['vrc'] }
];

const lineupState = { mode: 'main', ground: 'soft5', pace: 'even', forecast: null };
const lineupEscape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const lineupScore = (horse, ground, pace) => {
  const weight = (58 - horse.kg) / 2;
  const groundWeight = { good4: 0, soft5: 2, soft6: 4 }[ground] ?? 2;
  const parts = { form: 3 * horse.form, staying: 3 * horse.staying, map: 2 * horse.map, weight, rider: horse.cupRider, ground: groundWeight * horse.wet, pace: pace === 'strong' ? 2 * horse.pace : 0 };
  return { horse, parts, total: Object.values(parts).reduce((sum, value) => sum + value, 0) };
};
const lineupLinks = keys => [...new Set(keys)].map(key => `<a href="${lineupEscape(lineupSources[key])}" target="_blank" rel="noopener noreferrer">${key === 'wetMonaco' || key === 'wetBraddock' ? 'Wet-track report' : key === 'fastGoodie' ? 'Trainer ground view' : 'Runner review'} ↗</a>`).join('');

function lineupPrimaryHtml() {
  const rows = lineupState.forecast?.top4?.slice(0, 3) || [];
  if (!rows.length) return '<p class="lineup-pending">Loading the published Cup forecast… <a href="cup-analysis.html">Open full Cup analysis ↗</a></p>';
  return `<div class="lineup-cards">${rows.map((row, index) => `<article class="lineup-card"><span class="lineup-rank">${index + 1}</span><div><h4>#${lineupEscape(row.number)} ${lineupEscape(row.horse)}</h4><p class="lineup-facts">Gate ${lineupEscape(row.barrier)} · ${lineupEscape(row.weight_kg)}kg · ${lineupEscape(row.jockey)}</p><p>${lineupEscape(row.case)}</p><p class="lineup-risk"><strong>Watch:</strong> ${lineupEscape(row.risk)}</p></div></article>`).join('')}</div><p class="lineup-method">This is the published editorial order; <a href="cup-analysis.html">read its full evidence and alternatives ↗</a>.</p>`;
}

function lineupAlternativeHtml() {
  const ranked = lineupCandidates.map(horse => lineupScore(horse, lineupState.ground, lineupState.pace)).sort((a, b) => b.total - a.total || a.horse.no - b.horse.no);
  const groundLabel = {
    good4: 'IF the track dries to Good 4 (hypothetical)',
    soft5: 'Soft 5 morning track snapshot',
    soft6: 'IF further rain moves the track to Soft 6 (hypothetical)'
  }[lineupState.ground];
  return `<p class="lineup-scenario"><strong>${groundLabel}</strong> · ${lineupState.pace === 'strong' ? 'strong tempo' : 'even tempo'} · 13 sourced contenders scored. Flemington was rated Soft 5 at 7:32am AEDT on 3 Nov 2026; this is a dated snapshot, not a live condition. <a href="${lineupSources.trackSnapshot}" target="_blank" rel="noopener noreferrer">Morning track report ↗</a> · <a href="${lineupSources.trackLatest}" target="_blank" rel="noopener noreferrer">Check latest VRC going ↗</a></p><div class="lineup-cards">${ranked.slice(0, 3).map((item, index) => {
    const horse = item.horse, p = item.parts;
    return `<article class="lineup-card"><span class="lineup-rank">${index + 1}</span><div><h4>#${horse.no} ${lineupEscape(horse.horse)}</h4><p class="lineup-facts">Gate ${horse.gate} · ${horse.kg}kg · ${item.total.toFixed(1)} factor points</p><p>${lineupEscape(horse.formNote)}</p>${lineupState.ground !== 'good4' ? `<p class="lineup-ground"><strong>Ground case:</strong> ${lineupEscape(horse.rainNote)}</p>` : ''}<p class="lineup-risk"><strong>Watch:</strong> ${lineupEscape(horse.risk)}</p><details class="lineup-breakdown"><summary>How the score was built</summary><p>Recent form ${p.form} + staying ${p.staying} + map ${p.map} + weight ${p.weight.toFixed(1)} + Cup-winning rider ${p.rider} + ground ${p.ground} + pace ${p.pace} = ${item.total.toFixed(1)} points.</p><div class="lineup-sources">${lineupLinks(horse.sources)}</div></details></div></article>`;
  }).join('')}</div><p class="lineup-next">Next scored: ${ranked.slice(3, 6).map(item => `#${item.horse.no} ${lineupEscape(item.horse.horse)} (${item.total.toFixed(1)})`).join(' · ')}.</p><p class="lineup-method">Formula: 3 × recent staying form (0–5) + 3 × stamina evidence (0–5) + 2 × likely gate/settling map (0–5) + (58 − weight kg) ÷ 2 + one point for a Cup-winning rider. Good 4 uses no wet-ground adjustment; the Soft 5 morning scenario adds 2 × editorial wet-ground grade (−2 to +3), while hypothetical Soft 6 adds 4 × that grade. A strong pace adds 2 × late-run suitability (0–3). Grades interpret cited form and are partly uncertain; these factor points are neither historical success rates nor calibrated probabilities. Unknown ground form scores zero. This frozen sensitivity study covers 13 contenders, not the entire 24-runner field, and does not account for late scratchings, rider changes or current odds.</p>`;
}

function renderLineup() {
  const root = document.querySelector('#secondLineup');
  if (!root) return;
  root.querySelectorAll('[data-lineup-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lineupMode === lineupState.mode)));
  root.querySelectorAll('[data-lineup-ground]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lineupGround === lineupState.ground)));
  root.querySelectorAll('[data-lineup-pace]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lineupPace === lineupState.pace)));
  root.querySelector('#lineupScenarioControls').hidden = lineupState.mode !== 'second';
  root.querySelector('#lineupResult').innerHTML = lineupState.mode === 'main' ? lineupPrimaryHtml() : lineupAlternativeHtml();
}

function mountLineup() {
  const panel = document.querySelector('#race-panel');
  if (!panel || panel.dataset.meeting !== 'flemington' || panel.getAttribute('aria-labelledby') !== 'race-tab-flemington-7' || panel.querySelector('#secondLineup')) return;
  const watchlist = panel.querySelector('.watchlist');
  if (!watchlist) return;
  watchlist.insertAdjacentHTML('afterend', `<section id="secondLineup" class="lineup-lab race-section" aria-labelledby="lineup-title"><div class="lineup-head"><div><p class="eyebrow">CUP SCENARIO LAB</p><h3 id="lineup-title">Build a second line-up</h3><p>Compare the published order with a transparent factor score. The morning report rated Flemington Soft 5; test a drier or wetter track and a different pace.</p></div><a href="cup-analysis.html">15-year comparison ↗</a></div><div class="lineup-switch" role="group" aria-label="Line-up"><button type="button" data-lineup-mode="main">Main line-up</button><button type="button" data-lineup-mode="second">Second line-up</button></div><div id="lineupScenarioControls" class="lineup-controls" hidden><div role="group" aria-label="Track condition scenario"><span>TRACK SCENARIO</span><button type="button" data-lineup-ground="soft5">Soft 5 · morning snapshot</button><button type="button" data-lineup-ground="good4">Good 4 · if dries</button><button type="button" data-lineup-ground="soft6">Soft 6 · if more rain</button></div><div role="group" aria-label="Likely race tempo"><span>IF PACE IS</span><button type="button" data-lineup-pace="even">Even</button><button type="button" data-lineup-pace="strong">Strong</button></div></div><div id="lineupResult" aria-live="polite"></div></section>`);
  renderLineup();
}

document.addEventListener('click', event => {
  const mode = event.target.closest('[data-lineup-mode]');
  const ground = event.target.closest('[data-lineup-ground]');
  const pace = event.target.closest('[data-lineup-pace]');
  if (mode) lineupState.mode = mode.dataset.lineupMode;
  else if (ground) { lineupState.ground = ground.dataset.lineupGround; lineupState.mode = 'second'; }
  else if (pace) { lineupState.pace = pace.dataset.lineupPace; lineupState.mode = 'second'; }
  else return;
  renderLineup();
});

const lineupPanel = document.querySelector('#race-panel');
if (lineupPanel) new MutationObserver(mountLineup).observe(lineupPanel, { childList: true });
mountLineup();
fetch('cup-forecast-2026.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => { lineupState.forecast = data; renderLineup(); }).catch(() => renderLineup());

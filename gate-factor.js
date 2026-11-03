'use strict';

// A descriptive map lens. It does not turn a barrier into a win probability.
// In particular, a low stall is not an automatic positive and a wide stall
// is not an automatic negative: pace, horse style, rail and lane use matter.
(() => {
  const sources = {
    barriers: 'https://www.betfair.com.au/hub/education/racing-strategy/barrier-positions/',
    flemington: 'https://dxp-cdn.racing.com/api/public/content/victorian-track-maps-without-jumps-maps-updated-aug-18-v2-628909.pdf?download=true&v=e0920d62',
    flemingtonCircuit: 'https://www.vrc.com.au/latest-news/breaking-down-the-barrier-numbers/',
    randwick: 'https://www.racingnsw.com.au/rules-policies-whs/racing-nsw-policies/metropolitan-barrier-limits/'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const positiveGate = value => {
    if (value == null || typeof value === 'string' && !value.trim()) return null;
    const gate = Number(value);
    return Number.isInteger(gate) && gate > 0 && gate <= 40 ? gate : null;
  };
  const safeSource = value => {
    try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.href : ''; }
    catch { return ''; }
  };

  function context(race) {
    const distance = Number(race?.distance ?? race?.distance_m);
    const knownDistance = Number.isFinite(distance) && distance > 0;
    const venue = String(race?.venue || '').toLowerCase();
    const straight = venue.includes('flemington') && knownDistance && distance <= 1200;
    const attention = !knownDistance ? 'Unknown' : distance <= 1200 ? 'Higher' : distance <= 1600 ? 'Moderate' : 'Lower';
    const weight = !knownDistance ? 0 : distance <= 1200 ? 1 : distance <= 1600 ? 0.6 : 0.3;
    const path = straight ? 'Flemington straight sprint' : venue.includes('randwick') ? 'Randwick course proper' : 'Circuit start';
    const explanation = !knownDistance
      ? 'The race distance is not saved, so the draw cannot be weighted by start type or settling time.'
      : straight
      ? 'A straight sprint has no first bend to save ground at. Compare nearby early pace, lane use, rail and wind before interpreting a low or high gate.'
      : distance <= 1200
        ? 'There is less time to establish a position in a short race. Judge the draw with early speed, likely cover, the start point and the rail position.'
        : distance <= 1600
          ? 'The gate may alter the route into cover and early effort. Running style and the speed map can reverse a simple inside or outside assumption.'
          : 'The draw is one map input. With more distance to settle, stamina, current form, pace and ground should carry more of the explanation.';
    return { distance, venue, straight, path, attention, reviewWeight: weight, explanation };
  }

  function cue(race, runner) {
    const gate = positiveGate(runner?.barrier);
    const info = context(race);
    if (gate == null) return { gate: null, label: 'Gate unconfirmed', detail: 'No sourced drawn barrier is saved for this horse, so no gate conclusion is used.', attention: info.attention };
    const style = String(runner?.runStyle || '').toLowerCase();
    let detail;
    if (info.straight) detail = `Drawn gate ${gate} on the Flemington straight. Check which side the early pace occupies and how the lanes are racing; this number receives no automatic inside bonus.`;
    else if (info.distance > 0 && info.distance <= 1200) detail = `Drawn gate ${gate} in a short race. Compare the horse’s early speed and the likely first 200m before deciding if this route helps.`;
    else detail = `Drawn gate ${gate}. Compare early position, cover and expected pace; the number alone does not establish an advantage.`;
    if (/backmarker|closer/.test(style) && !info.straight) detail += ' A backmarker may save ground inside but also need room to get out.';
    if (/leader|on pace/.test(style) && !info.straight) detail += ' A pace runner may use either side well depending on the other leaders and its gate speed.';
    return { gate, label: `Gate ${gate}`, detail, attention: info.attention };
  }

  // An optional, tightly capped editorial tiebreaker. It is applied only when
  // the researcher has saved an explicit, reasoned map-fit assessment (-1..1).
  // The numeric result is a research score, never an odds or chance estimate.
  function mapAdjustment(race, runner) {
    const rawFit = runner?.gateMapFit;
    const fit = Number(rawFit);
    const evidence = typeof runner?.gateMapEvidence === 'string' ? runner.gateMapEvidence.trim() : '';
    if (positiveGate(runner?.barrier) == null || !context(race).reviewWeight || rawFit == null || typeof rawFit === 'string' && !rawFit.trim() || !evidence || !Number.isFinite(fit) || fit < -1 || fit > 1 || !race?.fieldComplete) {
      return { points: 0, applied: false, reason: 'No complete field and recorded map-fit reason; gate is context only.' };
    }
    const points = Math.round(fit * context(race).reviewWeight * 0.25 * 100) / 100;
    return { points, applied: true, reason: `Editorial gate-map fit ${fit > 0 ? '+' : ''}${fit.toFixed(2)} × distance weight ${context(race).reviewWeight} × 0.25. ${evidence}` };
  }

  function render(race) {
    const info = context(race);
    const fieldRows = Array.isArray(race?.runners) ? race.runners : [];
    const examples = Array.isArray(race?.gateExamples) ? race.gateExamples : [];
    const joined = new Map();
    for (const runner of fieldRows) {
      if (runner?.name) joined.set(String(runner.name).toLowerCase(), runner);
    }
    for (const example of examples) {
      if (!example?.name) continue;
      const key = String(example.name).toLowerCase(), prior = joined.get(key);
      if (!prior && !race?.fieldComplete) joined.set(key, example);
      else if (positiveGate(prior.barrier) == null && positiveGate(example.barrier) != null) joined.set(key, { ...prior, barrier: example.barrier, runStyle: prior.runStyle || example.runStyle });
    }
    const rows = [...joined.values()].filter(runner => !runner.scratched && positiveGate(runner.barrier) != null).sort((a, b) => Number(a.barrier) - Number(b.barrier) || Number(a.number || 0) - Number(b.number || 0));
    const total = Array.isArray(race?.runners) ? race.runners.length : 0;
    const scope = race?.fieldComplete ? `${rows.length} of ${total} card entries have a saved gate.` : `${rows.length} selected gate examples are shown; this is not the complete draw.`;
    const contextSource = info.straight ? sources.flemington : info.venue.includes('randwick') ? sources.randwick : info.venue.includes('flemington') ? sources.flemingtonCircuit : sources.barriers;
    const contextLabel = info.straight ? 'Flemington track map' : info.venue.includes('randwick') ? 'Randwick rail and barrier limits' : info.venue.includes('flemington') ? 'Flemington barrier context' : 'Barrier research';
    const exampleSources = [...new Set([race?.gateSourceUrl, ...examples.map(row => row?.sourceUrl || row?.source_url)].map(safeSource).filter(Boolean))].slice(0, 3);
    const scratchingsUrl = safeSource(race?.gateScratchingsUrl);
    const snapshotDate = Date.parse(race?.gateSnapshotAt || '');
    const snapshot = Number.isFinite(snapshotDate) ? `Draw snapshot ${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(snapshotDate))}. ` : '';
    const list = rows.length ? `<div class="gate-lens-list">${rows.map(runner => {
      const reading = cue(race, runner), adjustment = mapAdjustment(race, runner);
      const points = `${adjustment.points > 0 ? '+' : ''}${adjustment.points.toFixed(2)} map pts`;
      return `<article class="gate-lens-entry"><div class="gate-lens-entry-head"><span class="gate-lens-number">${esc(runner.barrier)}</span><span><strong>${esc(runner.name)}</strong><small>${esc(runner.runStyle || 'Runner style unconfirmed')}</small></span>${adjustment.applied ? `<b class="is-applied">${esc(points)}</b>` : ''}</div><p>${esc(reading.detail)}</p>${adjustment.applied ? `<p class="gate-lens-basis">${esc(adjustment.reason)}</p>` : ''}</article>`;
    }).join('')}</div>` : '<div class="gate-lens-empty">No sourced barriers saved for this race yet. Add them to the personal card or load a licensed field.</div>';
    return `<section class="gate-lens race-section" aria-label="Gate and early map research"><details ${info.distance > 0 && info.distance <= 1200 ? 'open' : ''}><summary><span class="gate-lens-icon" aria-hidden="true">▥</span><span><strong>Gate &amp; early map</strong><small>${esc(info.path)} · ${esc(info.distance || '—')}m · ${esc(info.attention)} review priority</small></span><span class="gate-lens-chevron" aria-hidden="true">⌄</span></summary><div class="gate-lens-body"><p>${esc(info.explanation)}</p><div class="gate-lens-stats"><span><b>${rows.length}</b> saved gates or sourced examples</span><span><b>${esc(info.attention)}</b> distance attention</span></div>${list}<p class="gate-lens-scope">${esc(snapshot + scope)} Drawn barriers can differ from effective stalls after scratchings. A gate alone never changes an odds-derived chance in this workspace.</p><div class="gate-lens-links">${exampleSources.map(url => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Gate source ↗</a>`).join('')}${scratchingsUrl ? `<a href="${esc(scratchingsUrl)}" target="_blank" rel="noopener noreferrer">Check scratchings ↗</a>` : ''}<a href="${sources.barriers}" target="_blank" rel="noopener noreferrer">How to interpret barriers ↗</a><a href="${contextSource}" target="_blank" rel="noopener noreferrer">${contextLabel} ↗</a></div></div></details></section>`;
  }

  window.FormLineGate = Object.freeze({ context, cue, mapAdjustment, render });
})();

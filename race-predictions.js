/*
 * On-demand, owner-only race research. This file fetches nothing and stores
 * nothing. Call analyse() only after the visitor opens a race and requests a
 * fresh private card. Do not put its provider-derived output in public HTML.
 *
 * Input: { venue, raceName, raceNumber, startTime, distance, ground,
 *   fieldComplete: true, runners: [{ id?, name, number, barrier?, weight?,
 *   jockey?, form?, last10?, scratched?, emergency?,
 *   recentRuns?: [{ date, distance_m, track_condition, position, status }],
 *   research?: { win?: { probability, books, valid_until } },
 *   bookmakers?: [{ key, win_price, last_update, refresh_tier, stale }] }] }
 *
 * Output: { status, reason, basis, analysedAt, fieldSize, selections,
 *   proposals, limitations }. Each selection has { runner, rank, reasons,
 *   risks, marketShare }. Each proposal has { legs: [{ runner, market }],
 *   reasons, risks, basis, actualCombinedOdds: null }. An unavailable result
 * always has empty selections and proposals.
 *
 * Assumptions: market rank is descriptive, not a calibrated prediction or
 * evidence of positive expected return. A small, disclosed form/gate/weight
 * tiebreak can change only very close ranks. Draws are original barriers and
 * can differ from effective stalls after scratchings. Top 3/4/5 availability,
 * paid places and the actual same-race combined quote must be checked with
 * the bookmaker. Individual leg odds must never be multiplied together.
 */
(function () {
  'use strict';

  const MAX_FIELD = 30;
  const EMPTY = (status, reason, fieldSize = 0) => ({
    status, reason, basis: '', analysedAt: new Date().toISOString(),
    fieldSize, selections: [], proposals: [], limitations: []
  });

  function finite(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function recentForm(value) {
    // Australian form strings normally put the most recent run on the right.
    const digits = String(value || '').replace(/[^0-9]/g, '').slice(-5);
    return digits ? {
      text: digits,
      topThree: [...digits].filter(ch => ch === '1' || ch === '2' || ch === '3').length
    } : null;
  }

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function liveConsensus(runner, nowMs) {
    const row = runner.research?.win;
    const chance = finite(row?.probability);
    const books = finite(row?.books);
    const validUntil = Date.parse(row?.valid_until || '');
    return chance != null && chance > 0 && chance < 1 && books != null && books >= 3 && validUntil > nowMs
      ? chance : null;
  }

  function livePrice(runner, nowMs) {
    const book = (Array.isArray(runner.bookmakers) ? runner.bookmakers : [])
      .find(row => row?.key === 'sportsbet');
    if (Array.isArray(runner.bookmakers) && runner.bookmakers.length && !book) return null;
    const price = finite(book?.win_price ?? runner.winOdds);
    const stamp = Date.parse(book?.last_update || runner.quoteAt || '');
    const tier = book?.refresh_tier || runner.quoteTier;
    const maxAge = tier === 'card' ? 30 * 60 * 1000 : 2 * 60 * 1000;
    const age = nowMs - stamp;
    return !book?.stale && !runner.quoteStale && price != null && price > 1 && price <= 10000 &&
      Number.isFinite(stamp) && age >= -30000 && age <= maxAge ? price : null;
  }

  function tiebreak(runner, race, middleWeight, activeCount) {
    let points = 0;
    const notes = [];
    const form = recentForm(runner.form || runner.last10);
    if (form) {
      const formPoints = Math.min(0.12, form.topThree * 0.03);
      points += formPoints;
      notes.push(`Recent form ${form.text}: ${form.topThree} top-three finishes in the displayed sample; +${formPoints.toFixed(2)} ranking point.`);
    }
    const barrier = finite(runner.barrier);
    const distance = finite(race.distance ?? race.distance_m);
    const straightSprint = /flemington/i.test(String(race.venue || '')) && distance != null && distance <= 1200;
    if (barrier != null && distance != null && distance <= 1200 && activeCount >= 8 && !straightSprint) {
      // The draw rule is deliberately tiny: there is no universal inside edge.
      const gatePoints = barrier <= 4 ? 0.05 : barrier >= activeCount - 2 ? -0.05 : 0;
      if (gatePoints) {
        points += gatePoints;
        notes.push(`Original gate ${barrier} at ${distance}m: ${gatePoints > 0 ? '+' : ''}${gatePoints.toFixed(2)} unvalidated route tiebreak; check the early speed and effective stall.`);
      }
    }
    const weight = finite(runner.weight ?? runner.weight_kg);
    if (weight != null && middleWeight != null) {
      const weightPoints = Math.max(-0.08, Math.min(0.08, (middleWeight - weight) * 0.02));
      points += weightPoints;
      if (Math.abs(weightPoints) >= 0.01) {
        notes.push(`${weight}kg versus field median ${middleWeight}kg: ${weightPoints > 0 ? '+' : ''}${weightPoints.toFixed(2)} small weight tiebreak; handicap weights reflect assessed ability.`);
      }
    }
    return { points, notes };
  }

  function runnerCopy(runner) {
    return {
      id: String(runner.id ?? runner.runner_ref ?? `${runner.number}:${runner.name}`),
      name: String(runner.name || runner.runner_name || ''),
      number: finite(runner.number), barrier: finite(runner.barrier),
      weight: finite(runner.weight ?? runner.weight_kg),
      jockey: String(runner.jockey || ''), form: String(runner.form || runner.last10 || '')
    };
  }

  function recentRunEvidence(runner, race) {
    const runs = (Array.isArray(runner.recentRuns) ? runner.recentRuns : []).slice(0, 20)
      .filter(row => row && (!row.status || String(row.status).toLowerCase() === 'ran') &&
        Number.isInteger(Number(row.position)) && Number(row.position) > 0);
    if (!runs.length) return [];
    const notes = [];
    const placed = runs.filter(row => Number(row.position) <= 3).length;
    notes.push(`Recorded recent runs: ${placed} top-three finishes from ${runs.length} completed runs; a limited descriptive sample.`);
    const distance = finite(race.distance ?? race.distance_m);
    if (distance != null) {
      const nearby = runs.filter(row => {
        const runDistance = finite(row.distance_m);
        return runDistance != null && Math.abs(runDistance - distance) <= 200;
      });
      if (nearby.length) {
        const count = nearby.filter(row => Number(row.position) <= 3).length;
        notes.push(`${count} top-three finishes in ${nearby.length} recorded runs within 200m of today's ${distance}m; field strength may differ.`);
      }
    }
    const ground = String(race.ground || '').trim().toLowerCase();
    if (ground) {
      const sameGround = runs.filter(row => String(row.track_condition || '').trim().toLowerCase() === ground);
      if (sameGround.length) {
        const count = sameGround.filter(row => Number(row.position) <= 3).length;
        notes.push(`${count} top-three finishes from ${sameGround.length} recorded runs on ${race.ground}; the current rating may change.`);
      }
    }
    return notes;
  }

  function placementProposal(first, second, firstTop, secondTop, basis) {
    const mixed = firstTop !== secondTop;
    return {
      legs: [
        { runner: first.runner, market: `top${firstTop}` },
        { runner: second.runner, market: `top${secondTop}` }
      ],
      reasons: [
        `${first.runner.name} and ${second.runner.name} are the two strongest ranks in this complete-field ${basis.toLowerCase()} snapshot.`,
        mixed
          ? `The higher-ranked runner takes Top ${firstTop}; the other takes Top ${secondTop}. This is a placement scenario, not an offered bookmaker combination.`
          : `Both runners must finish inside the Top ${firstTop}. The two outcomes are dependent.`
      ],
      risks: [
        'Market rank does not establish value or a reliable probability for this combined outcome.',
        'Confirm that this finish market is offered, its exact terms, scratchings and the actual combined quote.'
      ],
      basis,
      actualCombinedOdds: null
    };
  }

  function analyse(race, options = {}) {
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const startMs = Date.parse(race?.startTime || race?.start_time || '');
    if (!race || !Array.isArray(race.runners) || race.fieldComplete !== true) {
      return EMPTY('incomplete-field', 'A complete accepted field is required before a race prediction.');
    }
    if (!Number.isFinite(startMs)) return EMPTY('unknown-jump', 'The race jump time is missing or invalid.', race.runners.length);
    if (startMs <= nowMs) return EMPTY('started', 'The scheduled jump time has passed; no new pre-race prediction is generated.', race.runners.length);

    const active = race.runners.filter(row => row && !row.scratched && !row.emergency && (row.name || row.runner_name));
    if (active.length < 6) return EMPTY('small-field', 'At least six active runners are needed before proposing Top 3 or Top 4 legs; confirm the bookmaker’s actual markets.', active.length);
    if (active.length > MAX_FIELD) return EMPTY('large-field', `The accepted field exceeds the ${MAX_FIELD}-runner analysis limit.`, active.length);
    const identities = active.map(row => `${row.number}:${String(row.name || row.runner_name).toLowerCase()}`);
    if (new Set(identities).size !== identities.length) return EMPTY('duplicate-field', 'The accepted field has duplicate runner identities.', active.length);

    const consensus = active.map(row => liveConsensus(row, nowMs));
    const prices = active.map(row => livePrice(row, nowMs));
    let basis, raw;
    if (consensus.every(value => value != null)) {
      basis = 'Fresh multi-book consensus';
      raw = consensus;
    } else if (prices.every(value => value != null)) {
      basis = 'Fresh single-book win market';
      raw = prices.map(price => 1 / price);
    } else {
      return EMPTY('no-fresh-market', 'Fresh win-market data for every active runner is required. Refresh the protected card on demand.', active.length);
    }
    const total = raw.reduce((sum, value) => sum + value, 0);
    if (!(total > 0)) return EMPTY('invalid-market', 'Market weights could not be normalised.', active.length);
    const weights = raw.map(value => value / total);
    const middleWeight = median(active.map(row => finite(row.weight ?? row.weight_kg)).filter(value => value != null));
    const scored = active.map((row, index) => {
      const tie = tiebreak(row, race, middleWeight, active.length);
      return { row, marketShare: weights[index], tie, score: weights[index] * 100 + tie.points };
    }).sort((a, b) => b.score - a.score || b.marketShare - a.marketShare || Number(a.row.number || 99) - Number(b.row.number || 99));
    const selections = scored.slice(0, 4).map((item, index) => {
      const runner = runnerCopy(item.row);
      const risks = [];
      if (runner.barrier != null && runner.barrier >= active.length - 2) risks.push(`Original gate ${runner.barrier} is wide; assess the likely early route.`);
      if (runner.weight != null && middleWeight != null && runner.weight >= middleWeight + 2) risks.push(`${runner.weight}kg is at least 2kg above the active-field median.`);
      if (!runner.form) risks.push('Recent form is unavailable in this card.');
      risks.push('Ground, rider, scratches and quotes can change before the jump.');
      return {
        runner, rank: index + 1, marketShare: item.marketShare,
        reasons: [
          `${basis} assigns ${Math.round(item.marketShare * 1000) / 10}% relative win-market weight after normalising the accepted field; this is not a calibrated chance.`,
          ...recentRunEvidence(item.row, race),
          ...item.tie.notes,
          ...(runner.jockey ? [`Listed jockey: ${runner.jockey}; no jockey performance adjustment was applied.`] : [])
        ],
        risks
      };
    });
    const [first, second] = selections;
    const proposals = [placementProposal(first, second, 3, 3, basis)];
    if (active.length >= 6) {
      proposals.push(placementProposal(first, second, 3, 4, basis));
      proposals.push(placementProposal(first, second, 4, 4, basis));
    }
    if (active.length >= 10) {
      proposals.push(placementProposal(first, second, 4, 5, basis));
      proposals.push(placementProposal(first, second, 5, 5, basis));
    }
    return {
      status: 'ready', reason: '', basis, analysedAt: new Date(nowMs).toISOString(),
      fieldSize: active.length, selections, proposals,
      limitations: [
        'Selection order comes mainly from current market rank; small form, draw and weight tiebreaks are unvalidated.',
        'The proposed multis have no actual combined odds, estimated value or confirmed bookmaker availability.',
        'A Top 3, Top 4 or Top 5 market is only usable when the bookmaker offers it for this race.'
      ]
    };
  }

  const api = Object.freeze({ analyse });
  if (typeof window !== 'undefined') window.FormLinePredictions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());

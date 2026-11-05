'use strict';

// Personal bring-your-own-key reads. No shared PuntersEdge key is held by FormLine.
// The API is deliberately limited to Sydney thoroughbred meetings and fixed paths.
const API_ORIGIN = 'https://api.puntersedge.online';
const RESERVE_CREDITS = 5;
const MAX_RESPONSE_CHARS = 12_000_000;
const ACTION_COST = Object.freeze({ card: 2, odds: 4, form: 3, results: 2 });
const VENUE_ALIASES = Object.freeze({
  Randwick: ['Randwick', 'Royal Randwick'],
  Kensington: ['Kensington', 'Randwick Kensington', 'Randwick (Kensington)'],
  Rosehill: ['Rosehill', 'Rosehill Gardens'],
  Canterbury: ['Canterbury', 'Canterbury Park'],
  'Warwick Farm': ['Warwick Farm']
});

class FeedError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function reply(response, status, body) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Vary', 'X-PuntersEdge-API-Key');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(body);
}

function text(value, max = 150) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function number(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function integer(value) {
  const parsed = number(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}
function boolOrNull(value) { return typeof value === 'boolean' ? value : null; }
function list(value) { return Array.isArray(value) ? value : []; }

function dateInSydney(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const pick = type => parts.find(part => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}
function shiftDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function requireDate(value, earliest, latest) {
  if (!validDate(value) || value < earliest || value > latest) {
    throw new FeedError(400, `Choose a meeting date from ${earliest} through ${latest}.`);
  }
  return value;
}

function canonicalVenue(value) {
  const normalized = text(value, 80).toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ');
  if (/^(royal )?randwick$/.test(normalized)) return 'Randwick';
  if (/^(randwick )?kensington$/.test(normalized)) return 'Kensington';
  if (/^rosehill( gardens)?$/.test(normalized)) return 'Rosehill';
  if (/^canterbury( park)?$/.test(normalized)) return 'Canterbury';
  if (normalized === 'warwick farm') return 'Warwick Farm';
  return '';
}
function requireVenue(value) {
  const venue = canonicalVenue(value);
  if (!venue) throw new FeedError(400, 'Choose Randwick, Kensington, Rosehill, Canterbury or Warwick Farm.');
  return venue;
}
function venueFilter(canonical) { return VENUE_ALIASES[canonical].join(','); }

function providerError(status) {
  if (status === 401) return new FeedError(401, 'PuntersEdge rejected this API key.');
  if (status === 402) return new FeedError(402, 'PuntersEdge credits are exhausted.');
  if (status === 403) return new FeedError(403, 'This PuntersEdge endpoint is unavailable on the current plan.');
  if (status === 404) return new FeedError(404, 'PuntersEdge has no data for this race yet.');
  if (status === 409) return new FeedError(409, 'More than one race matches this request.');
  if (status === 422) return new FeedError(400, 'PuntersEdge rejected the requested race or date.');
  if (status === 429) return new FeedError(429, 'PuntersEdge is rate limiting this key. Try again later.');
  return new FeedError(502, `PuntersEdge returned HTTP ${status}.`);
}

async function provider(key, path, params = {}) {
  const url = new URL(path, API_ORIGIN);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  let response;
  try {
    response = await fetch(url, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    throw new FeedError(502, 'PuntersEdge could not be reached. Try again later.');
  }
  if (!response.ok) throw providerError(response.status);
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_CHARS) {
    throw new FeedError(502, 'PuntersEdge returned too much data for one request.');
  }
  let raw;
  try { raw = await response.text(); }
  catch { throw new FeedError(502, 'PuntersEdge response could not be read.'); }
  if (raw.length > MAX_RESPONSE_CHARS) throw new FeedError(502, 'PuntersEdge returned too much data for one request.');
  try { return JSON.parse(raw); }
  catch { throw new FeedError(502, 'PuntersEdge returned invalid JSON.'); }
}

async function checkedUsage(key, cost) {
  const raw = await provider(key, '/v1/usage');
  const balance = raw?.credits_remaining;
  const unlimited = balance === null && raw?.credits_limit === null;
  const remaining = unlimited ? null : number(balance);
  if (!unlimited && remaining === null) throw new FeedError(502, 'PuntersEdge credit balance is unavailable.');
  if (remaining !== null && remaining < cost + RESERVE_CREDITS) {
    throw new FeedError(402, `At least ${cost + RESERVE_CREDITS} credits are needed to keep a ${RESERVE_CREDITS}-credit reserve.`);
  }
  return {
    plan: text(raw.plan, 40), credits_remaining: remaining,
    credits_limit: number(raw.credits_limit), next_reset_at: text(raw.next_reset_at || raw.reset_at, 40)
  };
}

function slimRunner(row) {
  return {
    number: integer(row.number), name: text(row.runner_name || row.name, 120),
    barrier: integer(row.barrier), weight_kg: number(row.weight_kg ?? row.weight),
    jockey: text(row.jockey, 100), trainer: text(row.trainer, 100),
    last10: text(row.last10 || row.form, 50),
    scratched: boolOrNull(row.scratched), emergency: boolOrNull(row.emergency),
    last_start_date: text(row.last_start_date, 20),
    last_start_position: integer(row.last_start_position),
    last_start_weight_kg: number(row.last_start_weight_kg),
    last_start_barrier: integer(row.last_start_barrier)
  };
}
function slimCard(raw, date, usage) {
  const meetings = list(raw?.meetings).filter(row => canonicalVenue(row?.venue)).map(row => ({
    venue: canonicalVenue(row.venue), provider_venue: text(row.venue, 80),
    as_of: text(row.as_of, 40), scratching_data: text(row.scratching_data, 40),
    scratching_sheet_as_of: text(row.scratching_sheet_as_of, 40),
    track: {
      track_condition: text(row.track?.track_condition, 60), rail: text(row.track?.rail, 100),
      weather: text(row.track?.weather, 80), going: text(row.track?.going, 40),
      going_rating: integer(row.track?.going_rating)
    },
    races: list(row.races).filter(race => integer(race?.race_number) > 0).map(race => ({
      number: integer(race.race_number), name: text(race.race_name, 180),
      start_time_local: text(race.start_time_local, 30), distance_m: integer(race.distance_m),
      race_class: text(race.race_class, 100), conditions: text(race.conditions, 240),
      runner_set_status: text(race.runner_set_status, 50),
      runner_set_note: text(race.runner_set_note, 240),
      declared_remaining_count: integer(race.declared_remaining_count),
      runners: list(race.runners).map(slimRunner).filter(runner => runner.name)
    }))
  }));
  return {
    date, as_of: text(raw?.as_of, 40), usage, meetings,
    note: meetings.length ? '' : 'No Sydney metro acceptances are published for this date.'
  };
}

function slimOdds(raw, date, venue, usage) {
  const races = list(raw).filter(race =>
    canonicalVenue(race?.venue) === venue && race?.category === 'horse' &&
    (race.country === 'AU' || race.country == null) && dateInSydney(race.start_time) === date
  ).map(race => ({
    number: integer(race.race_number), name: text(race.race_name, 180),
    start_time: text(race.start_time, 40), places_paid: integer(race.places_paid),
    runners: list(race.runners).map(row => {
      const book = list(row.bookmakers).find(item => text(item?.key, 40).toLowerCase() === 'sportsbet');
      if (!book) return null;
      return {
        number: integer(row.number), name: text(row.name, 120),
        win_price: number(book.win_price), place_price: number(book.place_price),
        top2_price: number(book.top2_price), top3_price: number(book.top3_price),
        top4_price: number(book.top4_price), last_update: text(book.last_update, 40),
        stale: boolOrNull(book.stale), refresh_tier: text(book.refresh_tier, 30)
      };
    }).filter(Boolean)
  })).filter(race => race.number > 0);
  return { date, venue, as_of: new Date().toISOString(), usage, races,
    note: races.length ? '' : 'No Sportsbet Sydney prices are available in the next-to-go window.' };
}

function slimForm(raw, date, venue, raceNumber, usage) {
  if (canonicalVenue(raw?.venue) !== venue || integer(raw?.race_number) !== raceNumber ||
      (raw?.meeting_date && raw.meeting_date !== date)) {
    throw new FeedError(502, 'PuntersEdge returned a different race than requested.');
  }
  return {
    date, venue, number: raceNumber, race_name: text(raw.race_name, 180),
    form_as_at: text(raw.form_as_at, 40), usage,
    runners: list(raw.runners).map(row => ({
      number: integer(row.number), name: text(row.name, 120),
      stats: { starts: integer(row.stats?.starts), wins: integer(row.stats?.wins), places: integer(row.stats?.places) },
      runs_total: integer(row.runs_total),
      runs: list(row.runs).slice(0, 10).map(run => ({
        date: text(run.date, 20), venue: text(run.venue, 80), distance_m: integer(run.distance_m),
        track_condition: text(run.track_condition, 60), position: integer(run.position),
        margin: text(run.margin, 40), weight_kg: number(run.weight_kg ?? run.carried_kg),
        barrier: integer(run.barrier ?? run.box), status: text(run.status, 30)
      }))
    })).filter(runner => runner.name)
  };
}

function slimResults(raw, date, venue, usage) {
  const results = list(raw).filter(race =>
    canonicalVenue(race?.venue) === venue && race?.category === 'horse' &&
    (race.country === 'AU' || race.country == null) &&
    (race.meeting_date_aet === date || dateInSydney(race.start_time) === date)
  ).map(race => ({
    number: integer(race.race_number), name: text(race.race_name, 180),
    start_time: text(race.start_time, 40), status: text(race.status, 30),
    track_condition: text(race.track_condition, 60), field_status: text(race.field_status, 40),
    placings: list(race.placings).map(row => ({
      number: integer(row.number), name: text(row.name, 120), position: integer(row.position)
    })).filter(row => row.name),
    runners: Array.isArray(race.runners) ? race.runners.map(row => ({
      number: integer(row.number), name: text(row.name, 120), position: integer(row.position),
      status: text(row.status, 30)
    })).filter(row => row.name) : null
  })).filter(race => race.number > 0);
  return { date, venue, as_of: new Date().toISOString(), usage, results,
    note: results.length ? '' : 'No Sydney results are available for this date and venue.' };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Use GET.' });
  const key = request.headers?.['x-puntersedge-api-key'] ?? request.headers?.get?.('x-puntersedge-api-key');
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,160}$/.test(key)) {
    return reply(response, 401, { error: 'Enter your personal PuntersEdge API key.' });
  }
  const action = request.query?.action;
  if (typeof action !== 'string' || !Object.hasOwn(ACTION_COST, action)) {
    return reply(response, 400, { error: 'Choose card, odds, form or results.' });
  }
  const today = dateInSydney();
  try {
    const date = requireDate(request.query?.date,
      action === 'results' ? shiftDays(today, -7) : today,
      action === 'results' ? today : shiftDays(today, 3));
    const venue = action === 'card' ? '' : requireVenue(request.query?.venue);
    const providerVenue = action === 'card' ? '' : text(request.query?.venue, 80);
    const raceNumber = action === 'form' ? integer(request.query?.race_number) : null;
    if (action === 'form' && (raceNumber === null || raceNumber < 1 || raceNumber > 20)) {
      throw new FeedError(400, 'Choose a race number from 1 to 20.');
    }
    const usage = await checkedUsage(key, ACTION_COST[action]);
    if (action === 'card') {
      const card = await provider(key, '/v1/racing/acceptances', { date });
      return reply(response, 200, slimCard(card, date, usage));
    }
    if (action === 'odds') {
      const odds = await provider(key, '/v1/racing/next-to-go', {
        num_races: 200, categories: 'horse', country: 'AU', include_unresolved: true,
        bookmakers: 'sportsbet', venue: venueFilter(venue)
      });
      return reply(response, 200, slimOdds(odds, date, venue, usage));
    }
    if (action === 'form') {
      const form = await provider(key, '/v1/racing/form', {
        venue: providerVenue, meeting_date: date, race_number: raceNumber, runs: 10
      });
      return reply(response, 200, slimForm(form, date, venue, raceNumber, usage));
    }
    const results = await provider(key, '/v1/racing/results', {
      date, venue: venueFilter(venue), categories: 'horse', country: 'AU', limit: 200
    });
    return reply(response, 200, slimResults(results, date, venue, usage));
  } catch (error) {
    return reply(response, error instanceof FeedError ? error.status : 502,
      { error: error instanceof FeedError ? error.message : 'Sydney racing data is unavailable.' });
  }
};

'use strict';

const { timingSafeEqual } = require('node:crypto');

const API_ORIGIN = 'https://api.puntersedge.online';
const ALLOWED_ACTIONS = new Set(['board', 'results', 'usage', 'meeting', 'form']);

function reply(response, status, body) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(body);
}

function sameSecret(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;
  const received = Buffer.from(input);
  const stored = Buffer.from(expected);
  return received.length === stored.length && timingSafeEqual(received, stored);
}

function todayInMelbourne() {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateInMelbourne(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 && n <= 10000 ? n : null;
}

function quoteExpiry(quote) {
  if (!quote || quote.stale) return null;
  const observed = Date.parse(quote.last_update || '');
  if (!Number.isFinite(observed)) return null;
  const lifetime = quote.refresh_tier === 'card' ? 30 * 60 * 1000 : 2 * 60 * 1000;
  const age = Date.now() - observed;
  return age >= -30000 && age <= lifetime ? observed + lifetime : null;
}

function normalizePrices(prices, target) {
  const raw = prices.map(price => validPrice(price) ? 1 / Number(price) : null);
  if (raw.some(value => value == null) || !Number.isInteger(target) || target < 1) return null;
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const normalized = raw.map(value => Math.min(1, value * target / total));
  for (let pass = 0; pass < 4; pass++) {
    const left = target - normalized.reduce((sum, value) => sum + value, 0);
    const open = normalized.map((value, index) => value < 0.999999 ? index : -1).filter(index => index >= 0);
    if (left <= 1e-9 || !open.length) break;
    const openTotal = open.reduce((sum, index) => sum + raw[index], 0);
    for (const index of open) normalized[index] = Math.min(1, normalized[index] + left * raw[index] / openTotal);
  }
  return normalized;
}

function median(values) {
  const ordered = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function marketConsensus(race, market) {
  const scratched = new Set((race.scratchings || []).map(item => Number(item?.number)));
  const active = (Array.isArray(race.runners) ? race.runners : []).filter(row => row && !row.emergency && !row.scratched && !scratched.has(Number(row.number)));
  const target = market === 'win' ? 1 : Number(race.places_paid);
  if (active.length < 2 || !Number.isInteger(target) || target < 1 || target > active.length) return null;
  const keys = new Set(active.flatMap(row => (Array.isArray(row.bookmakers) ? row.bookmakers : []).map(book => book?.key)).filter(Boolean));
  const observations = active.map(() => []);
  let completeBooks = 0;
  let validUntil = Infinity;
  for (const key of keys) {
    if (key === 'sportsbet') continue;
    const quotes = active.map(row => (Array.isArray(row.bookmakers) ? row.bookmakers : []).find(book => book?.key === key));
    const expiries = quotes.map(quoteExpiry);
    if (expiries.some(expiry => expiry == null)) continue;
    const normalized = normalizePrices(quotes.map(quote => quote[market + '_price']), target);
    if (!normalized) continue;
    completeBooks++;
    for (let i = 0; i < active.length; i++) observations[i].push(normalized[i]);
    validUntil = Math.min(validUntil, ...expiries);
  }
  if (completeBooks < 3) return null;
  const middle = observations.map(median);
  const scale = target / middle.reduce((sum, value) => sum + value, 0);
  const probabilities = middle.map(value => Math.min(1, value * scale));
  const byRunner = new Map();
  for (let i = 0; i < active.length; i++) {
    const row = active[i];
    byRunner.set(String(row.runner_ref || `${row.number}:${row.name || row.runner_name}`), {
      probability: probabilities[i], books: completeBooks, valid_until: new Date(validUntil).toISOString()
    });
  }
  return byRunner;
}

function slimRunner(item) {
  return {
    name: item.name ?? item.runner_name, runner_name: item.runner_name,
    number: item.number, runner_ref: item.runner_ref,
    barrier: item.barrier, weight: item.weight, weight_kg: item.weight_kg,
    jockey: item.jockey, trainer: item.trainer, form: item.form, last10: item.last10,
    scratched: item.scratched, emergency: item.emergency,
    bookmakers: (Array.isArray(item.bookmakers) ? item.bookmakers : [])
      .filter(book => book?.key === 'sportsbet')
      .map(book => ({
        key: book.key, win_price: book.win_price, place_price: book.place_price,
        top3_price: book.top3_price, top4_price: book.top4_price,
        last_update: book.last_update, age_seconds: book.age_seconds,
        refresh_tier: book.refresh_tier, stale: book.stale
      }))
  };
}

function slimRace(item, expectedActive = 0) {
  const scratched = new Set((item.scratchings || []).map(row => Number(row?.number)));
  const pricedActive = (Array.isArray(item.runners) ? item.runners : []).filter(row => row && !row.emergency && !row.scratched && !scratched.has(Number(row.number))).length;
  const completeField = expectedActive > 0 && pricedActive >= expectedActive;
  const win = completeField ? marketConsensus(item, 'win') : null;
  const place = completeField ? marketConsensus(item, 'place') : null;
  return {
    race_id: item.race_id, country: item.country, category: item.category,
    venue: item.venue, race_number: item.race_number, race_name: item.race_name,
    start_time: item.start_time, distance_m: item.distance_m, places_paid: item.places_paid,
    track_condition: item.track_condition, race_class: item.race_class,
    scratchings: item.scratchings,
    research_status: completeField ? '' : expectedActive ? 'Priced panel is smaller than the published acceptance field; comparison paused.' : 'The full accepted field could not be matched; comparison paused.',
    runners: (Array.isArray(item.runners) ? item.runners : []).filter(row => row && typeof row === 'object' && !row.emergency).map(row => {
      const ref = String(row.runner_ref || `${row.number}:${row.name || row.runner_name}`);
      return { ...slimRunner(row), research: { win: win?.get(ref) || null, place: place?.get(ref) || null } };
    })
  };
}

function slimAcceptances(card) {
  if (!card || !Array.isArray(card.meetings)) return null;
  return {
    date: card.date,
    meetings: card.meetings.filter(meeting => meeting && typeof meeting === 'object').map(meeting => ({
      venue: meeting.venue, track: meeting.track,
      races: (Array.isArray(meeting.races) ? meeting.races : []).filter(item => item && typeof item === 'object').map(item => ({
        race_id: item.race_id, race_number: item.race_number, race_name: item.race_name,
        start_time_local: item.start_time_local, distance_m: item.distance_m,
        race_class: item.race_class, conditions: item.conditions,
        runners: (Array.isArray(item.runners) ? item.runners : []).filter(row => row && typeof row === 'object').map(slimRunner)
      }))
    }))
  };
}

async function provider(path, params = {}) {
  const url = new URL(path, API_ORIGIN);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 23000);
  let response;
  try {
    response = await fetch(url, {
      headers: { 'X-API-Key': process.env.PUNTERSEDGE_API_KEY, Accept: 'application/json' },
      cache: 'no-store', signal: controller.signal
    });
  } catch {
    throw { status: 502, message: 'Racing data could not be reached. Try again later.' };
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    if (response.status === 402 || response.status === 429) {
      throw { status: response.status, message: 'The data plan is out of credits or rate limited.' };
    }
    if (response.status === 403) {
      throw { status: 403, message: 'This data endpoint is unavailable on the current plan.' };
    }
    throw { status: 502, message: `Racing data provider returned HTTP ${response.status}.` };
  }
  try { return await response.json(); }
  catch { throw { status: 502, message: 'Racing data provider returned invalid JSON.' }; }
}

async function checkedUsage(minimum) {
  const usage = await provider('/v1/usage');
  const remaining = Number(usage?.credits_remaining);
  if (!Number.isFinite(remaining)) throw { status: 502, message: 'Credit balance unavailable; paid request paused.' };
  if (remaining < minimum) throw { status: 402, message: `Only ${remaining} credits remain; paid request paused to keep a reserve.` };
  return {
    plan: usage.plan,
    credits_used: usage.credits_used,
    credits_limit: usage.credits_limit,
    credits_remaining: usage.credits_remaining,
    reset_at: usage.reset_at ?? usage.next_reset_at ?? null
  };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Use GET.' });
  if (!process.env.PUNTERSEDGE_API_KEY || !process.env.FORMLINE_ACCESS_CODE) {
    return reply(response, 503, { error: 'Live data needs the API key and access code in the Vercel project settings.' });
  }
  if (!sameSecret(request.headers['x-formline-access-code'], process.env.FORMLINE_ACCESS_CODE)) {
    return reply(response, 401, { error: 'Access code required or incorrect.' });
  }
  const action = String(request.query?.action ?? '');
  if (!ALLOWED_ACTIONS.has(action)) return reply(response, 400, { error: 'Unknown data action.' });

  try {
    if (action === 'usage') return reply(response, 200, { usage: await checkedUsage(0) });
    if (action === 'board') {
      const date = String(request.query?.date || todayInMelbourne());
      const today = todayInMelbourne();
      const offsetDays = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(offsetDays) || offsetDays < 0 || offsetDays > 3) {
        return reply(response, 400, { error: 'Choose today or one of the next three meeting dates.' });
      }
      const usage = await checkedUsage(16);
      const races = await provider('/v1/racing/next-to-go', {
        num_races: 200, categories: 'horse', country: 'AU'
      });
      if (!Array.isArray(races)) throw { status: 502, message: 'Race board response has an unexpected shape.' };
      let acceptances = null;
      let acceptanceCard = null;
      let acceptance_error = null;
      try {
        const card = await provider('/v1/racing/acceptances', { date });
        if (card && Array.isArray(card.meetings)) {
          acceptanceCard = card;
          acceptances = slimAcceptances(card);
        }
        else acceptance_error = 'The full meeting card had an unexpected shape.';
      } catch (error) {
        acceptance_error = error.message || 'The full meeting card is unavailable.';
      }
      const acceptedCounts = new Map();
      const venueRaceKey = (venue, number) => `${String(venue || '').trim().toLowerCase()}|${Number(number)}`;
      for (const meeting of acceptanceCard?.meetings || []) for (const race of meeting.races || []) {
        const count = (race.runners || []).filter(row => row && !row.emergency && !row.scratched).length;
        acceptedCounts.set(String(race.race_id), count);
        acceptedCounts.set(venueRaceKey(meeting.venue, race.race_number), count);
      }
      return reply(response, 200, {
        races: races.filter(item => item?.country === 'AU' && item?.category === 'horse' && dateInMelbourne(item.start_time) === date).map(item => slimRace(item, acceptedCounts.get(String(item.race_id)) || acceptedCounts.get(venueRaceKey(item.venue, item.race_number)) || 0)),
        acceptances, acceptance_error, acceptance_date: date, usage, fetched_at: new Date().toISOString()
      });
    }
    if (action === 'results') {
      const hours = Number(request.query.hours_back ?? 24);
      const offset = Number(request.query.offset ?? 0);
      if (![24, 168].includes(hours) || !Number.isInteger(offset) || offset < 0 || offset > 1800 || offset % 200) {
        return reply(response, 400, { error: 'Choose a 24-hour or seven-day results page.' });
      }
      const usage = await checkedUsage(12);
      const results = await provider('/v1/racing/results', {
        categories: 'horse', country: 'AU', hours_back: hours, limit: 200, offset
      });
      if (!Array.isArray(results)) throw { status: 502, message: 'Results response has an unexpected shape.' };
      return reply(response, 200, {
        results: results.filter(item => item?.race_id), usage, fetched_at: new Date().toISOString(),
        offset, has_more: results.length === 200
      });
    }
    if (action === 'meeting') {
      const date = String(request.query.date ?? '');
      const venue = String(request.query.venue ?? '');
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !/^[\p{L}\p{N} .'-]{2,80}$/u.test(venue)) {
        return reply(response, 400, { error: 'Choose a valid meeting and date.' });
      }
      const usage = await checkedUsage(13);
      const track = await provider('/v1/racing/track-conditions', { date, venue });
      const results = await provider('/v1/racing/results', {
        date, venue, categories: 'horse', country: 'AU', limit: 200
      });
      if (!Array.isArray(results)) throw { status: 502, message: 'Meeting results have an unexpected shape.' };
      return reply(response, 200, { track, results, usage, fetched_at: new Date().toISOString() });
    }
    if (action === 'form') {
      const raceId = String(request.query.race_id ?? '');
      const runs = Number(request.query.runs ?? 10);
      if (!/^[A-Za-z0-9:._-]{1,100}$/.test(raceId) || !Number.isInteger(runs) || runs < 1 || runs > 20) {
        return reply(response, 400, { error: 'Choose a valid race and form depth.' });
      }
      const usage = await checkedUsage(13);
      const form = await provider('/v1/racing/form', { race_id: raceId, runs });
      return reply(response, 200, { form, usage, fetched_at: new Date().toISOString() });
    }
  } catch (error) {
    return reply(response, error.status || 502, { error: error.message || 'Racing data unavailable.' });
  }
};

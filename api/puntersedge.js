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

function slimRace(item) {
  return {
    race_id: item.race_id, country: item.country, category: item.category,
    venue: item.venue, race_number: item.race_number, race_name: item.race_name,
    start_time: item.start_time, distance_m: item.distance_m, places_paid: item.places_paid,
    track_condition: item.track_condition, race_class: item.race_class,
    scratchings: item.scratchings,
    runners: (Array.isArray(item.runners) ? item.runners : []).filter(row => row && typeof row === 'object').map(slimRunner)
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
      let acceptance_error = null;
      try {
        const card = await provider('/v1/racing/acceptances', { date });
        if (card && Array.isArray(card.meetings)) acceptances = slimAcceptances(card);
        else acceptance_error = 'The full meeting card had an unexpected shape.';
      } catch (error) {
        acceptance_error = error.message || 'The full meeting card is unavailable.';
      }
      return reply(response, 200, {
        races: races.filter(item => item?.country === 'AU' && item?.category === 'horse' && dateInMelbourne(item.start_time) === date).map(slimRace),
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

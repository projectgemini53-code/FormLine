'use strict';

// Racing Queensland publishes this service for public reuse. It covers QLD only.
// See https://www.racingqueensland.com.au/OpenDataWebServices/rq-open-data-web-services.pdf
const ORIGIN = 'https://www.racingqueensland.com.au';
const SERVICE = `${ORIGIN}/OpenDataWebServices/Meetings.asmx`;

function dateInSydney(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const pick = type => parts.find(part => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function plusDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function decodeXml(value = '') {
  return String(value).replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric, named) => {
    if (numeric) {
      const code = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named.toLowerCase()] || match;
  }).trim();
}

function field(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function records(xml, name) {
  const pattern = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)<\\/${name}>`, 'gi');
  return [...xml.matchAll(pattern)].map(match => ({
    id: match[1].match(/\bId="(\d+)"/i)?.[1] || '', body: match[2]
  })).filter(row => row.id);
}

function raceStart(date, time) {
  const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return null;
  const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${date}T${String(hour).padStart(2, '0')}:${match[2]}:00+10:00`;
}

async function readService(method, params) {
  const url = new URL(`${SERVICE}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: { Accept: 'application/xml, text/xml' },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Queensland open data returned HTTP ${response.status}.`);
  const xml = await response.text();
  if (xml.length > 2000000 || /<Error\b/i.test(xml) || !/^\s*<\?xml\b/i.test(xml)) {
    throw new Error('Queensland open data returned an unexpected response.');
  }
  return { xml, url: url.href };
}

module.exports = async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
  if (request.method !== 'GET') return response.status(405).json({ error: 'Use GET.' });
  const today = dateInSydney();
  const action = String(request.query?.action || 'meetings');
  const source_note = 'Queensland thoroughbred schedule from Racing Queensland Open Data Web Services. Times use Queensland local time (AEST). Fields and scratchings may change.';
  try {
    if (action === 'meetings') {
      const end = plusDays(today, 7);
      const { xml, url } = await readService('GetMeetingsForDateRange', { StartDate: today, EndDate: end });
      const meetings = records(xml, 'Meeting').filter(({ body }) => field(body, 'IsBarrierTrial').toLowerCase() !== 'true').map(({ id, body }) => ({
        meeting_id: id,
        date: field(body, 'MeetingDate'),
        venue: field(body, 'TrackName'),
        state: 'QLD',
        feature: field(body, 'MeetingName'),
        race_count: Number(field(body, 'NumberOfRaces')) || null,
        schedule_status: 'Open data meeting; open to load its race program.',
        source_url: url,
        races: []
      })).filter(meeting => meeting.date >= today && meeting.date <= end && meeting.venue);
      return response.status(200).json({ as_of: new Date().toISOString(), expires: end, source_note, meetings });
    }
    if (action === 'card') {
      const meetingId = String(request.query?.meeting_id || '');
      const date = String(request.query?.date || '');
      if (!/^\d{1,9}$/.test(meetingId) || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || date < today || date > plusDays(today, 7)) {
        return response.status(400).json({ error: 'Choose a Queensland meeting in the next seven days.' });
      }
      const [details, card] = await Promise.all([
        readService('GetMeetingDetails', { MeetingId: meetingId }),
        readService('GetRacesForMeeting', { MeetingId: meetingId })
      ]);
      const actualDate = field(details.xml, 'MeetingDate');
      if (actualDate !== date || field(details.xml, 'IsBarrierTrial').toLowerCase() === 'true') {
        return response.status(400).json({ error: 'The selected date does not match this Queensland thoroughbred meeting.' });
      }
      const { xml, url } = card;
      const races = records(xml, 'Race').map(({ id, body }) => ({
        race_id: id,
        number: Number(field(body, 'RaceNumber')),
        name: field(body, 'RaceName'),
        start_time: raceStart(date, field(body, 'RaceTime')),
        distance_m: Number(field(body, 'Distance').match(/\d+/)?.[0]) || null,
        race_class: field(body, 'Class'),
        track_rating: field(body, 'TrackRating'),
        source_url: url
      })).filter(race => Number.isInteger(race.number) && race.number > 0 && race.name);
      const raceCount = Number(field(details.xml, 'NumberOfRaces')) || null;
      return response.status(200).json({
        as_of: new Date().toISOString(), date, state: 'QLD', meeting_id: meetingId,
        venue: field(details.xml, 'TrackName'), race_count: raceCount,
        track_rating: field(details.xml, 'Rating'), rail_position: field(details.xml, 'RailPosition'),
        weather: field(details.xml, 'Weather'),
        schedule_status: raceCount && races.length < raceCount ? `${races.length} of ${raceCount} races currently listed; check again after fields publish.` : 'Current Queensland open-data race program; check for late changes.',
        source_note, races
      });
    }
    return response.status(400).json({ error: 'Unknown schedule action.' });
  } catch (error) {
    return response.status(502).json({ error: error.message || 'Queensland schedule unavailable.' });
  }
};

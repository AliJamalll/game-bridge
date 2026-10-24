// Private dashboard data for the owner: funnel, survey and feedback. Needs "Authorization: Bearer <ADMIN_TOKEN>"
// (a header, so the token stays out of URLs and request logs).
import { list, get } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';
import { EVENTS } from './event.js';

async function listAll(prefix) {
  const out = []; let cursor;
  do { const r = await list({ prefix, cursor, limit: 1000 }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}
async function read(b) { const r = await get(b.pathname, { access: 'private', useCache: false }); return JSON.parse(await new Response(r.stream).text()); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, '')), want = Buffer.from(String(process.env.ADMIN_TOKEN || ''));
  if (!want.length || given.length !== want.length || !timingSafeEqual(given, want)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const ev = (await listAll('events/')).filter(b => b.pathname.split('/')[1] >= since);
    const funnel = {}, macs = {};
    for (const e of EVENTS) { funnel[e] = 0; macs[e] = new Set(); }
    for (const b of ev) { const [, , name, dev] = b.pathname.split('/'); if (funnel[name] !== undefined) { funnel[name]++; macs[name].add(dev); } }
    const uniques = Object.fromEntries(EVENTS.map(e => [e, macs[e].size]));
    const surveys = await Promise.all((await listAll('survey/')).map(read));
    const survey = { very: 0, somewhat: 0, not: 0, notes: [] };
    for (const s of surveys) { survey[s.answer] = (survey[s.answer] || 0) + 1; if (s.text) survey.notes.push({ at: s.at, answer: s.answer, text: s.text }); }
    const fb = (await listAll('feedback/')).sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, 50);
    const feedback = await Promise.all(fb.map(read));
    const [founders, ratings, invites] = await Promise.all([listAll('founders/'), listAll('ratings/'), listAll('invites/by/')]);
    return res.status(200).json({ days, uniques, dailyEvents: funnel, survey, feedback,
      totals: { founders: founders.length, ratings: ratings.length, invitedFriends: invites.length } });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

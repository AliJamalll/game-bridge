// Daily cron (vercel.json): deletes the hourly request counters of past hours (api/_security.js rateLimited).
// When CRON_SECRET is set in Vercel, only Vercel's cron (which sends it) can run this.
import { list, del } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const current = new Date().toISOString().slice(0, 13);
  try {
    let removed = 0, cursor;
    do {
      const r = await list({ prefix: 'limits/hourly/', cursor, limit: 1000 });
      const old = r.blobs.filter(b => b.pathname.split('/')[2] < current).map(b => b.url);
      if (old.length) { await del(old); removed += old.length; }
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return res.status(200).json({ removed });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

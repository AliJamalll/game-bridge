// Live visitor counter for the website (served by api/event.js through a rewrite: Vercel Hobby allows 12 functions). Anonymous: a visitor is a salted hash of their network, never an IP.
// POST            -> records this visitor (all time, today, and a heartbeat for "online now"); answers with the counts
// GET             -> { online, today, total } (cached for a few seconds so many viewers cost one count)
import { list, put } from '@vercel/blob';
import { client, rateLimited } from './_security.js';

const ONLINE_MS = 75 * 1000;   // a visitor is "online" for this long after their last heartbeat
const BOT = /bot|crawl|spider|slurp|preview|monitor|vercel|curl|wget|python|node|headless/i;

async function countAll(prefix) {
  let n = 0, cursor;
  do { const r = await list({ prefix, cursor, limit: 1000 }); n += r.blobs.length; cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return n;
}

async function online() {
  const since = Date.now() - ONLINE_MS;
  let n = 0, cursor;
  do {
    const r = await list({ prefix: 'visits/online/', cursor, limit: 1000 });
    n += r.blobs.filter(b => new Date(b.uploadedAt).getTime() >= since).length;
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return n;
}

const mark = (path) => put(path, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });

export default async function handler(req, res) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      const ua = String(req.headers['user-agent'] || '');
      if (!BOT.test(ua) && ua) {
        const { ipHash } = client(req);
        if (!(await rateLimited('visit', ipHash, 120))) {
          await Promise.all([mark(`visits/all/${ipHash}`), mark(`visits/day/${day}/${ipHash}`), mark(`visits/online/${ipHash}`)]);
        }
      }
    } else if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    } else {
      return res.status(405).json({ error: 'GET or POST' });
    }
    const [on, today, total] = await Promise.all([online(), countAll(`visits/day/${day}/`), countAll('visits/all/')]);
    return res.status(200).json({ online: on, today, total });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

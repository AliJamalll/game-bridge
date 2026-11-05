// How many Macs have Game Bridger open right now (served by api/event.js through a rewrite at /api/live).
// POST { device } -> the app's heartbeat (only sent when "Send usage" is on); GET -> counts only.
// Both answer { online }. A Mac counts for 150 s after its last heartbeat; only a shortened hash of its ID is kept.
import { list, put } from '@vercel/blob';
import { body as parse, client, rateLimited } from './_security.js';

const ONLINE_MS = 150 * 1000;
const DEVICE = /^[0-9a-f]{64}$/;

async function online() {
  const since = Date.now() - ONLINE_MS;
  let n = 0, cursor;
  do {
    const r = await list({ prefix: 'live/', cursor, limit: 1000 });
    n += r.blobs.filter(b => new Date(b.uploadedAt).getTime() >= since).length;
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return n;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      const device = String(parse(req)?.device || '');
      if (!DEVICE.test(device)) return res.status(400).json({ error: 'bad request' });
      if (!(await rateLimited('live', client(req).ipHash, 120))) {
        await put(`live/${device.slice(0, 16)}`, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
      }
    } else if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
    } else {
      return res.status(405).json({ error: 'GET or POST' });
    }
    return res.status(200).json({ online: await online() });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

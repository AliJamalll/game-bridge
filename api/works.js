// Public totals of player ratings: which games run well on Game Bridge.
import { list } from '@vercel/blob';

async function listAll(prefix) {
  const out = []; let cursor;
  do { const r = await list({ prefix, cursor, limit: 1000 }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out;
}

export default async function handler(req, res) {
  try {
    const [ratings, names] = await Promise.all([listAll('ratings/'), listAll('games/')]);
    const games = {};
    for (const b of names) { const [, id, n] = b.pathname.split('/'); games[id] = { appid: id, name: decodeURIComponent(n), up: 0, down: 0 }; }
    for (const b of ratings) {
      const [, id, file] = b.pathname.split('/');
      if (!games[id]) continue;
      if (file.endsWith('.up')) games[id].up++; else if (file.endsWith('.down')) games[id].down++;
    }
    const result = Object.values(games).filter(g => g.up + g.down > 0)
      .sort((a, b) => (b.up - b.down) - (a.up - a.down) || b.up - a.up);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ games: result });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

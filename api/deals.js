// Game deals for the website and app: the cheapest current price for games that run on Game Bridge.
// Prices come from CheapShark (free API; please keep the credit on the page). Links use our affiliate tag
// for a store when AFFILIATE_<storeID> is set in Vercel (a URL template with {title} and/or {steamAppID});
// otherwise they go through CheapShark's own link to the store.
import { list } from '@vercel/blob';

const UA = 'GameBridge/1.0 (ali.jamal.software@gmail.com)';
const STORES = { 1: 'Steam', 2: 'GamersGate', 3: 'Green Man Gaming', 11: 'Humble Store', 15: 'Fanatical',
                 21: 'WinGameStore', 23: 'GameBillet', 27: 'Gamesplanet', 28: 'Gamesload', 30: 'IndieGala', 35: 'DreamGame' };
// Big DirectX 9–11 games without kernel anti-cheat (same list as the trailers), plus whatever players rate "runs well".
const CURATED = ['620', '550', '220', '489830', '292030', '377160', '374320', '22380', '814380', '570940', '208650', '205100'];

const cs = (path) => fetch(`https://www.cheapshark.com/api/1.0/${path}`, { headers: { 'User-Agent': UA } }).then(r => r.ok ? r.json() : null);

async function ratedWell() {
  const out = new Map(); let cursor;
  do {
    const r = await list({ prefix: 'ratings/', cursor, limit: 1000 });
    for (const b of r.blobs) { const [, id, f] = b.pathname.split('/'); const e = out.get(id) || { up: 0, down: 0 }; f.endsWith('.up') ? e.up++ : e.down++; out.set(id, e); }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

function link(storeID, dealID, title, appid) {
  const tpl = process.env[`AFFILIATE_${storeID}`];
  if (tpl) return tpl.replace('{title}', encodeURIComponent(title)).replace('{steamAppID}', appid);
  if (String(storeID) === '1') return `https://store.steampowered.com/app/${appid}/`;   // Steam itself: link straight there
  return `https://www.cheapshark.com/redirect?dealID=${dealID}`;
}

export default async function handler(req, res) {
  try {
    const ratings = await ratedWell().catch(() => new Map());
    const good = [...ratings].filter(([, e]) => e.up > 0 && e.up >= e.down * 3).sort((a, b) => b[1].up - a[1].up).map(([id]) => id);
    const ids = [...new Set([...good, ...CURATED])].slice(0, 16);
    const deals = (await Promise.all(ids.map(async appid => {
      const g = (await cs(`games?steamAppID=${appid}`))?.[0];
      if (!g) return null;
      const info = await cs(`games?id=${g.gameID}`);
      const best = (info?.deals || []).filter(d => STORES[d.storeID]).sort((a, b) => Number(a.price) - Number(b.price))[0];
      if (!best) return null;
      const r = ratings.get(appid);
      return {
        appid, title: info.info?.title || g.external, price: Number(best.price), retail: Number(best.retailPrice),
        savings: Math.round(Number(best.savings)), store: STORES[best.storeID],
        link: link(best.storeID, best.dealID, info.info?.title || g.external, appid),
        runsWell: !!(r && r.up > 0 && r.up >= r.down * 3), ratings: r ? r.up + r.down : 0,
      };
    }))).filter(Boolean).sort((a, b) => (b.runsWell - a.runsWell) || (b.savings - a.savings));
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json({ deals, source: 'CheapShark' });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

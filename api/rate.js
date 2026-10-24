// Players rate how a game ran on Game Bridge: one vote per Mac per game.
// Stored as empty marker blobs whose path holds everything, so totals need only a listing:
//   ratings/<appid>/<device>.<up|down>   and   games/<appid>/<url-encoded name>
// The name shown on the website comes from Steam, not from the app, and one network can vote for a game
// from at most VOTERS_PER_NETWORK Macs, so made-up Macs can't push a game up or rename it.
import { put, del, list } from '@vercel/blob';
import { body as parse, client, overLimit, rateLimited } from './_security.js';

const DEVICE = /^[0-9a-f]{64}$/;
const APPID = /^\d{1,10}$/;
const VOTERS_PER_NETWORK = 3;
const PER_HOUR = 30;

async function steamName(appid) {
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`,
    { signal: AbortSignal.timeout(5000) }).catch(() => null);
  const d = r?.ok ? (await r.json().catch(() => null))?.[appid] : null;
  return d?.success && typeof d.data?.name === 'string' ? d.data.name.slice(0, 80) : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = parse(req);
  const device = String(body?.device || ''), appid = String(body?.appid || ''), vote = String(body?.vote || '');
  if (!DEVICE.test(device) || !APPID.test(appid) || !['up', 'down'].includes(vote)) {
    return res.status(400).json({ error: 'bad request' });
  }
  const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' };
  try {
    const who = client(req);
    if (await rateLimited('rate', who.ipHash, PER_HOUR)) return res.status(429).json({ error: 'too many requests' });
    if (await overLimit(`rate/${appid}`, who.ipHash, VOTERS_PER_NETWORK, device)) return res.status(200).json({ ok: false, limited: true });
    // Only games Steam knows get a name, and only named games show up on the website. If Steam doesn't
    // answer, the vote still counts and a later vote adds the name.
    if (!(await list({ prefix: `games/${appid}/`, limit: 1 })).blobs.length) {
      const name = await steamName(appid);
      if (name) await put(`games/${appid}/${encodeURIComponent(name)}`, '1', opts);
    }
    const other = vote === 'up' ? 'down' : 'up';
    const old = await list({ prefix: `ratings/${appid}/${device}.${other}` });
    if (old.blobs.length) await del(old.blobs.map(b => b.url));
    await put(`ratings/${appid}/${device}.${vote}`, '1', opts);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

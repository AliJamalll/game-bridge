// Players rate how a game ran on Game Bridge: one vote per Mac per game.
// Stored as empty marker blobs whose path holds everything, so totals need only a listing:
//   ratings/<appid>/<device>.<up|down>   and   games/<appid>/<url-encoded name>
import { put, del, list } from '@vercel/blob';

const DEVICE = /^[0-9a-f]{64}$/;
const APPID = /^\d{1,10}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const device = String(body.device || ''), appid = String(body.appid || ''), vote = String(body.vote || '');
  const name = String(body.name || '').slice(0, 80);
  if (!DEVICE.test(device) || !APPID.test(appid) || !['up', 'down'].includes(vote) || !name) {
    return res.status(400).json({ error: 'bad request' });
  }
  const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' };
  try {
    const other = vote === 'up' ? 'down' : 'up';
    const old = await list({ prefix: `ratings/${appid}/${device}.${other}` });
    if (old.blobs.length) await del(old.blobs.map(b => b.url));
    await put(`ratings/${appid}/${device}.${vote}`, '1', opts);
    await put(`games/${appid}/${encodeURIComponent(name)}`, '1', opts);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

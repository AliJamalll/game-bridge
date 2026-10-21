// Founders offer: the first 500 Macs, or until the deadline, get Game Bridge free for life.
// GET  -> { claimed, cap, endsAt, open }                    (public, for the website counter)
// POST { device } -> { founder, signature? , claimed, cap, open }
// A seat is an empty blob "founders/<device>". The signature (Ed25519 over "gamebridge-founder:<device>",
// key in FOUNDERS_SIGNING_KEY) lets the app trust a seat offline without anyone being able to forge one.
import { list, put, head } from '@vercel/blob';
import { createPrivateKey, sign } from 'node:crypto';

const CAP = 500;
const ENDS_AT = Date.parse('2026-12-05T21:59:59Z');   // December 5, 23:59 Cairo time
const DEVICE = /^[0-9a-f]{64}$/;

async function count() {
  let n = 0, cursor;
  do { const r = await list({ prefix: 'founders/', cursor, limit: 1000 }); n += r.blobs.length; cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return n;
}

function signature(device) {
  const key = createPrivateKey({ key: Buffer.from(process.env.FOUNDERS_SIGNING_KEY, 'base64'), format: 'der', type: 'pkcs8' });
  return sign(null, Buffer.from(`gamebridge-founder:${device}`), key).toString('base64');
}

async function isFounder(device) {
  try { await head(`founders/${device}`); return true; } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const claimed = await count();
    const open = claimed < CAP && Date.now() < ENDS_AT;
    const base = { claimed: Math.min(claimed, CAP), cap: CAP, endsAt: new Date(ENDS_AT).toISOString(), open };
    if (req.method === 'GET') return res.status(200).json(base);
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const device = String(body.device || '');
    if (!DEVICE.test(device)) return res.status(400).json({ error: 'bad device' });

    if (await isFounder(device)) return res.status(200).json({ ...base, founder: true, signature: signature(device) });
    if (!open) return res.status(200).json({ ...base, founder: false });
    await put(`founders/${device}`, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' })
      .catch(() => {});   // already claimed by a parallel request: fine
    return res.status(200).json({ ...base, claimed: Math.min(claimed + 1, CAP), open: claimed + 1 < CAP && Date.now() < ENDS_AT,
                                  founder: true, signature: signature(device) });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

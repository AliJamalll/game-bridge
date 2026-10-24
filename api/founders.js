// Founders offer: the first 500 Macs, or until the deadline, get Game Bridge free for life.
// GET  -> { claimed, cap, endsAt, open }                    (public, for the website counter; cached for a minute)
// POST { device } -> { founder, signature? , claimed, cap, open }
// A seat is an empty blob "founders/<device>". The signature (Ed25519 over "gamebridge-founder:<device>",
// key in FOUNDERS_SIGNING_KEY) lets the app trust a seat offline without anyone being able to forge one.
// New seats are limited per network (5 ever) and overall (NEW_PER_HOUR), so a script can't take them all at once.
import { list, put, head } from '@vercel/blob';
import { body as parse, client, overLimit, rateLimited, signed } from './_security.js';

const CAP = 500;
const ENDS_AT = Date.parse('2026-12-05T21:59:59Z');   // December 5, 23:59 Cairo time
const DEVICE = /^[0-9a-f]{64}$/;
const NEW_PER_HOUR = 60;

async function count() {
  let n = 0, cursor;
  do { const r = await list({ prefix: 'founders/', cursor, limit: 1000 }); n += r.blobs.length; cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return n;
}

const signature = (device) => signed(`gamebridge-founder:${device}`);

async function isFounder(device) {
  try { await head(`founders/${device}`); return true; } catch { return false; }
}

function summary(claimed) {
  return { claimed: Math.min(claimed, CAP), cap: CAP, endsAt: new Date(ENDS_AT).toISOString(), open: claimed < CAP && Date.now() < ENDS_AT };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(summary(await count()));
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

    const body = parse(req);
    const device = String(body?.device || '');
    if (!DEVICE.test(device)) return res.status(400).json({ error: 'bad device' });

    // Existing seats are confirmed without counting all of them; once the offer is over nothing is counted.
    if (await isFounder(device)) return res.status(200).json({ founder: true, signature: signature(device) });
    if (Date.now() >= ENDS_AT) return res.status(200).json({ founder: false, open: false });
    const claimed = await count();
    const base = summary(claimed);
    if (!base.open) return res.status(200).json({ ...base, founder: false });
    const who = client(req);
    if (await overLimit('founders', who.ipHash, 5, device) || await rateLimited('founders', 'all', NEW_PER_HOUR)) {
      return res.status(200).json({ ...base, founder: false, limited: true });
    }
    await put(`founders/${device}`, JSON.stringify({ at: new Date().toISOString(), ...who }), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' })
      .catch(() => {});   // already claimed by a parallel request: fine
    return res.status(200).json({ ...summary(claimed + 1), founder: true, signature: signature(device) });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

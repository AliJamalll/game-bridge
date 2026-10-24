// Server-side record of when each Mac started its free trial, so deleting the
// app's local state doesn't restart it. The app sends a SHA-256 of the Mac's
// hardware UUID (never the UUID itself) and its locally stored start.
// The reply carries an Ed25519 signature over "gamebridge-trial:<device>:<start>" (whole seconds):
// the app runs a trial only with it, so editing or deleting the local state while offline doesn't help either.
import { get, put } from '@vercel/blob';
import { bonusDays, signBonus } from './_bonus.js';
import { body as parse, client, rateLimited, signed } from './_security.js';

const DEVICE = /^[0-9a-f]{64}$/;
const NEW_PER_HOUR = 10;   // new trials one network can start in an hour

async function readStart(path) {
  const res = await get(path, { access: 'private', useCache: false });
  if (!res) return null;
  const start = Math.floor(Number(await new Response(res.stream).text()));
  return Number.isFinite(start) ? { start, etag: res.blob.etag } : null;
}

async function bonus(device) {
  try { const b = await bonusDays(device); return { bonusDays: b.days, bonusSig: signBonus(device, b.days) }; }
  catch { return {}; }
}

const reply = async (res, device, start, now) =>
  res.status(200).json({ start, startSig: signed(`gamebridge-trial:${device}:${start}`), now, ...(await bonus(device)) });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = parse(req);
  const device = String(body?.device || '');
  if (!DEVICE.test(device)) return res.status(400).json({ error: 'bad device' });

  const now = Math.floor(Date.now() / 1000);
  // A client start in the future (or missing) counts as "now"; an earlier one only shortens its own trial.
  let claimed = Math.floor(Number(body.start));
  if (!Number.isFinite(claimed) || claimed > now) claimed = now;

  const path = `trials/${device}`;
  try {
    let record = await readStart(path);
    if (!record) {
      if (await rateLimited('trial', client(req).ipHash, NEW_PER_HOUR)) return res.status(429).json({ error: 'too many requests' });
      try {
        await put(path, String(claimed), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' });
        return reply(res, device, claimed, now);
      } catch {
        record = await readStart(path); // Another request created it first.
        if (!record) throw new Error('write failed');
      }
    }
    if (claimed < record.start) {
      // Keep the earliest start ever reported (e.g. existing trials from before this server).
      await put(path, String(claimed), { access: 'private', addRandomSuffix: false, allowOverwrite: true, ifMatch: record.etag, contentType: 'text/plain' }).catch(() => {});
      return reply(res, device, claimed, now);
    }
    return reply(res, device, record.start, now);
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

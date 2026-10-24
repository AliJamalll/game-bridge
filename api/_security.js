// Fraud prevention: a salted one-way hash of the visitor's IP plus their country (from Vercel's edge),
// simple per-network limits so one network can't farm founder seats or invite rewards, and hourly request
// limits so nobody can flood the API. Raw IP addresses are never stored.
import { list, put } from '@vercel/blob';
import { createHash, createHmac, createPrivateKey, sign } from 'node:crypto';

function signingKey() {
  const key = process.env.FOUNDERS_SIGNING_KEY;
  if (!key) throw new Error('FOUNDERS_SIGNING_KEY is not set');
  return key;
}

/** Ed25519 signature (base64) the app checks with AppConfig.foundersPublicKey. */
export function signed(text) {
  const key = createPrivateKey({ key: Buffer.from(signingKey(), 'base64'), format: 'der', type: 'pkcs8' });
  return sign(null, Buffer.from(text), key).toString('base64');
}

export function client(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  // Derived from the signing key, so there's no extra secret to set, but never the key itself.
  const salt = createHmac('sha256', signingKey()).update('gamebridge-ip-salt').digest('hex');
  return {
    ipHash: createHash('sha256').update(`gb-ip:${salt}:${ip}`).digest('hex').slice(0, 24),
    country: String(req.headers['x-vercel-ip-country'] || '').slice(0, 2),
  };
}

/** The JSON body, or null when it isn't valid JSON (answer 400). */
export function body(req) {
  if (typeof req.body !== 'string') return req.body && typeof req.body === 'object' ? req.body : {};
  try { const b = JSON.parse(req.body || '{}'); return b && typeof b === 'object' ? b : null; } catch { return null; }
}

/** True if this network already used `max` of `kind`; otherwise records one use. */
export async function overLimit(kind, ipHash, max, id) {
  const used = (await list({ prefix: `limits/${kind}/${ipHash}/`, limit: max + 1 })).blobs.length;
  if (used >= max) return true;
  await put(`limits/${kind}/${ipHash}/${id}`, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
  return false;
}

/** True if `who` (a network's ipHash, or "all") already made `max` requests of `kind` this hour; otherwise counts this one.
 *  Each request takes a numbered slot that can be created only once, so parallel requests can't go over the limit.
 *  Past hours are deleted by api/cleanup.js. */
export async function rateLimited(kind, who, max) {
  const prefix = `limits/hourly/${new Date().toISOString().slice(0, 13)}/${kind}/${who}/`;
  for (let n = (await list({ prefix, limit: max })).blobs.length; n < max; n++) {
    try {
      await put(prefix + n, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' });
      return false;
    } catch { /* taken by a parallel request: try the next slot */ }
  }
  return true;
}

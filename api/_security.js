// Fraud prevention: a salted one-way hash of the visitor's IP plus their country (from Vercel's edge),
// and simple per-network limits so one network can't farm founder seats or invite rewards.
// Raw IP addresses are never stored.
import { list, put } from '@vercel/blob';
import { createHash } from 'node:crypto';

export function client(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const salt = process.env.FOUNDERS_SIGNING_KEY || 'gb';
  return {
    ipHash: createHash('sha256').update(`gb-ip:${salt}:${ip}`).digest('hex').slice(0, 24),
    country: String(req.headers['x-vercel-ip-country'] || '').slice(0, 2),
  };
}

/** True if this network already used `max` of `kind`; otherwise records one use. */
export async function overLimit(kind, ipHash, max, id) {
  const used = (await list({ prefix: `limits/${kind}/${ipHash}/`, limit: max + 1 })).blobs.length;
  if (used >= max) return true;
  await put(`limits/${kind}/${ipHash}/${id}`, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
  return false;
}

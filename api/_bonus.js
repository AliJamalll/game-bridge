// Shared helpers for invite rewards. Files starting with "_" are not routes on Vercel.
import { list, head } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { signed } from './_security.js';

export const PER_FRIEND = 30, MAX_FRIENDS = 3, INVITED_BONUS = 10;
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O/1/I/L

/** Short, stable invite code for a Mac (same algorithm in the app). */
export function inviteCode(device) {
  const h = createHash('sha256').update(`gamebridge-invite:${device}`).digest();
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[h[i] % ALPHABET.length];
  return out;
}

export async function exists(path) { try { await head(path); return true; } catch { return false; } }

/** Extra free days earned by a Mac: 30 per friend (max 3) + 10 if it joined with an invite. */
export async function bonusDays(device) {
  const friends = (await list({ prefix: `invites/by/${device}/`, limit: 50 })).blobs.length;
  const invited = await exists(`invites/redeemed/${device}`);
  return { days: Math.min(friends, MAX_FRIENDS) * PER_FRIEND + (invited ? INVITED_BONUS : 0), friends, invited };
}

/** Signature the app checks, so a bonus can't be edited on the Mac. */
export function signBonus(device, days) {
  return signed(`gamebridge-bonus:${device}:${days}`);
}

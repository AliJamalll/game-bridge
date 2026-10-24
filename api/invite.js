// Invites: "invite 3 friends, get 3 months free".
// POST { action: "register", device }           -> { code, friends, max }
// POST { action: "redeem", device, code }         -> { ok, bonusDays } or { error }
// Against farming with made-up Macs: the friend's Mac must have started a trial (api/trial.js), at most 3 invites
// are used per network, and a friend on the same network the inviter last registered from doesn't count.
import { put, list, get } from '@vercel/blob';
import { inviteCode, exists, bonusDays, signBonus, MAX_FRIENDS, INVITED_BONUS } from './_bonus.js';
import { body as parse, client, overLimit, rateLimited } from './_security.js';

const DEVICE = /^[0-9a-f]{64}$/;
const CODE = /^[2-9A-HJKMNP-Z]{8}$/;
const NEW_PLAYER_DAYS = 14;
const PER_HOUR = 30;
const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' };

async function text(path) {
  const r = await get(path, { access: 'private', useCache: false }).catch(() => null);
  return r ? new Response(r.stream).text() : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = parse(req);
  const device = String(body?.device || '');
  if (!DEVICE.test(device)) return res.status(400).json({ error: 'bad device' });
  try {
    const who = client(req);
    if (await rateLimited('invite', who.ipHash, PER_HOUR)) return res.status(429).json({ error: 'Too many requests. Try again in a moment.' });
    if (body.action === 'register') {
      const code = inviteCode(device);
      await put(`invites/codes/${code}/${device}`, JSON.stringify({ ipHash: who.ipHash }), opts);
      const b = await bonusDays(device);
      return res.status(200).json({ code, friends: b.friends, max: MAX_FRIENDS, bonusDays: b.days, bonusSig: signBonus(device, b.days) });
    }
    if (body.action === 'redeem') {
      const code = String(body.code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (!CODE.test(code)) return res.status(200).json({ error: "That code doesn't look right. It has 8 letters and numbers." });
      const owners = (await list({ prefix: `invites/codes/${code}/`, limit: 2 })).blobs;
      if (!owners.length) return res.status(200).json({ error: "We couldn't find that invite code." });
      const referrer = owners[0].pathname.split('/').pop();
      if (referrer === device) return res.status(200).json({ error: "That's your own invite code. Send it to a friend!" });
      if (await exists(`invites/redeemed/${device}`)) return res.status(200).json({ error: 'This Mac already used an invite code.' });
      const start = Number(await text(`trials/${device}`));
      if (!start) return res.status(200).json({ error: 'Open Game Bridge once while online, then try the code again.' });
      if (Date.now() / 1000 - start > NEW_PLAYER_DAYS * 86400) return res.status(200).json({ error: 'Invite codes are for new players.' });
      // Registrations from before this check hold "1" instead of the inviter's network.
      const owner = await text(owners[0].pathname).then(t => { try { return JSON.parse(t); } catch { return null; } });
      if (owner?.ipHash === who.ipHash) return res.status(200).json({ error: 'Invite codes are for friends on another network.' });
      if (await overLimit('invites', who.ipHash, 3, device)) return res.status(200).json({ error: 'Too many invite codes were used on this network.' });
      await put(`invites/redeemed/${device}`, JSON.stringify({ code, at: new Date().toISOString(), ...who }), opts);
      await put(`invites/by/${referrer}/${device}`, '1', opts);
      const b = await bonusDays(device);
      return res.status(200).json({ ok: true, added: INVITED_BONUS, bonusDays: b.days, bonusSig: signBonus(device, b.days) });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(503).json({ error: 'Could not reach the invite service. Try again in a moment.' });
  }
}

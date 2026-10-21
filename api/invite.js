// Invites: "invite 3 friends, get 3 months free".
// POST { action: "register", device }           -> { code, friends, max }
// POST { action: "redeem", device, code }         -> { ok, bonusDays } or { error }
import { put, list, get } from '@vercel/blob';
import { inviteCode, exists, bonusDays, signBonus, MAX_FRIENDS, INVITED_BONUS } from './_bonus.js';

const DEVICE = /^[0-9a-f]{64}$/;
const CODE = /^[2-9A-HJKMNP-Z]{8}$/;
const NEW_PLAYER_DAYS = 14;
const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const device = String(body.device || '');
  if (!DEVICE.test(device)) return res.status(400).json({ error: 'bad device' });
  try {
    if (body.action === 'register') {
      const code = inviteCode(device);
      await put(`invites/codes/${code}/${device}`, '1', opts);
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
      const trial = await get(`trials/${device}`, { access: 'private', useCache: false }).catch(() => null);
      if (trial) {
        const start = Number(await new Response(trial.stream).text());
        if (Number.isFinite(start) && Date.now() / 1000 - start > NEW_PLAYER_DAYS * 86400) {
          return res.status(200).json({ error: 'Invite codes are for new players.' });
        }
      }
      await put(`invites/redeemed/${device}`, code, opts);
      await put(`invites/by/${referrer}/${device}`, '1', opts);
      const b = await bonusDays(device);
      return res.status(200).json({ ok: true, added: INVITED_BONUS, bonusDays: b.days, bonusSig: signBonus(device, b.days) });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(503).json({ error: 'Could not reach the invite service. Try again in a moment.' });
  }
}

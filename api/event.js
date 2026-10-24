// Anonymous usage funnel: each Mac counts once per event per day. No content, no personal data.
// POST { device, event }
import { put } from '@vercel/blob';
import { body as parse, client, rateLimited } from './_security.js';

const DEVICE = /^[0-9a-f]{64}$/;
const PER_HOUR = 200;   // events one network can send in an hour (a launch sends a few)
export const EVENTS = ['app_open', 'setup_start', 'setup_done', 'setup_fail', 'steam_launch', 'game_launch',
  'paywall_view', 'plan_monthly', 'plan_yearly', 'license_activated', 'invite_copied', 'invite_redeemed',
  'rating_sent', 'feedback_sent', 'uninstall'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = parse(req);
  const device = String(b?.device || ''), event = String(b?.event || '');
  if (!DEVICE.test(device) || !EVENTS.includes(event)) return res.status(400).json({ error: 'bad request' });
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (await rateLimited('event', client(req).ipHash, PER_HOUR)) return res.status(429).json({ error: 'too many requests' });
    await put(`events/${day}/${event}/${device.slice(0, 16)}`, '1',
      { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

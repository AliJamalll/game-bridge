// Feedback and the product-market-fit survey from the app. Stored privately; read on the admin page.
// POST { device, kind: "feedback" | "survey", text?, email?, answer?, log?, version?, macos? }
import { put } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const DEVICE = /^[0-9a-f]{64}$/;
const ANSWERS = ['very', 'somewhat', 'not'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const device = String(b.device || '');
  const kind = b.kind === 'survey' ? 'survey' : 'feedback';
  if (!DEVICE.test(device)) return res.status(400).json({ error: 'bad device' });
  const entry = {
    at: new Date().toISOString(), kind, device: device.slice(0, 12),
    text: String(b.text || '').slice(0, 4000), email: String(b.email || '').slice(0, 200),
    answer: ANSWERS.includes(b.answer) ? b.answer : undefined,
    log: String(b.log || '').slice(-20000), version: String(b.version || '').slice(0, 20), macos: String(b.macos || '').slice(0, 40),
  };
  if (kind === 'feedback' && !entry.text.trim()) return res.status(400).json({ error: 'empty' });
  if (kind === 'survey' && !entry.answer) return res.status(400).json({ error: 'bad answer' });
  try {
    // Surveys: one answer per Mac (the latest wins). Feedback: every message is kept.
    const path = kind === 'survey' ? `survey/${device}` : `feedback/${Date.now()}-${randomBytes(4).toString('hex')}.json`;
    await put(path, JSON.stringify(entry), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

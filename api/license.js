// License keys, checked here instead of in the app, so a faked license server reply (a proxy with its own
// root certificate, or an edited state file) can't unlock the app.
// POST { action: "activate", device, key, label }   -> { valid, instance, expiresAt, checkedAt, signature } or { valid: false, error }
// POST { action: "validate", device, key, instance } -> same
// POST { action: "deactivate", device, key, instance } -> { ok }
// The signature (Ed25519 over "gamebridge-license:<device>:<instance>:<expiresAt or 0>:<checkedAt>", whole seconds,
// key in FOUNDERS_SIGNING_KEY) is what the app trusts offline, for its grace period after checkedAt.
// A license server that is down or rate limiting us answers 503, which the app treats as being offline.
// Each network gets a few checks an hour, so nobody can guess keys through us or get our server rate limited by Polar.
import { body as parse, client, rateLimited, signed } from './_security.js';

const PROVIDER = 'polar';   // or 'lemonSqueezy'
/** Polar organization (Settings → General) and license key benefit; keys for anything else are rejected. */
const POLAR_ORG = 'bb33033b-41ed-4af1-b329-188ed1943837';
const POLAR_BENEFIT = 'afc47a32-f481-498e-8920-15afc85e7f21';
/** Lemon Squeezy product (both plans are variants of it); other products are rejected. */
const LEMON_PRODUCT = 1452473;

const DEVICE = /^[0-9a-f]{64}$/;
const PER_HOUR = 20;

class Offline extends Error {}

async function call(url, init) {
  const r = await fetch(url, { ...init, method: 'POST', headers: { Accept: 'application/json', ...init.headers } }).catch(() => null);
  if (!r || r.status >= 500 || r.status === 429) throw new Offline();
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const seconds = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? Math.floor(t / 1000) : 0; };

// Polar customer-portal license keys (https://polar.sh/docs/features/benefits/license-keys).
// Subscription keys have no expiry; Polar revokes them when the subscription ends.
const polar = {
  post: (endpoint, fields) => call(`https://api.polar.sh/v1/customer-portal/license-keys/${endpoint}`,
    { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, organization_id: POLAR_ORG }) }),
  error(status, json) {
    if (status === 404) return 'License key not found.';
    if (status === 403) return json.detail || 'This license key is already active on the maximum number of Macs.';
    return (typeof json.detail === 'string' && json.detail) || 'This license key is not valid.';
  },
  check(lk, instance) {
    const granted = lk.status === 'granted';
    const valid = granted && lk.organization_id === POLAR_ORG && (!POLAR_BENEFIT || lk.benefit_id === POLAR_BENEFIT);
    return { valid, instance, expiresAt: seconds(lk.expires_at), error: granted ? undefined : 'This subscription is no longer active.' };
  },
  async activate(key, label) {
    const { status, json } = await this.post('activate', { key, label });
    if (status !== 200 || typeof json.id !== 'string' || !json.license_key) return { valid: false, error: this.error(status, json) };
    return this.check(json.license_key, json.id);
  },
  async validate(key, instance) {
    const { status, json } = await this.post('validate', { key, activation_id: instance });
    if (status !== 200) return { valid: false, error: this.error(status, json) };
    return this.check(json, instance);
  },
  deactivate: (key, instance) => polar.post('deactivate', { key, activation_id: instance }),
};

// Lemon Squeezy License API (https://docs.lemonsqueezy.com/api/license-api).
const lemonSqueezy = {
  post: (endpoint, fields) => call(`https://api.lemonsqueezy.com/v1/licenses/${endpoint}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }),
  product: (json) => json.meta?.product_id === LEMON_PRODUCT,
  async activate(key, label) {
    const { json } = await this.post('activate', { license_key: key, instance_name: label });
    const instance = json.instance?.id;
    if (json.activated !== true || !this.product(json) || typeof instance !== 'string') return { valid: false, error: json.error };
    return { valid: true, instance, expiresAt: seconds(json.license_key?.expires_at) };
  },
  async validate(key, instance) {
    const { json } = await this.post('validate', { license_key: key, instance_id: instance });
    return { valid: json.valid === true && this.product(json), instance, expiresAt: seconds(json.license_key?.expires_at) };
  },
  deactivate: (key, instance) => lemonSqueezy.post('deactivate', { license_key: key, instance_id: instance }),
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = parse(req);
    if (!body) return res.status(400).json({ error: 'bad request' });
    const device = String(body.device || ''), key = String(body.key || '').trim().slice(0, 200);
    const instance = String(body.instance || '').slice(0, 200), label = String(body.label || 'Mac').slice(0, 100);
    if (!DEVICE.test(device) || !key) return res.status(400).json({ error: 'bad request' });
    const backend = PROVIDER === 'polar' ? polar : lemonSqueezy;
    if (await rateLimited('license', client(req).ipHash, PER_HOUR)) {
      // A rejected validate would make the app drop its license, so that one answers like an outage.
      if (body.action === 'activate') return res.status(200).json({ valid: false, error: 'Too many attempts from this network. Try again in an hour.' });
      return res.status(429).json({ error: 'too many requests' });
    }

    if (body.action === 'deactivate') {
      if (instance) await backend.deactivate(key, instance);
      return res.status(200).json({ ok: true });
    }
    let check;
    if (body.action === 'activate') check = await backend.activate(key, label);
    else if (body.action === 'validate' && instance) check = await backend.validate(key, instance);
    else return res.status(400).json({ error: 'bad request' });

    const checkedAt = Math.floor(Date.now() / 1000);
    if (check.expiresAt && check.expiresAt <= checkedAt) check = { ...check, valid: false };
    if (!check.valid) return res.status(200).json({ valid: false, error: check.error });
    return res.status(200).json({ valid: true, instance: check.instance, expiresAt: check.expiresAt, checkedAt,
      signature: signed(`gamebridge-license:${device}:${check.instance}:${check.expiresAt}:${checkedAt}`) });
  } catch (e) {
    return res.status(503).json({ error: 'unavailable' });
  }
}

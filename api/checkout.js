// Checkout: GET /api/checkout?plan=monthly|yearly|lifetime|tip redirects to that plan's Polar checkout link.
// Visitors from countries where $6 a month is a lot (Vercel's country header) get REGIONAL_CODE prefilled,
// a Polar discount code. GET /api/checkout?plan=info answers { regional, percent, lifetime, tip } for the site.
// A plan with no link yet (lifetime, tip) goes to the home page's pricing instead.

/** Polar checkout links (Products → Checkout Links). */
const LINKS = {
  monthly: 'https://buy.polar.sh/polar_cl_ynXvnukoEaEQUIqNQ3CpuLeob7SaWtkUZClLr0aEEEZ',
  yearly: 'https://buy.polar.sh/polar_cl_D91KMyZfUvxdmtPjWtK6o9lNXSX5J5O2KoAuF4OmkFT',
  lifetime: '',   // one-time product with the same license key benefit as the subscriptions
  tip: '',        // pay-what-you-want product, no license key
};

/** Polar discount code (Products → Discounts) and its percentage, shown on the site. Empty = no regional prices. */
const REGIONAL_CODE = '';
const REGIONAL_PERCENT = 40;

/** Countries with lower purchasing power (ISO 3166-1 alpha-2). */
const REGIONAL = new Set([
  // Middle East and North Africa
  'EG', 'MA', 'DZ', 'TN', 'LY', 'SD', 'JO', 'LB', 'SY', 'IQ', 'YE', 'PS', 'IR',
  // South and Southeast Asia
  'IN', 'PK', 'BD', 'LK', 'NP', 'ID', 'PH', 'VN', 'MM', 'KH',
  // Europe and Central Asia
  'TR', 'UA', 'BY', 'GE', 'AM', 'AZ', 'KZ', 'UZ', 'KG', 'MD', 'RS', 'BA', 'MK', 'AL',
  // Latin America
  'BR', 'AR', 'CO', 'PE', 'MX', 'CL', 'EC', 'BO', 'VE', 'PY',
  // Africa
  'NG', 'KE', 'GH', 'ET', 'TZ', 'UG', 'ZA', 'SN', 'CM',
]);

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const regional = Boolean(REGIONAL_CODE) && REGIONAL.has(country);
  const plan = String(req.query.plan || '');

  if (plan === 'info') return res.status(200).json({ regional, percent: regional ? REGIONAL_PERCENT : 0, lifetime: Boolean(LINKS.lifetime), tip: Boolean(LINKS.tip) });

  const link = Object.hasOwn(LINKS, plan) ? LINKS[plan] : '';
  if (!link) return res.redirect(302, '/#pricing');
  const url = new URL(link);
  if (regional && plan !== 'tip') url.searchParams.set('discount_code', REGIONAL_CODE);
  return res.redirect(302, url.toString());
}

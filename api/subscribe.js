// api/subscribe.js
// One endpoint for every form on the site (it stays one function to keep under
// Vercel's 12-function limit):
//   { email, source }                         newsletter / map sign-up -> beehiiv
//   { kind: 'contact', name, email, ... }     contact form -> Airtable "Messages"
//
// Bot checks, no captcha needed:
//   - hp: a hidden "website" field people never see. Bots fill it in.
//   - t:  milliseconds between the form loading and being sent. Missing or under
//         2.5s is a bot (real forms on the site always send it).
// Bots that fail get a normal "success" reply, so they learn nothing.

const BEEHIIV_PUB = 'pub_98ef614b-1c4e-46df-b312-dce94dc248c9';
const BEEHIIV_KEY = process.env.BEEHIIV_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';
const MESSAGES_TABLE = 'Messages';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(v, max) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, max);
}

function looksLikeBot(body) {
  if (clean(body.hp, 200)) return true;
  const t = Number(body.t);
  if (body.t == null || !isFinite(t) || t < 2500) return true;
  return false;
}

async function saveMessage(body) {
  const first = clean(body.firstName, 80);
  const last = clean(body.lastName, 80);
  const fields = {
    Name: (first + ' ' + last).trim() || clean(body.name, 160),
    Email: clean(body.email, 200),
    Message: clean(body.message, 5000),
    Topic: clean(body.topic, 80),
    Received: new Date().toISOString(),
    Status: 'New'
  };
  const phone = clean(body.phone, 40);
  if (phone) fields.Phone = phone;
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(MESSAGES_TABLE)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }], typecast: true })
  });
  if (!r.ok) throw new Error('Airtable ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function subscribe(email) {
  const r = await fetch(`https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BEEHIIV_KEY}` },
    body: JSON.stringify({ email, reactivate_existing: true, send_welcome_email: true })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || 'Subscription failed'), { status: 400 });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://slowcasa.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const email = clean(body.email, 200);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (looksLikeBot(body)) return res.status(200).json({ success: true });

  try {
    if (body.kind === 'contact') {
      if (clean(body.message, 5000).length < 2) return res.status(400).json({ error: 'Message required' });
      await saveMessage(body);
    } else {
      await subscribe(email);
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('subscribe', body.kind || 'newsletter', err.message);
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
  }
};

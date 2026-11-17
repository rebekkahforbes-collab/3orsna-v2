/* ============================================================
   backend/http-functions.js — WhatsApp webhook
   Callback URL to give Meta:  https://www.3orsna.com/_functions/whatsapp
   GET  = Meta's one-time verification handshake
   POST = delivery statuses and guest replies (Accept / Decline taps)
   ============================================================ */
import { ok, forbidden } from 'wix-http-functions';
import crypto from 'crypto';
import { WA } from 'backend/config';
import { secretValue } from 'backend/whatsapp';
import { handleWebhook } from 'backend/data';

const header = (req, name) => {
  const h = req.headers || {};
  const k = Object.keys(h).find(x => x.toLowerCase() === name);
  return k ? String(h[k]) : '';
};

export async function get_whatsapp(request) {
  const q = request.query || {};
  const verify = await secretValue(WA.secrets.verifyToken);
  if (q['hub.mode'] === 'subscribe' && verify && q['hub.verify_token'] === verify) {
    return ok({ headers: { 'Content-Type': 'text/plain' }, body: String(q['hub.challenge'] || '') });
  }
  return forbidden({ body: 'forbidden' });
}

export async function post_whatsapp(request) {
  const raw = await request.body.text();

  /* Only Meta can produce this signature: HMAC-SHA256 of the raw body
     keyed with your app secret. Without it, anyone could post fake
     "Accept" replies and change a couple's guest list. */
  const secret = await secretValue(WA.secrets.appSecret);
  const given = header(request, 'x-hub-signature-256').replace(/^sha256=/, '');
  const expected = secret ? crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex') : '';
  const valid = given && expected && given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
  if (!valid) return forbidden({ body: 'bad signature' });

  try { await handleWebhook(JSON.parse(raw)); }
  catch (e) { console.error('whatsapp webhook', e); }
  return ok({ body: 'ok' });            // always 200 once verified, or Meta keeps retrying
}
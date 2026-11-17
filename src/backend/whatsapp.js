/* ============================================================
   backend/whatsapp.js
   A plain backend module (not .web.js), so nothing here can be
   called from a browser. Only other backend code imports it.
   ============================================================ */

import { fetch } from 'wix-fetch';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { WA } from 'backend/config';

const readSecret = elevate(secrets.getSecretValue);

let credCache = null;
async function creds() {
  if (credCache) return credCache;
  const [token, phoneId] = await Promise.all([
    readSecret(WA.secrets.token), readSecret(WA.secrets.phoneId)
  ]);
  credCache = { token: token.value, phoneId: phoneId.value };
  return credCache;
}

export async function secretValue(name) {
  try { return (await readSecret(name)).value || ''; } catch (e) { return ''; }
}

/* True once the two sending secrets exist. The guest list uses this to
   show "WhatsApp isn't connected yet" instead of failing on every send. */
export async function isConfigured() {
  try { const c = await creds(); return !!(c.token && c.phoneId); }
  catch (e) { credCache = null; return false; }
}

/* ---------- phone numbers ----------
   Accepts what couples actually type: spaces, dashes, 00 prefixes,
   local 07… numbers and Arabic-Indic digits. Returns +<E.164> or null. */
export function normalisePhone(raw, cc = WA.defaultCountry) {
  let s = String(raw || '').trim()
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\s\-().\u200e\u200f]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = `+${cc}${s.slice(1)}`;
    else if (s.startsWith(cc) && s.length > cc.length + 7) s = '+' + s;
    else s = `+${cc}${s}`;
  }
  const digits = s.slice(1);
  return /^\d{8,15}$/.test(digits) ? '+' + digits : null;
}

/* Meta rejects template parameters containing newlines, tabs or
   more than four consecutive spaces. */
function cleanParam(t, max = 900) {
  return String(t == null ? '' : t)
    .replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max) || '-';
}

async function post(body) {
  const { token, phoneId } = await creds();
  const res = await fetch(`https://graph.facebook.com/${WA.graphVersion}/${phoneId}/messages`, {
    method: 'post',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = {};
  try { json = await res.json(); } catch (e) {}
  if (!res.ok) {
    const e = json.error || {};
    return { ok: false, code: e.code || res.status, error: e.error_user_msg || e.message || `HTTP ${res.status}` };
  }
  return { ok: true, id: json.messages && json.messages[0] && json.messages[0].id };
}

/* Business-initiated messages must use an approved template.
   Buttons are addressed by index, in the order they were defined
   in WhatsApp Manager: quick replies first, then the URL button. */
export function sendTemplate({ to, name, lang, body = [], quickReplies = [], urlSuffix = null }) {
  const components = [{ type: 'body', parameters: body.map(t => ({ type: 'text', text: cleanParam(t) })) }];
  quickReplies.forEach((payload, i) => components.push({
    type: 'button', sub_type: 'quick_reply', index: String(i),
    parameters: [{ type: 'payload', payload: String(payload).slice(0, 256) }]
  }));
  if (urlSuffix !== null) components.push({
    type: 'button', sub_type: 'url', index: String(quickReplies.length),
    parameters: [{ type: 'text', text: String(urlSuffix) }]
  });
  return post({
    messaging_product: 'whatsapp', recipient_type: 'individual',
    to: String(to).replace(/^\+/, ''), type: 'template',
    template: { name, language: { code: lang }, components }
  });
}

/* Free text is only allowed inside the 24-hour window after the guest
   messaged us — used for the thank-you after an Accept/Decline tap. */
export function sendText(to, text) {
  return post({
    messaging_product: 'whatsapp', recipient_type: 'individual',
    to: String(to).replace(/^\+/, ''), type: 'text',
    text: { preview_url: false, body: String(text).slice(0, 1000) }
  });
}

/* Delivery statuses only move forward. A late "delivered" webhook must
   never overwrite a "read". */
const RANK = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
export const statusRank = s => (s in RANK ? RANK[s] : -1);
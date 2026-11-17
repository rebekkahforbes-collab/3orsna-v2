/* ============================================================
   backend/data.js
   The one place that reads and writes the four collections.

   Every collection is Admin-only in the CMS permissions panel, so
   nothing in the browser can query them directly. All access comes
   through here with suppressAuth, and every couple-facing function
   first resolves the signed-in member and checks they own the
   wedding. That check is the whole of the privacy model — keep it.

   Plain .js (not .web.js): the browser can't call these. The .web.js
   files expose the ones that should be callable, with permissions.
   ============================================================ */

import wixData from 'wix-data';
import crypto from 'crypto';
import { COL, WA, PAGES, publicUrl } from 'backend/config';
import { normalisePhone, sendTemplate, sendText, isConfigured, statusRank } from 'backend/whatsapp';

const SA = { suppressAuth: true };

/* ═══════════ small helpers ═══════════ */

export const clean = (v, max = 400) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const hexOr = (v, fb) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim())) ? v.trim().toUpperCase() : fb;
const oneOf = (v, list, fb) => list.includes(v) ? v : fb;
const toIso = d => { if (!d) return ''; const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : x.toISOString().slice(0, 10); };
const newToken = () => crypto.randomBytes(16).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

/* Image URLs end up inside style attributes on the guest page, so only
   URLs from hosts we trust, with no quotes, spaces or brackets, are kept. */
function wixToStatic(u) {
  const m = /^wix:image:\/\/v1\/([^/#]+)/.exec(u || '');
  return m ? `https://static.wixstatic.com/media/${m[1]}` : u;
}
export function safeImg(u) {
  u = wixToStatic(String(u || '').trim());
  if (/^https:\/\/static\.wixstatic\.com\/media\/[A-Za-z0-9_~.\-/%]+$/.test(u)) return u;
  if (/^https:\/\/images\.unsplash\.com\/[A-Za-z0-9_\-./?=&%]+$/.test(u)) return u;
  return '';
}

/* A couple's own uploaded border. It's rendered through a CSS mask on
   the guest page (masks can't run scripts), but it's stripped here too. */
function safeBorder(b) {
  if (!b || typeof b !== 'object' || typeof b.svg !== 'string') return null;
  const svg = b.svg
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#')
    .trim();
  if (!/^<svg[\s>]/i.test(svg) || svg.length > 60000) return null;
  return { label: clean(b.label, 20), svg };
}

const ARAB_CC = ['962', '966', '971', '965', '974', '973', '968', '970', '961', '963', '964', '20'];
function templateLang(w, phone) {
  if (w.invLang === 'ar') return 'ar';
  if (w.invLang === 'en') return 'en';
  const d = String(phone || '').replace('+', '');
  return ARAB_CC.some(cc => d.startsWith(cc)) ? 'ar' : 'en';
}
function coupleNames(w, lang) {
  if (lang === 'ar') return `${w.brideAr || w.bride || ''} و${w.groomAr || w.groom || ''}`.trim();
  return `${w.bride || w.brideAr || ''} & ${w.groom || w.groomAr || ''}`.trim();
}
/* What the couple's WhatsApp invitation says until they write their own. */
function defaultInviteMessage(w, lang) {
  const when = dateText(w.weddingDate, lang), where = w.venue ? (lang === 'ar' ? ` في ${w.venue}` : ` at ${w.venue}`) : '';
  return lang === 'ar'
    ? `يسعدنا أن تشاركونا فرحتنا بزفافنا يوم ${when}${where}.`
    : `We would love you to celebrate our wedding with us on ${when}${where}.`;
}
function dateText(d, lang) {
  if (!d) return lang === 'ar' ? 'قريباً' : 'soon';
  try {
    return new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-JO' : 'en-GB',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch (e) { return toIso(d); }
}

/* ═══════════ weddings ═══════════ */

function toConfig(row) {
  return {
    weddingId: row._id, slug: row.slug,
    style: row.style === 'portrait' ? 'artwork' : (row.style || 'colour'),     // "Design + photo" is now Design + couple photo
    bride: row.bride || '', groom: row.groom || '', brideAr: row.brideAr || '', groomAr: row.groomAr || '',
    invLang: row.invLang || 'en', date: toIso(row.weddingDate), time: row.startTime || '19:00',
    venue: row.venue || '', address: row.address || '', city: row.city || '', mapUrl: row.mapUrl || '',
    tagline: row.tagline || '', taglineAr: row.taglineAr || '', dress: row.dress || '',
    bgColour: row.bgColour || '#14110C', fade: row.fade || 'glow',
    artwork: row.artwork === 'own' && !safeImg(row.ownArtworkUrl) ? 'a1' : (row.artwork || 'a1'),   // "own" = the couple's uploaded design
    shape: row.shape || 'circle', overlayColour: row.overlayColour || '#000000', overlay: row.overlay || 'medium',
    border: row.border || 'none', customBorder: row.customBorder ? safeParse(row.customBorder) : null,
    textColour: row.textColour || '#F4EDE2', coverId: row.coverId || '', coverUrl: row.style === 'portrait' ? '' : safeImg(row.coverUrl),
    couplePhotoUrl: safeImg(row.couplePhotoUrl) || (row.style === 'portrait' ? safeImg(row.coverUrl) : ''),
    galleryUrls: galleryList(row.galleryUrls),
    ownArtworkUrl: safeImg(row.ownArtworkUrl),
    cardImageUrl: safeImg(row.cardImageUrl),                // the invitation as a JPG (Premium) — sent with WhatsApp invitations
    rsvp: {
      on: row.rsvpOn !== false, deadline: toIso(row.rsvpDeadline), count: row.rsvpAskCount !== false,
      max: row.rsvpMaxParty || 4, msg: row.rsvpAskMsg !== false, phone: row.rsvpAskPhone !== false
    }
  };
}
const safeParse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

/* galleryUrls may come back as a list of links, a Media gallery (objects
   with src, often wix:image:// URLs) or text, depending on the field type
   chosen at import. Every shape is turned into a list of https links. */
function galleryList(v) {
  if (typeof v === 'string') {
    const t = v.trim(); if (!t) return [];
    try { v = JSON.parse(t); } catch (e) { v = t.split(/[\s,]+/); }
  }
  if (!Array.isArray(v)) return [];
  return v.map(g => typeof g === 'string' ? g : (g && (g.src || g.url)) || '').map(safeImg).filter(Boolean).slice(0, 12);
}

function toRow(d) {
  const r = d.rsvp || {};
  const row = {
    slug: clean(d.slug, 60).toLowerCase(),
    style: oneOf(d.style === 'portrait' ? 'artwork' : d.style, ['colour', 'artwork', 'photo'], 'colour'),
    bride: clean(d.bride, 80), groom: clean(d.groom, 80), brideAr: clean(d.brideAr, 80), groomAr: clean(d.groomAr, 80),
    invLang: oneOf(d.invLang, ['en', 'ar', 'both'], 'en'),
    startTime: /^\d{2}:\d{2}$/.test(d.time || '') ? d.time : '19:00',
    venue: clean(d.venue, 120), address: clean(d.address, 160), city: clean(d.city, 80),
    mapUrl: /^https:\/\/[^\s"'<>]+$/.test(d.mapUrl || '') ? d.mapUrl.slice(0, 500) : '',
    tagline: clean(d.tagline, 90), taglineAr: clean(d.taglineAr, 90), dress: clean(d.dress, 80),
    bgColour: hexOr(d.bgColour, '#14110C'), fade: oneOf(d.fade, ['none', 'soft', 'glow', 'diagonal'], 'glow'),
    artwork: /^a\d{1,2}$/.test(d.artwork || '') ? d.artwork : (d.artwork === 'own' && safeImg(d.ownArtworkUrl)) ? 'own' : 'a1',
    ownArtworkUrl: safeImg(d.ownArtworkUrl),
    shape: oneOf(d.shape, ['circle', 'heart', 'square'], 'circle'),
    overlayColour: hexOr(d.overlayColour, '#000000'), overlay: oneOf(d.overlay, ['none', 'light', 'medium', 'strong'], 'medium'),
    border: /^[a-z0-9]{1,12}$/.test(d.border || '') ? d.border : 'none',
    textColour: hexOr(d.textColour, '#F4EDE2'),
    coverId: /^[a-z0-9]{1,12}$/.test(d.coverId || '') ? d.coverId : '',
    coverUrl: safeImg(d.coverUrl),
    couplePhotoUrl: safeImg(d.couplePhotoUrl),
    galleryUrls: (Array.isArray(d.galleryUrls) ? d.galleryUrls : []).map(safeImg).filter(Boolean).slice(0, 12),
    isPrivate: !!d.private,
    rsvpOn: r.on !== false, rsvpAskCount: r.count !== false,
    rsvpMaxParty: Math.max(1, Math.min(20, +r.max || 4)),
    rsvpAskMsg: r.msg !== false, rsvpAskPhone: r.phone !== false
  };
  const cb = safeBorder(d.customBorder);
  row.customBorder = cb ? JSON.stringify(cb) : null;
  row.weddingDate  = /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? new Date(d.date + 'T12:00:00Z') : null;
  row.rsvpDeadline = /^\d{4}-\d{2}-\d{2}$/.test(r.deadline || '') ? new Date(r.deadline + 'T12:00:00Z') : null;
  return row;
}

export async function weddingFor(uid) {
  if (!uid) return null;
  const res = await wixData.query(COL.weddings).eq('ownerId', uid).descending('_updatedDate').limit(1).find(SA);
  return res.items[0] || null;
}

export async function myWedding(uid) {
  const w = await weddingFor(uid);
  if (!w) return null;
  return Object.assign(toConfig(w), {
    private: !!w.isPrivate, status: w.status || 'draft', publicUrl: w.slug ? publicUrl(w.slug) : '',
    guestListEnabled: w.guestListEnabled !== false
  });
}

const SLUG_RE = /^[a-z0-9\u0600-\u06FF][a-z0-9\u0600-\u06FF-]{1,58}[a-z0-9\u0600-\u06FF]$/;

export async function slugFree(uid, slug) {
  const s = clean(slug, 60).toLowerCase();
  if (!SLUG_RE.test(s)) return false;
  const mine = await weddingFor(uid);
  const res = await wixData.query(COL.weddings).eq('slug', s).limit(1).find(SA);
  if (res.items.length) return !!mine && res.items[0]._id === mine._id;
  const old = await wixData.query(COL.weddings).hasSome('previousSlugs', [s]).limit(1).find(SA);
  return !old.items.length || (!!mine && old.items[0]._id === mine._id);
}

export async function saveWedding(uid, data, publish) {
  if (!uid) return { ok: false, reason: 'signedOut' };
  const row = toRow(data || {});
  if (safeImg((data || {}).cardImageUrl)) row.cardImageUrl = safeImg(data.cardImageUrl);   // only ever replaced, never blanked
  if (!SLUG_RE.test(row.slug)) return { ok: false, reason: 'badSlug' };
  if (!(await slugFree(uid, row.slug))) return { ok: false, reason: 'slugTaken' };

  const mine = await weddingFor(uid);
  row.ownerId = uid;
  row.title = [row.bride || row.brideAr, row.groom || row.groomAr].filter(Boolean).join(' & ') || row.slug;
  row.status = publish ? 'published' : (mine ? mine.status || 'draft' : 'draft');
  if (publish && !(mine && mine.publishedAt)) row.publishedAt = new Date();

  /* Changing the address after sharing would break every link already
     sent, so old addresses are kept and the router redirects them. */
  if (mine && mine.slug && mine.slug !== row.slug) {
    const prev = new Set(Array.isArray(mine.previousSlugs) ? mine.previousSlugs : []);
    prev.add(mine.slug); prev.delete(row.slug);
    row.previousSlugs = [...prev].slice(-10);
  }

  const saved = mine
    ? await wixData.update(COL.weddings, Object.assign({}, mine, row), SA)
    : await wixData.insert(COL.weddings, Object.assign({ guestListEnabled: true }, row), SA);
  return { ok: true, weddingId: saved._id, status: saved.status, slug: saved.slug, publicUrl: publicUrl(saved.slug) };
}

export async function setPublished(uid, on) {
  const w = await weddingFor(uid);
  if (!w) return { ok: false, reason: 'noWedding' };
  w.status = on ? 'published' : 'draft';
  if (on && !w.publishedAt) w.publishedAt = new Date();
  await wixData.update(COL.weddings, w, SA);
  return { ok: true, status: w.status };
}

/* ═══════════ public invitation (router) ═══════════ */

export async function inviteForRouter(slug, token, userId) {
  const s = clean(slug, 60).toLowerCase();
  if (!s) return null;
  let res = await wixData.query(COL.weddings).eq('slug', s).limit(1).find(SA);
  let w = res.items[0];
  if (!w) {
    res = await wixData.query(COL.weddings).hasSome('previousSlugs', [s]).limit(1).find(SA);
    if (res.items[0]) return { redirectTo: res.items[0].slug };
    return null;
  }
  const isOwner = !!userId && userId === w.ownerId;
  if (w.status !== 'published' && !isOwner) return null;

  const cfg = toConfig(w);
  cfg.preview = w.status !== 'published';
  cfg.isPrivate = !!w.isPrivate;
  cfg.guest = null;
  if (token && /^[A-Za-z0-9_-]{10,40}$/.test(token)) {
    const g = await wixData.query(COL.guests).eq('weddingRef', w._id).eq('inviteToken', token).limit(1).find(SA);
    if (g.items[0]) cfg.guest = { name: g.items[0].name, token };
  }
  return cfg;
}

/* ═══════════ RSVP ═══════════ */

async function upsertRsvp(w, guest, rec) {
  const key = guest ? { field: 'guestRef', value: guest._id }
                    : { field: 'fingerprint', value: sha(`${w._id}|${rec.guestName.toLowerCase()}|${rec.phone}`) };
  const prior = await wixData.query(COL.rsvps).eq('weddingRef', w._id).eq(key.field, key.value).limit(1).find(SA);
  const row = Object.assign({
    title: rec.guestName, weddingRef: w._id, weddingSlug: w.slug, guestRef: guest ? guest._id : '',
    fingerprint: guest ? '' : key.value, submittedAt: new Date()
  }, rec);
  return prior.items[0]
    ? { updated: true, item: await wixData.update(COL.rsvps, Object.assign({}, prior.items[0], row), SA) }
    : { updated: false, item: await wixData.insert(COL.rsvps, row, SA) };
}

async function markGuest(guest, attending, partySize, source) {
  Object.assign(guest, {
    rsvpStatus: attending ? 'confirmed' : 'declined', partySize: attending ? partySize : 0,
    rsvpAt: new Date(), rsvpSource: source
  });
  return wixData.update(COL.guests, guest, SA);
}

const rsvpClosed = w => w.rsvpOn === false || (w.rsvpDeadline && new Date(w.rsvpDeadline).getTime() + 86400000 < Date.now());

export async function submitRsvp(p) {
  p = p || {};
  const slug = clean(p.slug, 60).toLowerCase();
  const guestName = clean(p.guestName, 80);
  if (!slug) return { ok: false, reason: 'noSlug' };
  if (guestName.length < 2) return { ok: false, reason: 'noName' };
  if (typeof p.attending !== 'boolean') return { ok: false, reason: 'noAnswer' };

  const wr = await wixData.query(COL.weddings).eq('slug', slug).limit(1).find(SA);
  const w = wr.items[0];
  if (!w) return { ok: false, reason: 'notFound' };
  if (w.status !== 'published') return { ok: false, reason: 'preview' };
  if (rsvpClosed(w)) return { ok: false, reason: 'closed' };

  const cap = Math.max(1, Math.min(20, w.rsvpMaxParty || 4));
  const partySize = p.attending ? Math.max(1, Math.min(cap, +p.partySize || 1)) : 0;
  const phone = normalisePhone(p.phone) || '';

  /* Tie the reply to a guest on the list: by their personal link first,
     then by phone number. Unmatched replies are still kept. */
  let guest = null;
  if (p.token && /^[A-Za-z0-9_-]{10,40}$/.test(p.token)) {
    const g = await wixData.query(COL.guests).eq('weddingRef', w._id).eq('inviteToken', p.token).limit(1).find(SA);
    guest = g.items[0] || null;
  }
  if (!guest && phone) {
    const g = await wixData.query(COL.guests).eq('weddingRef', w._id).eq('phone', phone).limit(1).find(SA);
    guest = g.items[0] || null;
  }

  const res = await upsertRsvp(w, guest, {
    guestName, attending: p.attending, partySize, phone,
    message: clean(p.message, 400), lang: p.lang === 'ar' ? 'ar' : 'en', source: 'page'
  });
  if (guest) await markGuest(guest, p.attending, partySize, 'page');
  return { ok: true, updated: res.updated };
}

/* ═══════════ dashboard ═══════════ */

export async function dashboard(uid) {
  const w = await weddingFor(uid);
  if (!w) return { hasWedding: false, pages: PAGES };

  const rs = await wixData.query(COL.rsvps).eq('weddingRef', w._id).descending('submittedAt').limit(1000).find(SA);
  const rsvps = rs.items;
  let guests = [];
  if (w.guestListEnabled !== false) {
    const gs = await wixData.query(COL.guests).eq('weddingRef', w._id).limit(1000).find(SA);
    guests = gs.items;
  }
  const unmatched = rsvps.filter(r => !r.guestRef);
  const stats = {
    guests: guests.length,
    confirmed: guests.filter(g => g.rsvpStatus === 'confirmed').length + unmatched.filter(r => r.attending).length,
    declined:  guests.filter(g => g.rsvpStatus === 'declined').length  + unmatched.filter(r => !r.attending).length,
    pending:   guests.filter(g => !g.rsvpStatus || g.rsvpStatus === 'pending').length,
    heads:     guests.reduce((n, g) => n + (g.rsvpStatus === 'confirmed' ? (g.partySize || 1) : 0), 0)
             + unmatched.reduce((n, r) => n + (r.attending ? (r.partySize || 1) : 0), 0),
    notOnList: unmatched.length
  };
  return {
    hasWedding: true, status: w.status || 'draft', slug: w.slug,
    bride: w.bride, groom: w.groom, brideAr: w.brideAr, groomAr: w.groomAr, invLang: w.invLang || 'en',
    date: toIso(w.weddingDate), time: w.startTime || '', venue: w.venue || '', city: w.city || '',
    rsvpDeadline: toIso(w.rsvpDeadline), rsvpOn: w.rsvpOn !== false,
    publicUrl: w.slug ? publicUrl(w.slug) : '', guestListEnabled: w.guestListEnabled !== false, stats, pages: PAGES,
    recent: rsvps.slice(0, 8).map(r => ({
      name: r.guestName, attending: !!r.attending, partySize: r.partySize || 0,
      message: r.message || '', at: r.submittedAt, source: r.source || 'page', onList: !!r.guestRef
    }))
  };
}

/* ═══════════ guest list (module 2) ═══════════ */

async function guestWedding(uid) {
  const w = await weddingFor(uid);
  if (!w) return { error: 'noWedding' };
  if (w.guestListEnabled === false) return { error: 'notEnabled' };      // on for everyone unless switched off in the CMS
  return { w };
}

const guestOut = g => ({
  id: g._id, name: g.name, phone: g.phone, rsvpStatus: g.rsvpStatus || 'pending', partySize: g.partySize || 0,
  rsvpAt: g.rsvpAt || null, rsvpSource: g.rsvpSource || '', waStatus: g.waStatus || '', waError: g.waError || '',
  waLastKind: g.waLastKind || '', waLastSentAt: g.waLastSentAt || null, waLastInbound: g.waLastInbound || ''
});

/* A reply from someone who isn't on the list — they used the shared link,
   or a different number from the one the couple saved. */
const otherOut = r => ({
  id: r._id, name: r.guestName || r.title || '', phone: r.phone || '', attending: !!r.attending,
  partySize: r.partySize || 0, message: r.message || '', at: r.submittedAt || r._createdDate || null, source: r.source || 'page'
});

export async function listGuests(uid) {
  const { w, error } = await guestWedding(uid);
  if (error) return { ok: false, reason: error };
  const [res, rs] = await Promise.all([
    wixData.query(COL.guests).eq('weddingRef', w._id).ascending('name').limit(1000).find(SA),
    wixData.query(COL.rsvps).eq('weddingRef', w._id).descending('submittedAt').limit(1000).find(SA)
  ]);
  return {
    ok: true, items: res.items.map(guestOut), others: rs.items.filter(r => !r.guestRef).map(otherOut), waReady: await isConfigured(),
    wedding: {
      status: w.status || 'draft', slug: w.slug, invLang: w.invLang || 'en',
      names: coupleNames(w, w.invLang === 'ar' ? 'ar' : 'en'), rsvpDeadline: toIso(w.rsvpDeadline),
      publicUrl: w.slug ? publicUrl(w.slug) : '',
      cardImageUrl: safeImg(w.cardImageUrl),
      inviteMessage: w.inviteMessage || defaultInviteMessage(w, w.invLang === 'ar' ? 'ar' : 'en')
    }
  };
}

export async function saveGuest(uid, g) {
  const { w, error } = await guestWedding(uid);
  if (error) return { ok: false, reason: error };
  g = g || {};
  const name = clean(g.name, 80);
  const phone = normalisePhone(g.phone);
  if (name.length < 2) return { ok: false, reason: 'noName' };
  if (!phone) return { ok: false, reason: 'badPhone' };

  const dup = await wixData.query(COL.guests).eq('weddingRef', w._id).eq('phone', phone).limit(1).find(SA);
  if (dup.items[0] && dup.items[0]._id !== g.id) return { ok: false, reason: 'duplicate', name: dup.items[0].name };

  if (g.id) {
    const cur = await wixData.get(COL.guests, g.id, SA);
    if (!cur || cur.weddingRef !== w._id) return { ok: false, reason: 'notFound' };
    cur.name = name; cur.title = name;
    if (cur.phone !== phone) { cur.phone = phone; cur.waStatus = ''; cur.waError = ''; }
    if (['pending', 'confirmed', 'declined'].includes(g.rsvpStatus) && g.rsvpStatus !== cur.rsvpStatus) {
      cur.rsvpStatus = g.rsvpStatus; cur.rsvpSource = 'couple'; cur.rsvpAt = new Date();
      cur.partySize = g.rsvpStatus === 'confirmed' ? Math.max(1, Math.min(20, +g.partySize || cur.partySize || 1)) : 0;
    } else if (cur.rsvpStatus === 'confirmed' && g.partySize) {
      cur.partySize = Math.max(1, Math.min(20, +g.partySize));
    }
    return { ok: true, item: guestOut(await wixData.update(COL.guests, cur, SA)) };
  }
  const item = await wixData.insert(COL.guests, {
    title: name, name, phone, weddingRef: w._id, ownerId: uid,
    rsvpStatus: 'pending', partySize: 0, inviteToken: newToken(), waStatus: ''
  }, SA);
  return { ok: true, item: guestOut(item) };
}

/* Ties a reply from someone not on the list to a guest: an existing one
   (they replied from another number) or a new guest made from the reply.
   The guest keeps the number the couple saved for WhatsApp. */
export async function linkReply(uid, rsvpId, guestId) {
  const { w, error } = await guestWedding(uid);
  if (error) return { ok: false, reason: error };
  const r = await wixData.get(COL.rsvps, clean(rsvpId, 60), SA);
  if (!r || r.weddingRef !== w._id) return { ok: false, reason: 'notFound' };
  if (r.guestRef) return { ok: false, reason: 'alreadyLinked' };

  let guest = null;
  if (guestId) {
    guest = await wixData.get(COL.guests, clean(guestId, 60), SA);
    if (!guest || guest.weddingRef !== w._id) return { ok: false, reason: 'notFound' };
  } else {
    const phone = normalisePhone(r.phone);
    if (!phone) return { ok: false, reason: 'noPhone' };
    const dup = await wixData.query(COL.guests).eq('weddingRef', w._id).eq('phone', phone).limit(1).find(SA);
    guest = dup.items[0] || await wixData.insert(COL.guests, {
      title: clean(r.guestName, 80) || phone, name: clean(r.guestName, 80) || phone, phone, weddingRef: w._id, ownerId: uid,
      rsvpStatus: 'pending', partySize: 0, inviteToken: newToken(), waStatus: ''
    }, SA);
  }

  /* One reply per guest: this one replaces any earlier reply of theirs. */
  const old = await wixData.query(COL.rsvps).eq('weddingRef', w._id).eq('guestRef', guest._id).limit(50).find(SA);
  for (const o of old.items) if (o._id !== r._id) await wixData.remove(COL.rsvps, o._id, SA);
  await wixData.update(COL.rsvps, Object.assign({}, r, { guestRef: guest._id, fingerprint: '' }), SA);
  const saved = await markGuest(guest, !!r.attending, r.attending ? Math.max(1, r.partySize || 1) : 0, r.source === 'whatsapp' ? 'whatsapp' : 'page');
  return { ok: true, item: guestOut(saved), rsvpId: r._id };
}

export async function removeGuest(uid, id) {
  const { w, error } = await guestWedding(uid);
  if (error) return { ok: false, reason: error };
  const cur = await wixData.get(COL.guests, clean(id, 60), SA);
  if (!cur || cur.weddingRef !== w._id) return { ok: false, reason: 'notFound' };
  await wixData.remove(COL.guests, cur._id, SA);
  return { ok: true, id: cur._id };
}

/* One batch of WhatsApp sends. The page calls this repeatedly with up to
   WA.batchMax guests at a time, so no single call nears the 14 s limit. */
export async function sendWhatsApp(uid, ids, kind, note) {
  const { w, error } = await guestWedding(uid);
  if (error) return { ok: false, reason: error };
  if (!['invite', 'reminder', 'update'].includes(kind)) return { ok: false, reason: 'badKind' };
  if (w.status !== 'published') return { ok: false, reason: 'notPublished' };
  if (kind === 'update' && clean(note, 500).length < 3) return { ok: false, reason: 'noNote' };
  /* The invitation is the card image + the couple's message + a link to their page. */
  if (kind === 'invite' && !safeImg(w.cardImageUrl)) return { ok: false, reason: 'noCard' };
  let message = '';
  if (kind === 'invite') {
    message = clean(note, 600) || w.inviteMessage || '';
    if (message.length < 3) return { ok: false, reason: 'noMessage' };
    if (message !== w.inviteMessage) { w.inviteMessage = message; await wixData.update(COL.weddings, w, SA); }   // remembered for next time
  }
  if (!(await isConfigured())) return { ok: false, reason: 'waNotConfigured' };

  const list = (Array.isArray(ids) ? ids : []).map(i => clean(i, 60)).filter(Boolean).slice(0, WA.batchMax);
  if (!list.length) return { ok: true, sent: 0, failed: 0, results: [] };

  const since = new Date(Date.now() - 86400000);
  const today = await wixData.query(COL.wa).eq('weddingRef', w._id).eq('direction', 'out').gt('sentAt', since).count(SA);
  if (today + list.length > WA.dailyCapPerWedding) return { ok: false, reason: 'dailyCap', remaining: Math.max(0, WA.dailyCapPerWedding - today) };

  const gs = await wixData.query(COL.guests).eq('weddingRef', w._id).hasSome('_id', list).limit(WA.batchMax).find(SA);
  const guests = gs.items;
  const results = [];

  async function one(g) {
    if (!g.inviteToken) g.inviteToken = newToken();
    const lang = templateLang(w, g.phone);
    const couple = coupleNames(w, lang);
    const suffix = `${encodeURIComponent(w.slug)}?g=${g.inviteToken}`;
    const body = kind === 'invite'   ? [g.name, message, suffix]                    // Dear {{1}}, {{2}} … /invite/{{3}}
               : kind === 'reminder' ? [g.name, couple, dateText(w.rsvpDeadline || w.weddingDate, lang)]
               :                       [g.name, couple, clean(note, 500)];
    const quick = kind === 'update' ? [] : [`RSVP|yes|${g._id}`, `RSVP|no|${g._id}`];
    const r = kind === 'invite'
      ? await sendTemplate({ to: g.phone, name: WA.templates.invite, lang, body, quickReplies: quick, headerImage: safeImg(w.cardImageUrl) })
      : await sendTemplate({ to: g.phone, name: WA.templates[kind], lang, body, quickReplies: quick, urlSuffix: suffix });

    await wixData.insert(COL.wa, {
      title: `${kind} → ${g.name}`, weddingRef: w._id, guestRef: g._id, ownerId: uid, direction: 'out',
      kind, template: WA.templates[kind], lang, phone: g.phone, waMessageId: r.id || '',
      status: r.ok ? 'sent' : 'failed', error: r.ok ? '' : String(r.error).slice(0, 300),
      text: kind === 'update' ? clean(note, 500) : kind === 'invite' ? message : '', sentAt: new Date(), statusAt: new Date()
    }, SA);
    Object.assign(g, {
      waStatus: r.ok ? 'sent' : 'failed', waError: r.ok ? '' : String(r.error).slice(0, 300),
      waLastMessageId: r.id || '', waLastKind: kind, waLastSentAt: new Date()
    });
    await wixData.update(COL.guests, g, SA);
    results.push({ id: g._id, ok: r.ok, error: r.ok ? '' : r.error });
  }

  for (let i = 0; i < guests.length; i += WA.concurrency) {
    await Promise.all(guests.slice(i, i + WA.concurrency).map(g => one(g).catch(e => results.push({ id: g._id, ok: false, error: e.message }))));
  }
  return { ok: true, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
}

/* ═══════════ WhatsApp webhook ═══════════ */

async function onStatus(st) {
  if (!st || !st.id) return;
  const m = await wixData.query(COL.wa).eq('waMessageId', st.id).limit(1).find(SA);
  const msg = m.items[0];
  const err = st.errors && st.errors[0] ? `${st.errors[0].code}: ${st.errors[0].title || st.errors[0].message || ''}` : '';
  if (msg && statusRank(st.status) > statusRank(msg.status)) {
    Object.assign(msg, { status: st.status, error: err || msg.error, statusAt: new Date() });
    await wixData.update(COL.wa, msg, SA);
  }
  const g = await wixData.query(COL.guests).eq('waLastMessageId', st.id).limit(1).find(SA);
  const guest = g.items[0];
  if (guest && statusRank(st.status) > statusRank(guest.waStatus)) {
    Object.assign(guest, { waStatus: st.status, waError: err });
    await wixData.update(COL.guests, guest, SA);
  }
}

async function onInbound(m) {
  if (!m || !m.id) return;
  const seen = await wixData.query(COL.wa).eq('waMessageId', m.id).limit(1).count(SA);
  if (seen) return;                                       // Meta retries webhooks; handle each message once

  const from = normalisePhone('+' + m.from, '');
  const text = m.type === 'text' ? (m.text && m.text.body) : m.type === 'button' ? (m.button && m.button.text) : `[${m.type}]`;
  const payload = m.type === 'button' && m.button ? String(m.button.payload || '') : '';
  const rsvp = /^RSVP\|(yes|no)\|([\w-]{8,60})$/.exec(payload);

  let guest = null;
  if (rsvp) {
    const g = await wixData.get(COL.guests, rsvp[2], SA).catch(() => null);
    if (g && g.phone === from) guest = g;                  // the tap must come from the number it was sent to
  }
  if (!guest && from) {
    const g = await wixData.query(COL.guests).eq('phone', from).descending('waLastSentAt').limit(1).find(SA);
    guest = g.items[0] || null;
  }
  const w = guest ? await wixData.get(COL.weddings, guest.weddingRef, SA).catch(() => null) : null;

  await wixData.insert(COL.wa, {
    title: `reply ← ${guest ? guest.name : from}`, weddingRef: w ? w._id : '', guestRef: guest ? guest._id : '',
    ownerId: guest ? guest.ownerId : '', direction: 'in', kind: rsvp ? `rsvp-${rsvp[1]}` : 'reply', phone: from,
    waMessageId: m.id, status: 'received', text: clean(text, 500), sentAt: new Date(), statusAt: new Date()
  }, SA);
  if (!guest) return;

  guest.waLastInbound = clean(text, 200);
  if (!rsvp || !w || w.status !== 'published' || rsvpClosed(w)) {
    await wixData.update(COL.guests, guest, SA);
    return;
  }

  const attending = rsvp[1] === 'yes';
  const partySize = attending ? Math.max(1, guest.partySize || 1) : 0;
  await markGuest(guest, attending, partySize, 'whatsapp');
  await upsertRsvp(w, guest, {
    guestName: guest.name, attending, partySize, phone: guest.phone, message: '', lang: templateLang(w, guest.phone), source: 'whatsapp'
  });

  /* The guest just messaged us, so free text is allowed for 24 hours. */
  const lang = templateLang(w, guest.phone);
  const thanks = attending
    ? (lang === 'ar' ? `شكراً ${guest.name}! تم تسجيل حضوركم. نراكم قريباً.` : `Thank you, ${guest.name}! Your reply is saved. See you there.`)
    : (lang === 'ar' ? `شكراً ${guest.name} لإعلامنا. ستكونون في قلوبنا.` : `Thank you for letting us know, ${guest.name}. You'll be missed.`);
  const r = await sendText(guest.phone, thanks);
  await wixData.insert(COL.wa, {
    title: `thanks → ${guest.name}`, weddingRef: w._id, guestRef: guest._id, ownerId: guest.ownerId, direction: 'out',
    kind: 'thanks', lang, phone: guest.phone, waMessageId: r.id || '', status: r.ok ? 'sent' : 'failed',
    error: r.ok ? '' : String(r.error).slice(0, 300), text: thanks, sentAt: new Date(), statusAt: new Date()
  }, SA);
}

export async function handleWebhook(payload) {
  for (const entry of (payload && payload.entry) || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const st of v.statuses || []) { try { await onStatus(st); } catch (e) { console.error('wa status', e); } }
      for (const m of v.messages || []) { try { await onInbound(m); } catch (e) { console.error('wa inbound', e); } }
    }
  }
}

// ============================================================================
//  backend/shortlist.web.js — the venues and talent a couple has enquired with.
//
//  Filled in automatically from their enquiries (RequestDirectory for venues,
//  TalentEnquiries for talent) — matched by the member who sent them, or by
//  their login email for enquiries sent before. Each entry gets a status
//  (Considering, Favourite, Booked, Not for us) and a note. Couples only ever
//  see their own list; contact details only show if the listing shows them publicly.
// ============================================================================
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { allowRole } from 'backend/access';

const SA = { suppressAuth: true };
const COL = 'Shortlist';
const STATUSES = ['considering', 'favourite', 'booked', 'notForUs'];

function bad(msg) { const e = new Error(msg); e.name = 'ValidationError'; return e; }
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function me() {
    const c = await allowRole('couple', 'The shortlist is for couples planning their wedding.');
    if (!c.member) throw bad('NOT_LOGGED_IN');
    return c.member;
}

/* wix:image://v1/<id>/name.jpg → a URL a browser can load. */
function img(raw) {
    if (raw && typeof raw === 'object') raw = raw.src || raw.url || '';
    if (typeof raw !== 'string' || !raw) return '';
    const m = /^wix:image:\/\/v1\/([^/#]+)/.exec(raw);
    return m ? `https://static.wixstatic.com/media/${m[1]}` : (/^https:\/\//.test(raw) ? raw : '');
}
/* The listing's own public page. Wix adds one link-* field per dynamic page,
   so it's found by where it points: one item (/venues/x, not the list page
   /venues) and not the edit page. */
const isItemPath = (u) => typeof u === 'string' && /^\/[^/]+\/[^/]+/.test(u);
function viewLink(r) {
    const k = Object.keys(r || {}).find((x) => x.startsWith('link-') && isItemPath(r[x]) && !/edit/i.test(r[x]));
    return k ? r[k] : '';
}
/* Fallback for a row Wix hasn't generated a link for yet: the page's prefix
   (learned from rows that do have one, else the default below) + its title. */
const DEFAULT_PREFIX = { venue: '/venues', talent: '/talent' };
const slugify = (s) => String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const prefixOf = (u) => { const m = /^(\/[^/]+)\//.exec(u || ''); return m ? m[1] : null; };
function learnPrefix(rows, type) {
    for (const r of rows) { const p = prefixOf(viewLink(r)); if (p) return p; }
    return DEFAULT_PREFIX[type];
}
function pageLink(r, prefix) {
    const own = viewLink(r);
    if (own) return own;
    const slug = slugify(r.title || r.venueName);
    return slug ? `${prefix}/${encodeURIComponent(slug)}` : '';
}
const yes = (v) => v === true || String(v || '').toLowerCase() === 'yes';

function fromVenue(v, prefix = DEFAULT_PREFIX.venue) {
    return {
        type: 'venue', id: v._id, title: v.venueName || v.title || 'Venue', category: 'Venue', city: v.city || '',
        image: img(v.image), link: pageLink(v, prefix),
        phone: yes(v.showPhone) ? (v.phoneContact || '') : '', email: yes(v.showEmail) ? (v.emailContact || '') : ''
    };
}
function fromTalent(t, prefix = DEFAULT_PREFIX.talent) {
    return {
        type: 'talent', id: t._id, title: t.title || 'Talent', category: t.category || 'Talent', city: t.city || '',
        image: img(t.heroImage), link: pageLink(t, prefix),
        phone: t.showPhone === true ? (t.publicPhone || '') : '', email: ''
    };
}
/* Only listings the public can see. */
const liveVenues = () => wixData.query('Venues').eq('visibility', true).ne('approved', 'rejected');
const liveTalent = () => wixData.query('Talent').eq('visibility', true).ne('approvalStatus', 'rejected');

// --------------------------------------------------------------------------
/* Add every venue / talent this couple has enquired with that isn't on the list yet. */
async function syncFromEnquiries(m) {
    const email = String(m.loginEmail || '').trim();
    const byMember = (c) => wixData.query(c).eq('memberId', m._id).limit(500).find(SA);
    // Wix's contains() ignores case; then keep only exact matches (ignoring case).
    const byEmail  = async (c) => {
        if (!email) return { items: [] };
        const r = await wixData.query(c).contains('email', email).limit(500).find(SA);
        return { items: r.items.filter((e) => String(e.email || '').trim().toLowerCase() === email.toLowerCase()) };
    };
    const [rv1, rv2, rt1, rt2, have] = await Promise.all([
        byMember('RequestDirectory'), byEmail('RequestDirectory'), byMember('TalentEnquiries'), byEmail('TalentEnquiries'),
        wixData.query(COL).eq('ownerId', m._id).limit(1000).find(SA)
    ]);
    const known = new Set(have.items.map((i) => i.itemType + ':' + i.itemId));
    const wanted = new Map();                                  // "type:id" -> first enquiry date
    const note = (type, id, at) => {
        if (!id) return;
        const k = type + ':' + id, d = at ? new Date(at) : new Date();
        if (!known.has(k) && (!wanted.has(k) || d < wanted.get(k))) wanted.set(k, d);
    };
    [...rv1.items, ...rv2.items].forEach((e) => note('venue', e.venueId, e.submittedAt || e._createdDate));
    [...rt1.items, ...rt2.items].forEach((e) => note('talent', e.talentId, e.submittedAt || e._createdDate));
    for (const [k, at] of wanted) {
        const [type, id] = k.split(':');
        const r = await wixData.query(type === 'venue' ? 'Venues' : 'Talent').eq('_id', id).limit(1).find(SA);
        const src = r.items.length ? (type === 'venue' ? fromVenue(r.items[0]) : fromTalent(r.items[0])) : { title: type === 'venue' ? 'Venue' : 'Talent', category: '', city: '', image: '', link: '' };
        await wixData.insert(COL, {
            title: src.title, ownerId: m._id, itemType: type, itemId: id, category: src.category, city: src.city,
            image: src.image, link: src.link, status: 'considering', note: '', enquiredAt: at, addedAt: new Date(), updatedAt: new Date()
        }, SA);
    }
}

async function listImpl() {
    const m = await me();
    await syncFromEnquiries(m);
    const r = await wixData.query(COL).eq('ownerId', m._id).descending('enquiredAt').limit(500).find(SA);
    // Refresh name, photo, link and contact from the live listing; a listing
    // that's gone or taken down keeps its saved details and is marked.
    const vIds = r.items.filter((i) => i.itemType === 'venue').map((i) => i.itemId);
    const tIds = r.items.filter((i) => i.itemType === 'talent').map((i) => i.itemId);
    const [vs, ts] = await Promise.all([
        vIds.length ? liveVenues().hasSome('_id', vIds).limit(500).find(SA) : { items: [] },
        tIds.length ? liveTalent().hasSome('_id', tIds).limit(500).find(SA) : { items: [] }
    ]);
    const live = {};
    const vPre = learnPrefix(vs.items, 'venue'), tPre = learnPrefix(ts.items, 'talent');
    vs.items.forEach((v) => { live['venue:' + v._id] = fromVenue(v, vPre); });
    ts.items.forEach((t) => { live['talent:' + t._id] = fromTalent(t, tPre); });
    return {
        items: r.items.map((i) => {
            const l = live[i.itemType + ':' + i.itemId];
            return Object.assign({
                id: i._id, type: i.itemType, itemId: i.itemId, title: i.title, category: i.category, city: i.city,
                image: i.image, link: '', phone: '', email: ''
            }, l || {}, {
                id: i._id, itemId: i.itemId, status: STATUSES.includes(i.status) ? i.status : 'considering',
                note: i.note || '', available: !!l, enquiredAt: i.enquiredAt || i.addedAt || i._createdDate
            });
        })
    };
}

async function mine(id) {
    const m = await me();
    const row = await wixData.get(COL, String(id || ''), SA);
    if (!row || row.ownerId !== m._id) throw bad('That item is not on your list.');
    return row;
}
async function updateImpl(id, patch) {
    const row = await mine(id);
    patch = patch || {};
    if (patch.status !== undefined) {
        if (!STATUSES.includes(patch.status)) throw bad('Unknown status.');
        row.status = patch.status;
    }
    if (patch.note !== undefined) row.note = str(patch.note, 1000);
    row.updatedAt = new Date();
    await wixData.update(COL, row, SA);
    return { id: row._id, status: row.status, note: row.note };
}
// ============================================================================
//  Web methods — each returns { ok: true, ... } or { ok: false, error }.
//  Wix only registers a web method written literally as export const x = webMethod(...).
// ============================================================================
async function run(fn, args) {
    try { return Object.assign({ ok: true }, await fn(...args)); }
    catch (e) {
        if (e && e.name === 'ValidationError') return { ok: false, error: e.message };
        console.error('[shortlist]', e);
        return { ok: false, error: 'Something went wrong (' + String((e && e.message) || e).slice(0, 120) + ')' };
    }
}
export const shortlistList   = webMethod(Permissions.SiteMember, (...a) => run(listImpl, a));
export const shortlistUpdate = webMethod(Permissions.SiteMember, (...a) => run(updateImpl, a));

// ============================================================================
//  backend/admin.web.js — everything the Admin Dashboard reads and changes.
//
//  ADMIN ONLY. Every method checks the caller first (site owner, an email in
//  ADMIN_EMAILS, or the Admin contact label — see backend/config.js), so the
//  page being open to Everyone changes nothing.
//
//  What admins control, per collection:
//    Venues      hide / show · take down (with reason) / restore · claim email,
//                claim invite · delete (only venues no vendor owns yet)
//    Talent      hide / show · take down / restore · feature / unfeature
//    Catering, Packages, Promotions   hide / show
//    Weddings    publish / unpublish · guest list on / off
//    Enquiries   status (new / contacted / booked / declined)
//    TalentProfiles   suspend / lift suspension
//    TalentCategories add · show / hide in lists · reorder
//  And adds venues for owners to claim later: the venue is saved with
//  toBeClaimedByEmail, and when a vendor signs up with that email the venue
//  appears under "Venues waiting for you" on their dashboard to claim.
//
//  "Hidden" = the owner's switch (visibility); the owner can turn it back on.
//  "Taken down" = our decision (approved / approvalStatus = rejected); the
//  owner can't turn it back on. Restore puts it back live.
//
//  Every method returns { ok: true, ... } or { ok: false, error } — Wix hides
//  thrown backend errors, so nothing here throws to the page.
// ============================================================================
import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import wixCrmBackend, { triggeredEmails } from 'wix-crm-backend';
import { mediaManager } from 'wix-media-backend';
import { caller } from 'backend/access';
import { SITE_URL, SIGNUP_PAGE, publicUrl } from 'backend/config';

const SA = { suppressAuth: true };
const MAX = 1000;

function bad(msg) { const e = new Error(msg); e.name = 'ValidationError'; return e; }
const str = (v, max) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s ? s.slice(0, max) : null; };
const num = (v, min = 0, max = 1e9) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const strs = (v, max = 30) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80)))].slice(0, max) : [];
const validSrc = (s) => typeof s === 'string' && (s.startsWith('wix:image://') || s.startsWith('https://static.wixstatic.com/'));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const lc = (s) => String(s || '').trim().toLowerCase();
const iso = (d) => { if (!d) return null; const x = new Date(d); return isNaN(x) ? null : x.toISOString(); };

async function requireAdmin() {
    const c = await caller();
    if (!c.admin) throw bad('NOT_ADMIN');
    return c;
}

/* wix:image://v1/<id>/… → a small thumbnail URL the browser can load. */
function thumb(raw, w = 160, h = 120) {
    if (raw && typeof raw === 'object') raw = raw.src || raw.url || '';
    if (typeof raw !== 'string' || !raw) return '';
    const m = /^wix:image:\/\/v1\/([^/#]+)/.exec(raw);
    if (m) return `https://static.wixstatic.com/media/${m[1]}/v1/fill/w_${w},h_${h},al_c,q_75/file.jpg`;
    return raw.startsWith('https://') ? raw : '';
}
/* The listing's own public page: an item path (/venues/x), not the list page or the edit page. */
function viewLink(r) {
    const k = Object.keys(r || {}).find((x) => x.startsWith('link-') && typeof r[x] === 'string'
        && /^\/[^/]+\/[^/]+/.test(r[x]) && !/edit/i.test(r[x]));
    return k ? r[k] : '';
}
const refId = (v) => (v && typeof v === 'object' ? v._id : v) || '';

// --------------------------------------------------------------------------
//  Listing state — the same reading the vendor and talent dashboards use.
// --------------------------------------------------------------------------
const STATUS_FIELD = { Venues: 'approved', Talent: 'approvalStatus' };
const takenDown = (r, col) => String(r[STATUS_FIELD[col]] || '').trim().toLowerCase() === 'rejected';
function stateOf(r, col) {
    if (STATUS_FIELD[col] && takenDown(r, col)) return 'takenDown';
    return r.visibility === true ? 'live' : 'hidden';
}

// --------------------------------------------------------------------------
//  Lookups, loaded once per list for the rows being shaped
// --------------------------------------------------------------------------
async function byIds(collection, ids) {
    const list = [...new Set(ids.filter(Boolean))];
    if (!list.length) return {};
    const out = {};
    for (let i = 0; i < list.length; i += 200) {
        const res = await wixData.query(collection).hasSome('_id', list.slice(i, i + 200)).limit(200).find(SA);
        res.items.forEach((x) => { out[x._id] = x; });
    }
    return out;
}
async function countBy(collection, field, ids) {
    const list = [...new Set(ids.filter(Boolean))];
    const out = {};
    if (!list.length) return out;
    const res = await wixData.query(collection).hasSome(field, list).limit(MAX).find(SA);
    res.items.forEach((x) => { const k = refId(x[field]); out[k] = (out[k] || 0) + 1; });
    return out;
}
async function memberEmails(ids) {
    const list = [...new Set(ids.filter(Boolean))];
    const out = {};
    if (!list.length) return out;
    try {
        const res = await wixData.query('Members/PrivateMembersData').hasSome('_id', list).limit(MAX).find(SA);
        res.items.forEach((m) => { out[m._id] = m.loginEmail || ''; });
    } catch (e) { console.warn('[admin] member emails', e); }
    return out;
}

// --------------------------------------------------------------------------
//  Shaping — one function per list, used for whole lists and single rows
// --------------------------------------------------------------------------
const SHAPE = {
    async venues(rows) {
        const [owners, enq] = await Promise.all([
            byIds('VendorProfiles', rows.map((r) => refId(r.reference))),
            countBy('RequestDirectory', 'venueId', rows.map((r) => r._id))
        ]);
        return rows.map((r) => {
            const o = owners[refId(r.reference)];
            const unclaimed = !refId(r.reference) && r.venueClaimed !== true;
            return {
                id: r._id, title: r.venueName || r.title || 'Unnamed venue', city: r.city || '', image: thumb(r.image),
                state: stateOf(r, 'Venues'), reason: r.rejectionReason || '', link: viewLink(r),
                owner: o ? { name: o.title || '', email: o.email || '' } : null,
                unclaimed, claimEmail: unclaimed ? (r.toBeClaimedByEmail || '') : '',
                maxGuests: r.maximumGuests || null, pricePerGuest: r.pricePerGuestJod || null,
                enquiries: enq[r._id] || 0, created: iso(r._createdDate)
            };
        });
    },
    async talent(rows) {
        const [owners, enq] = await Promise.all([
            byIds('TalentProfiles', rows.map((r) => refId(r.owner))),
            countBy('TalentEnquiries', 'talentId', rows.map((r) => r._id))
        ]);
        return rows.map((r) => {
            const o = owners[refId(r.owner)];
            return {
                id: r._id, title: r.title || 'Untitled', category: r.category || '', city: r.city || '', image: thumb(r.heroImage),
                state: stateOf(r, 'Talent'), reason: r.rejectionReason || '', featured: r.featured === true,
                link: viewLink(r) || (r.slug ? `/talent/${r.slug}` : ''),
                owner: o ? { name: o.displayName || '', email: o.loginEmail || '', suspended: o.suspended === true } : null,
                priceFrom: r.priceFrom || null, enquiries: enq[r._id] || 0, created: iso(r.submittedAt || r._createdDate)
            };
        });
    },
    async catering(rows) { return offers(rows, (r) => ({ price: r.price || null, image: thumb(r.image) })); },
    async packages(rows) {
        return offers(rows, (r) => ({ price: r.price || null, until: iso(r.validUntilDate),
            expired: !!(r.validUntilDate && new Date(r.validUntilDate) < new Date()),
            guests: [r.guestCountMin, r.guestCountMax].filter((x) => x !== undefined && x !== null).join('–') }));
    },
    async promotions(rows) {
        return offers(rows, (r) => ({ discount: r.discountOrFixedAmount || '', from: iso(r.validDateRangeStart), until: iso(r.validDateRangeEnd),
            expired: !!(r.validDateRangeEnd && new Date(r.validDateRangeEnd) < new Date()) }));
    },
    async weddings(rows) {
        const ids = rows.map((r) => r._id);
        const [emails, guests, rsvps] = await Promise.all([
            memberEmails(rows.map((r) => r.ownerId)),
            countBy('Guests', 'weddingRef', ids),
            countBy('RSVPs', 'weddingRef', ids)
        ]);
        return rows.map((r) => ({
            id: r._id, title: [r.bride || r.brideAr, r.groom || r.groomAr].filter(Boolean).join(' & ') || r.title || r.slug || 'Wedding',
            slug: r.slug || '', link: r.slug ? publicUrl(r.slug) : '', date: iso(r.weddingDate), city: r.city || '', venue: r.venue || '',
            published: r.status === 'published', guestList: r.guestListEnabled !== false,
            owner: emails[r.ownerId] || '', guests: guests[r._id] || 0, replies: rsvps[r._id] || 0, created: iso(r._createdDate)
        }));
    },
    async venueEnquiries(rows) {
        return rows.map((r) => ({
            id: r._id, name: r.name || '', email: r.email || '', phone: r.phone || '', guests: r.numberOfGuests || null,
            dates: Array.isArray(r.suitableDates) ? r.suitableDates : (r.suitableDates ? [String(r.suitableDates)] : []),
            listing: r.venueName || '', ownerEmail: r.ownerEmail || '', status: r.status || 'new', emailed: r.emailSent === true,
            created: iso(r.submittedAt || r._createdDate)
        }));
    },
    async talentEnquiries(rows) {
        return rows.map((r) => ({
            id: r._id, name: r.name || '', email: r.email || '', phone: r.phone || '', guests: r.guestCount || null,
            date: iso(r.eventDate), budget: r.budget || null, message: r.message || '', listing: r.talentTitle || '',
            status: r.status || 'new', emailed: r.emailSent === true, created: iso(r.submittedAt || r._createdDate)
        }));
    },
    async vendors(rows) {
        const venues = await countBy('Venues', 'reference', rows.map((r) => r._id));
        return rows.map((r) => ({ id: r._id, name: r.title || '', email: r.email || '', phone: r.phoneNumber || '',
            position: r.vendorPosition || '', listings: venues[r._id] || 0, created: iso(r._createdDate) }));
    },
    async talentProfiles(rows) {
        const listings = await countBy('Talent', 'owner', rows.map((r) => r._id));
        return rows.map((r) => ({ id: r._id, name: r.displayName || '', email: r.loginEmail || '', phone: r.phone || '',
            city: r.city || '', suspended: r.suspended === true, listings: listings[r._id] || 0, created: iso(r._createdDate) }));
    },
    async categories(rows) {
        const res = await wixData.query('Talent').limit(MAX).find(SA);
        const used = {};
        res.items.forEach((t) => { used[t.category] = (used[t.category] || 0) + 1; });
        return rows.map((r) => ({ id: r._id, name: r.name || r.title || '', active: r.active !== false, sortOrder: r.sortOrder || 0, used: used[r.name] || 0 }));
    }
};
async function offers(rows, extra) {
    const owners = await byIds('VendorProfiles', rows.map((r) => refId(r.owner)));
    return rows.map((r) => Object.assign({
        id: r._id, title: r.title || 'Untitled', state: r.visibility === false ? 'hidden' : 'live',
        owner: owners[refId(r.owner)] ? { name: owners[refId(r.owner)].title || '', email: owners[refId(r.owner)].email || '' } : null,
        created: iso(r._createdDate)
    }, extra(r)));
}

/* Which collection each list reads, newest first. */
const LISTS = {
    venues:          { col: 'Venues' },
    talent:          { col: 'Talent' },
    catering:        { col: 'Catering' },
    packages:        { col: 'Packages' },
    promotions:      { col: 'Promotions' },
    weddings:        { col: 'Weddings' },
    venueEnquiries:  { col: 'RequestDirectory' },
    talentEnquiries: { col: 'TalentEnquiries' },
    vendors:         { col: 'VendorProfiles' },
    talentProfiles:  { col: 'TalentProfiles' },
    categories:      { col: 'TalentCategories', sort: 'sortOrder', asc: true }
};
async function shapeOne(kind, row) { return (await SHAPE[kind]([row]))[0]; }

// --------------------------------------------------------------------------
//  Email (never blocks a decision if a template isn't set up yet)
// --------------------------------------------------------------------------
async function emailAddress(email, templateId, variables) {
    const m = await wixData.query('Members/PrivateMembersData').eq('loginEmail', lc(email)).limit(1).find(SA);
    if (m.items.length) return triggeredEmails.emailMember(templateId, m.items[0]._id, { variables });
    const contactId = await wixCrmBackend.createContact({ emails: [email] });
    return wixCrmBackend.emailContact(templateId, contactId, { variables });
}
async function tryEmail(email, templateId, variables) {
    if (!email) return false;
    try { await emailAddress(email, templateId, variables); return true; }
    catch (e) { console.warn('[admin] email %s failed:', templateId, e); return false; }
}
async function ownerEmailOf(kind, r) {
    if (kind === 'venues' && refId(r.reference)) { const p = await wixData.get('VendorProfiles', refId(r.reference), SA).catch(() => null); return p ? { to: p.email, name: p.title } : null; }
    if (kind === 'talent' && refId(r.owner))     { const p = await wixData.get('TalentProfiles', refId(r.owner), SA).catch(() => null); return p ? { to: p.loginEmail, name: p.displayName } : null; }
    return null;
}

// ============================================================================
//  Overview
// ============================================================================
async function overviewImpl() {
    await requireAdmin();
    const q = (c) => wixData.query(c);
    const since = new Date(Date.now() - 30 * 86400000);
    const [
        vAll, vHidden, vDown, vUnclaimed, tAll, tHidden, tDown, tFeat,
        cAll, cHidden, pAll, pHidden, prAll, prHidden,
        wAll, wPub, gAll, rAll, veNew, ve30, teNew, te30, vendors, talents, suspended
    ] = await Promise.all([
        q('Venues').count(SA), q('Venues').ne('approved', 'rejected').eq('visibility', false).count(SA), q('Venues').eq('approved', 'rejected').count(SA),
        q('Venues').isEmpty('reference').ne('venueClaimed', true).count(SA),     // no owner yet = waiting to be claimed
        q('Talent').count(SA), q('Talent').ne('approvalStatus', 'rejected').eq('visibility', false).count(SA), q('Talent').eq('approvalStatus', 'rejected').count(SA),
        q('Talent').eq('featured', true).count(SA),
        q('Catering').count(SA), q('Catering').eq('visibility', false).count(SA),
        q('Packages').count(SA), q('Packages').eq('visibility', false).count(SA),
        q('Promotions').count(SA), q('Promotions').eq('visibility', false).count(SA),
        q('Weddings').count(SA), q('Weddings').eq('status', 'published').count(SA), q('Guests').count(SA), q('RSVPs').count(SA),
        q('RequestDirectory').eq('status', 'new').count(SA), q('RequestDirectory').gt('_createdDate', since).count(SA),
        q('TalentEnquiries').eq('status', 'new').count(SA), q('TalentEnquiries').gt('_createdDate', since).count(SA),
        q('VendorProfiles').count(SA), q('TalentProfiles').count(SA), q('TalentProfiles').eq('suspended', true).count(SA)
    ]);
    const [recentV, recentT] = await Promise.all([
        q('RequestDirectory').descending('_createdDate').limit(5).find(SA),
        q('TalentEnquiries').descending('_createdDate').limit(5).find(SA)
    ]);
    const recent = [
        ...(await SHAPE.venueEnquiries(recentV.items)).map((x) => Object.assign(x, { kind: 'venue' })),
        ...(await SHAPE.talentEnquiries(recentT.items)).map((x) => Object.assign(x, { kind: 'talent' }))
    ].sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0)).slice(0, 6);
    return {
        venues:  { total: vAll, live: vAll - vHidden - vDown, hidden: vHidden, takenDown: vDown, unclaimed: vUnclaimed },
        talent:  { total: tAll, live: tAll - tHidden - tDown, hidden: tHidden, takenDown: tDown, featured: tFeat },
        offers:  { catering: cAll, cateringHidden: cHidden, packages: pAll, packagesHidden: pHidden, promotions: prAll, promotionsHidden: prHidden },
        couples: { weddings: wAll, published: wPub, guests: gAll, replies: rAll },
        enquiries: { venueNew: veNew, venue30: ve30, talentNew: teNew, talent30: te30 },
        accounts: { vendors, talent: talents, suspended },
        recent
    };
}

// ============================================================================
//  Lists
// ============================================================================
async function listImpl(kind) {
    await requireAdmin();
    const L = LISTS[kind];
    if (!L) throw bad('Unknown list.');
    let q = wixData.query(L.col).limit(MAX);
    q = L.sort ? (L.asc ? q.ascending(L.sort) : q.descending(L.sort)) : q.descending('_createdDate');
    const res = await q.find(SA);
    return { kind, items: await SHAPE[kind](res.items), more: res.totalCount > res.items.length };
}

// ============================================================================
//  Actions
// ============================================================================
const ENQ_STATUS = ['new', 'contacted', 'booked', 'declined'];

async function actImpl(kind, id, action, extra) {
    await requireAdmin();
    extra = extra || {};
    const L = LISTS[kind];
    if (!L) throw bad('Unknown list.');

    if (kind === 'categories') return categoryAct(id, action, extra);

    const r = await wixData.get(L.col, String(id || ''), SA);
    if (!r) throw bad('That item no longer exists. Refresh the list.');
    const save = async (patch) => shapeOne(kind, await wixData.update(L.col, Object.assign({}, r, patch), SA));
    let emailed = null;

    // Hide / show — every listing type
    if (['venues', 'talent', 'catering', 'packages', 'promotions'].includes(kind) && (action === 'hide' || action === 'show')) {
        if (action === 'show' && STATUS_FIELD[L.col] && takenDown(r, L.col)) throw bad('This is taken down. Use Restore to put it back.');
        return { item: await save({ visibility: action === 'show' }) };
    }

    // Take down / restore — venues and talent
    if ((kind === 'venues' || kind === 'talent') && (action === 'takeDown' || action === 'restore')) {
        const field = STATUS_FIELD[L.col];
        if (action === 'takeDown') {
            const reason = str(extra.reason, 500);
            if (!reason) throw bad('Give a reason — the owner sees it word for word.');
            const patch = { [field]: 'rejected', visibility: false, rejectionReason: reason, approvedAt: null };
            if (kind === 'talent') patch.featured = false;           // a taken-down listing can't stay featured
            const item = await save(patch);
            if (extra.notify) {
                const o = await ownerEmailOf(kind, r);
                emailed = o ? await tryEmail(o.to, kind === 'venues' ? 'VENUE_REJECTED' : 'TALENT_REJECTED',
                    { name: o.name || '', listingTitle: item.title, reason }) : false;
            }
            return { item, emailed };
        }
        const item = await save({ [field]: 'approved', visibility: true, rejectionReason: null, approvedAt: new Date() });
        if (extra.notify) {
            const o = await ownerEmailOf(kind, r);
            emailed = o ? await tryEmail(o.to, kind === 'venues' ? 'VENUE_APPROVED' : 'TALENT_APPROVED', { name: o.name || '', listingTitle: item.title }) : false;
        }
        return { item, emailed };
    }

    // Talent: feature
    if (kind === 'talent' && (action === 'feature' || action === 'unfeature')) {
        if (action === 'feature' && stateOf(r, 'Talent') !== 'live') throw bad('Only live listings can be featured.');
        return { item: await save({ featured: action === 'feature' }) };
    }

    // Venues: claiming
    if (kind === 'venues' && (action === 'setClaim' || action === 'invite' || action === 'delete')) {
        const unclaimed = !refId(r.reference) && r.venueClaimed !== true;
        if (!unclaimed) throw bad('A vendor already owns this venue.');
        if (action === 'delete') {
            await wixData.remove('Venues', r._id, SA);
            return { removed: true };
        }
        if (action === 'setClaim') {
            const email = lc(extra.email);
            if (email && !EMAIL.test(email)) throw bad('That email address is not valid.');
            const item = await save({ toBeClaimedByEmail: email || null, venueClaimed: false });
            if (email && extra.invite) emailed = await sendClaimInvite(email, item.title);
            return { item, emailed };
        }
        if (!r.toBeClaimedByEmail) throw bad('Add the owner\'s email first.');
        emailed = await sendClaimInvite(r.toBeClaimedByEmail, r.venueName || r.title);
        if (!emailed) throw bad('The email could not be sent. Check that the VENUE_CLAIM_INVITE triggered email exists and is published.');
        return { item: await shapeOne(kind, r), emailed };
    }

    // Weddings
    if (kind === 'weddings') {
        if (action === 'publish' || action === 'unpublish') {
            const patch = { status: action === 'publish' ? 'published' : 'draft' };
            if (action === 'publish' && !r.publishedAt) patch.publishedAt = new Date();
            return { item: await save(patch) };
        }
        if (action === 'guestListOn' || action === 'guestListOff') return { item: await save({ guestListEnabled: action === 'guestListOn' }) };
    }

    // Enquiries
    if ((kind === 'venueEnquiries' || kind === 'talentEnquiries') && action === 'status') {
        if (!ENQ_STATUS.includes(extra.value)) throw bad('Unknown status.');
        return { item: await save({ status: extra.value }) };
    }

    // Talent accounts
    if (kind === 'talentProfiles' && (action === 'suspend' || action === 'unsuspend')) {
        return { item: await save({ suspended: action === 'suspend' }) };
    }

    throw bad('That action isn\'t available here.');
}

async function categoryAct(id, action, extra) {
    if (action === 'add') {
        const name = str(extra.name, 60);
        if (!name) throw bad('Type a category name.');
        const all = await wixData.query('TalentCategories').limit(MAX).find(SA);
        if (all.items.some((c) => lc(c.name) === lc(name))) throw bad('That category already exists.');
        const top = all.items.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0);
        const row = await wixData.insert('TalentCategories', { name, title: name, active: true, sortOrder: top + 1 }, SA);
        return { item: await shapeOne('categories', row) };
    }
    const r = await wixData.get('TalentCategories', String(id || ''), SA);
    if (!r) throw bad('That category no longer exists.');
    if (action === 'show' || action === 'hide') {
        return { item: await shapeOne('categories', await wixData.update('TalentCategories', Object.assign({}, r, { active: action === 'show' }), SA)) };
    }
    if (action === 'up' || action === 'down') {
        const all = (await wixData.query('TalentCategories').ascending('sortOrder').limit(MAX).find(SA)).items;
        const i = all.findIndex((c) => c._id === r._id), j = action === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= all.length) return { moved: false };
        [all[i], all[j]] = [all[j], all[i]];
        await wixData.bulkUpdate('TalentCategories', all.map((c, k) => Object.assign({}, c, { sortOrder: k + 1 })), SA);
        return { moved: true };
    }
    throw bad('That action isn\'t available here.');
}

async function sendClaimInvite(email, venueName) {
    return tryEmail(email, 'VENUE_CLAIM_INVITE', { venueName: venueName || 'your venue', signupUrl: SITE_URL + SIGNUP_PAGE });
}

// ============================================================================
//  Add a venue for its owner to claim
// ============================================================================
async function uploadPhotoImpl(dataUrl, name) {
    await requireAdmin();
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw bad('That file is not an image we can use. Try a JPG or PNG.');
    if (m[2].length > 1400000) throw bad('That photo is too large. Try a smaller one.');
    const base = String(name || 'photo').replace(/\.\w+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 50) || 'photo';
    const file = await mediaManager.upload('/Listings/admin', Buffer.from(m[2], 'base64'), `${base}.jpg`, {
        mediaOptions: { mimeType: m[1], mediaType: 'image' },
        metadataOptions: { isPrivate: false, isVisitorUpload: false }
    });
    return { url: file.fileUrl };
}

/* The same fields and rules as a vendor's own Add listing (backend/vendorCreate.web.js),
   saved with no owner and the claim email instead. Keep the two in step. */
async function createVenueImpl(payload, hero, gallery, claim) {
    await requireAdmin();
    const p = payload || {}, c = claim || {};
    const venueName = str(p.venueName, 120);
    if (!venueName) throw bad('A venue needs a name.');
    if (!validSrc(hero)) throw bad('A cover photo is required.');
    const minGuests = num(p.minGuests, 0, 100000), maxGuests = num(p.maxGuests, 0, 100000);
    if (minGuests !== null && maxGuests !== null && minGuests > maxGuests) throw bad('Minimum guests is higher than the maximum.');
    const emailContact = str(p.emailContact, 160);
    if (emailContact && !EMAIL.test(emailContact)) throw bad('That contact email is not valid.');
    const claimEmail = lc(c.email);
    if (claimEmail && !EMAIL.test(claimEmail)) throw bad('The owner\'s email is not valid.');
    const yn = (v) => (v === false ? 'No' : 'Yes');

    const row = {
        venueName, title: venueName, serviceCategory: 'Venue',
        city: str(p.city, 80), address: str(p.address, 200), distanceFrom7thCircleKm: num(p.distance, 0, 1000),
        locationType: str(p.locationType, 80), notes: str(p.description, 4000), tagline: str(p.tagline, 160),
        minimumGuests: minGuests, maximumGuests: maxGuests, preparationSuite: str(p.prepSuites, 80),
        websiteUrl: /^https?:\/\/\S+$/.test(String(p.websiteUrl || '')) ? String(p.websiteUrl).slice(0, 300) : null,
        venueTypes: strs(p.venueTypes), eventTypesSupported: strs(p.eventTypes), amenities: strs(p.amenities), popularMonths: strs(p.popularMonths, 12),
        startingPrice: num(p.startingPrice), pricePerGuestJod: num(p.pricePerGuest), pricePerPackageJod: num(p.pricePerPackage),
        depositToHoldVenueJod: num(p.depositToHold), cancellationNoticePeriod: str(p.cancellationNotice, 120),
        cateringPolicy: str(p.cateringPolicy, 400), alcoholPolicy: str(p.alcoholPolicy, 400), parking: str(p.parking, 400),
        phoneContact: str(p.phoneContact, 40), emailContact, venueLandline: str(p.venueLandline, 40),
        showPhone: yn(p.showPhone), showEmail: yn(p.showEmail), showAddress: yn(p.showAddress), showPricing: yn(p.showPricing),
        image: hero,
        galleryImagesCount: (Array.isArray(gallery) ? gallery : []).filter(validSrc).slice(0, 24)
            .map((src, i) => ({ type: 'image', itemId: String(i), src, title: '', description: '' })),
        approved: 'approved',
        visibility: c.visible === true,          // live before it's claimed only if you chose that
        toBeClaimedByEmail: claimEmail || null,
        venueClaimed: false
    };
    Object.keys(row).forEach((k) => { if (row[k] === null || row[k] === undefined || row[k] === '') delete row[k]; });

    const inserted = await wixData.insert('Venues', row, SA);
    const emailed = claimEmail && c.invite ? await sendClaimInvite(claimEmail, venueName) : null;
    return { item: await shapeOne('venues', inserted), emailed };
}

async function choicesImpl() {
    await requireAdmin();
    const res = await wixData.query('Venues').limit(MAX).find(SA);
    const cities = [...new Set(res.items.map((v) => (typeof v.city === 'string' ? v.city.trim() : '')).filter(Boolean))].sort();
    return {
        cities,
        locationTypes: ['Indoor Only', 'Outdoor Only', 'Indoor and Outdoor', 'Rooftop', 'Beachfront'],
        venueTypes:    ['Banquet Hall', 'Indoor Ballroom', 'Hotel', 'Outdoor Garden', 'Outdoor Terrace', 'Poolside', 'Farm', 'Restaurant'],
        eventTypes:    ['Wedding', 'Engagement', 'Katb el-Kitab', 'Henna night', 'Wedding reception', 'Bridal shower'],
        amenities:     ['Bridal suite', 'Dance floor', 'Wedding stage (kosha)', 'Sound system', 'Lighting', 'Parking', 'Valet', 'Air conditioning', 'Photo garden', 'Wheelchair access']
    };
}

async function whoAmIImpl() {
    const c = await caller();
    return { admin: !!c.admin, email: c.member ? c.member.loginEmail : '' };
}

// ============================================================================
//  Web methods. Wix only registers ones written literally as
//  `export const name = webMethod(...)`.
// ============================================================================
async function run(fn, args) {
    try { return Object.assign({ ok: true }, await fn(...args)); }
    catch (e) {
        if (e && e.name === 'ValidationError') return { ok: false, error: e.message };
        console.error('[admin]', e);
        return { ok: false, error: 'Something went wrong (' + String((e && e.message) || e).slice(0, 140) + ')' };
    }
}
export const adminWhoAmI       = webMethod(Permissions.Anyone,     (...a) => run(whoAmIImpl, a));
export const adminOverview     = webMethod(Permissions.SiteMember, (...a) => run(overviewImpl, a));
export const adminList         = webMethod(Permissions.SiteMember, (...a) => run(listImpl, a));
export const adminAct          = webMethod(Permissions.SiteMember, (...a) => run(actImpl, a));
export const adminChoices      = webMethod(Permissions.SiteMember, (...a) => run(choicesImpl, a));
export const adminUploadPhoto  = webMethod(Permissions.SiteMember, (...a) => run(uploadPhotoImpl, a));
export const adminCreateVenue  = webMethod(Permissions.SiteMember, (...a) => run(createVenueImpl, a));
// ============================================================================
//  backend/vendorCreate.web.js — the Add listing page: venues, catering options,
//  packages and promotions. Everything goes live immediately (no pre-approval);
//  an admin can take anything down by rejecting it.
//
//  The Add pages used to write straight from the browser, so anyone could save
//  a venue as approved and visible, or attach it to another vendor. Now:
//    · the vendor is worked out here from the login, never sent by the browser
//    · only known fields are saved, with the right types
//    · new listings are always pending review and hidden
//    · only the vendor's OWN venues / catering / packages can be linked
//  Admins and vendor accounts pass (older unlabelled accounts too).
// ============================================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { mediaManager } from 'wix-media-backend';
import { allowRole } from 'backend/access';

const SA = { suppressAuth: true };
const NOT_VENDOR = 'This account is registered as a different account type. Listings need a vendor account.';

function bad(msg) { const e = new Error(msg); e.name = 'ValidationError'; return e; }
const str = (v, max) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s ? s.slice(0, max) : null; };
const num = (v, min = 0, max = 1e9) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const strs = (v, max = 30) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80)))].slice(0, max) : [];
const validSrc = (s) => typeof s === 'string' && (s.startsWith('wix:image://') || s.startsWith('https://static.wixstatic.com/'));
const ids = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x).slice(0, 100) : [];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

async function myVendor() {
    const c = await allowRole('vendor', NOT_VENDOR);
    if (!c.member) throw bad('NOT_LOGGED_IN');
    const res = await wixData.query('VendorProfiles').eq('email', c.member.loginEmail).limit(1).find(SA);
    if (res.items.length) return res.items[0];
    // No profile yet: create it rather than stopping the vendor here.
    const cd = c.member.contactDetails || {};
    return wixData.insert('VendorProfiles', {
        title: [cd.firstName, cd.lastName].filter(Boolean).join(' ') || c.member.loginEmail,
        email: c.member.loginEmail, phoneNumber: ''
    }, SA);
}

async function owned(vendorId) {
    const [v, c, p] = await Promise.all([
        wixData.query('Venues').eq('reference', vendorId).limit(200).find(SA),
        wixData.query('Catering').hasSome('owner', [vendorId]).limit(200).find(SA),
        wixData.query('Packages').hasSome('owner', [vendorId]).limit(200).find(SA)
    ]);
    return { venues: v.items, catering: c.items, packages: p.items };
}
const keepOwned = (wanted, items) => { const ok = new Set(items.map((i) => i._id)); return ids(wanted).filter((id) => ok.has(id)); };

async function insertWithLinks(collection, row, links) {
    const inserted = await wixData.insert(collection, row, SA);
    try {
        for (const [field, list] of links) if (list.length) await wixData.insertReference(collection, field, inserted._id, list, SA);
    } catch (err) {
        await wixData.remove(collection, inserted._id, SA).catch(() => {});
        throw err;
    }
    return inserted;
}

/* Wedding-venue option lists. Vendors list VENUES only; photographers, DJs and
   other services are talent and have their own pages. */
const VENUE_CHOICES = {
    locationTypes: ['Indoor Only', 'Outdoor Only', 'Indoor and Outdoor', 'Rooftop', 'Beachfront'],
    venueTypes:    ['Banquet Hall', 'Indoor Ballroom', 'Hotel', 'Outdoor Garden', 'Outdoor Terrace', 'Poolside', 'Farm', 'Restaurant'],
    eventTypes:    ['Wedding', 'Engagement', 'Katb el-Kitab', 'Henna night', 'Wedding reception', 'Bridal shower'],
    amenities:     ['Bridal suite', 'Dance floor', 'Wedding stage (kosha)', 'Sound system', 'Lighting', 'Parking', 'Valet', 'Air conditioning', 'Photo garden', 'Wheelchair access']
};
async function choices() {
    // Only cities are taken from existing venues, so new ones match the search filter.
    const res = await wixData.query('Venues').limit(1000).find(SA);
    const cities = [...new Set(res.items.map((v) => (typeof v.city === 'string' ? v.city.trim() : '')).filter(Boolean))].sort();
    return Object.assign({ cities }, VENUE_CHOICES);
}

/** Everything the Add listing page needs. */
async function getAddPageDataImpl() {
    const opts = await getMyListingOptionsImpl();
    return Object.assign(opts, { choices: await choices() });
}

/** Photos from the form arrive as a compact JPEG data URL; returns a wix:image:// URL. */
async function uploadPhotoImpl(dataUrl, name) {
    const vendor = await myVendor();
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw bad('That file is not an image we can use. Try a JPG or PNG.');
    if (m[2].length > 1400000) throw bad('That photo is too large. Try a smaller one.');
    const base = String(name || 'photo').replace(/\.\w+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 50) || 'photo';
    const file = await mediaManager.upload(`/Listings/${vendor._id}`, Buffer.from(m[2], 'base64'), `${base}.jpg`, {
        mediaOptions: { mimeType: m[1], mediaType: 'image' },
        metadataOptions: { isPrivate: false, isVisitorUpload: true }
    });
    return { url: file.fileUrl };
}

// --------------------------------------------------------------------------
/** What the Add forms need on load. Errors: NOT_LOGGED_IN, NO_PROFILE. */
async function getMyListingOptionsImpl() {
    const vendor = await myVendor();
    const o = await owned(vendor._id);
    return {
        venues: o.venues.map((v) => ({ id: v._id, label: v.venueName || v.title || 'Untitled venue' })),
        catering: o.catering.map((c) => ({ id: c._id, label: c.title || 'Untitled catering option' })),
        packages: o.packages.map((p) => ({ id: p._id, label: p.title || 'Untitled package' }))
    };
}

// --------------------------------------------------------------------------
async function createVenueImpl(payload, hero, gallery) {
    const vendor = await myVendor();
    const p = payload || {};
    const venueName = str(p.venueName, 120);
    if (!venueName) throw bad('A venue needs a name.');
    if (!validSrc(hero)) throw bad('A cover photo is required.');
    const minGuests = num(p.minGuests, 0, 100000), maxGuests = num(p.maxGuests, 0, 100000);
    if (minGuests !== null && maxGuests !== null && minGuests > maxGuests) throw bad('Minimum guests is higher than the maximum.');
    const emailContact = str(p.emailContact, 160);
    if (emailContact && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailContact)) throw bad('That contact email is not valid.');

    const row = {
        venueName, title: venueName, serviceCategory: 'Venue',
        city: str(p.city, 80), address: str(p.address, 200), distanceFrom7thCircleKm: num(p.distance, 0, 1000),
        locationType: str(p.locationType, 80), notes: str(p.description, 4000),
        minimumGuests: minGuests, maximumGuests: maxGuests, preparationSuite: str(p.prepSuites, 80), websiteUrl: /^https?:\/\/\S+$/.test(String(p.websiteUrl || '')) ? String(p.websiteUrl).slice(0, 300) : null,
        venueTypes: strs(p.venueTypes), eventTypesSupported: strs(p.eventTypes), amenities: strs(p.amenities), popularMonths: strs(p.popularMonths, 12),
        startingPrice: num(p.startingPrice), pricePerGuestJod: num(p.pricePerGuest), pricePerPackageJod: num(p.pricePerPackage),
        depositToHoldVenueJod: num(p.depositToHold), cancellationNoticePeriod: str(p.cancellationNotice, 120),
        cateringPolicy: str(p.cateringPolicy, 400), alcoholPolicy: str(p.alcoholPolicy, 400), parking: str(p.parking, 400),
        phoneContact: str(p.phoneContact, 40), emailContact, venueLandline: str(p.venueLandline, 40),
        image: hero,
        galleryImagesCount: (Array.isArray(gallery) ? gallery : []).filter(validSrc).slice(0, 24)
            .map((src, i) => ({ type: 'image', itemId: String(i), src, title: '', description: '' })),
        approved: 'approved',                 // no pre-approval — live straight away
        visibility: true,
        reference: vendor._id
    };
    Object.keys(row).forEach((k) => { if (row[k] === null || row[k] === undefined || row[k] === '') delete row[k]; });

    const inserted = await wixData.insert('Venues', row, SA);
    try {
        await wixData.insertReference('VendorProfiles', 'venues', vendor._id, inserted._id, SA);
    } catch (err) {
        await wixData.remove('Venues', inserted._id, SA).catch(() => {});
        throw err;
    }
    return { id: inserted._id };
}

// --------------------------------------------------------------------------
async function createCateringImpl(payload, heroImage) {
    const vendor = await myVendor();
    const p = payload || {}, o = await owned(vendor._id);
    const title = str(p.cuisineName, 120), description = str(p.description, 2000), price = num(p.price);
    const venueIds = keepOwned(p.venueIds, o.venues);
    const missing = [!title && 'cuisine name', price === null && 'price', !description && 'description', !venueIds.length && 'venue', !validSrc(heroImage) && 'hero image'].filter(Boolean);
    if (missing.length) throw bad('Still missing: ' + missing.join(', ') + '.');

    const row = { title: title, description: description, image: heroImage, price, owner: vendor._id, visibility: true };
    const inserted = await insertWithLinks('Catering', row, [['venue', venueIds]]);
    return { id: inserted._id };
}

// --------------------------------------------------------------------------
async function createPackageImpl(payload) {
    const vendor = await myVendor();
    const p = payload || {}, o = await owned(vendor._id);
    const title = str(p.packageName, 120), description = str(p.description, 2000), price = num(p.price);
    const guestMin = num(p.guestMin, 0, 100000), guestMax = num(p.guestMax, 0, 100000);
    const venueIds = keepOwned(p.venueIds, o.venues), cateringIds = keepOwned(p.cateringIds, o.catering);
    const validUntil = ISO.test(String(p.validUntil || '')) ? day(p.validUntil) : null;
    const missing = [!title && 'name', price === null && 'price', !validUntil && 'expiry date', !description && 'description', !venueIds.length && 'venue', !cateringIds.length && 'catering option'].filter(Boolean);
    if (missing.length) throw bad('Still missing: ' + missing.join(', ') + '.');
    if (guestMin !== null && guestMax !== null && guestMin > guestMax) throw bad('Minimum guests is higher than the maximum.');

    const row = {
        title: title, description: description, price,
        guestCountMin: guestMin, guestCountMax: guestMax, guestCountRange: `${guestMin ?? ''}-${guestMax ?? ''}`,
        validUntilDate: validUntil, owner: vendor._id, visibility: true
    };
    const inserted = await insertWithLinks('Packages', row, [['venue', venueIds], ['cateringOptions', cateringIds]]);
    return { id: inserted._id };
}

// --------------------------------------------------------------------------
async function createPromotionImpl(payload) {
    const vendor = await myVendor();
    const p = payload || {}, o = await owned(vendor._id);
    const title = str(p.promotionName, 120), description = str(p.description, 2000);
    const type = p.discountType === 'percent' ? 'percent' : 'fixed';
    const value = num(p.discountValue, 0, 1e7);
    const start = ISO.test(String(p.startDate || '')) ? day(p.startDate) : null;
    const end = ISO.test(String(p.endDate || '')) ? day(p.endDate) : null;
    const venueIds = keepOwned(p.venueIds, o.venues), packageIds = keepOwned(p.packageIds, o.packages);
    const missing = [!title && 'name', !description && 'description', !(value > 0) && 'discount',
        type === 'percent' && value > 100 && 'a discount of 100% or less', !start && 'start date', !end && 'end date',
        start && end && end <= start && 'an end date after the start date', !venueIds.length && 'venue', !packageIds.length && 'package'].filter(Boolean);
    if (missing.length) throw bad('Still missing: ' + missing.join(', ') + '.');

    const row = {
        title: title, description: description, owner: vendor._id,
        discountType: type, discountValue: value,
        discountOrFixedAmount: type === 'percent' ? value + '%' : 'JOD ' + value,
        validDateRangeStart: start, validDateRangeEnd: end, visibility: true
    };
    const inserted = await insertWithLinks('Promotions', row, [['venue', venueIds], ['applicablePackages', packageIds]]);
    return { id: inserted._id };
}

// ============================================================================
//  Web methods. Each returns { ok: true, ... } or { ok: false, error }.
//  error is a message to show the vendor, or NO_PROFILE / NOT_LOGGED_IN /
//  SAVE_FAILED (anything unexpected — the details go to the site log).
// ============================================================================
// Wix only registers a web method written literally as
// `export const name = webMethod(...)`, so each one is spelled out below.
async function run(fn, args) {
    try {
        return Object.assign({ ok: true }, await fn(...args));
    } catch (e) {
        if (e && e.name === 'ValidationError') return { ok: false, error: e.message };
        console.error('[vendorCreate]', e);
        return { ok: false, error: 'SAVE_FAILED', detail: String((e && e.message) || e) };
    }
}

export const getAddPageData      = webMethod(Permissions.SiteMember, (...a) => run(getAddPageDataImpl, a));
export const uploadPhoto         = webMethod(Permissions.SiteMember, (...a) => run(uploadPhotoImpl, a));
export const getMyListingOptions = webMethod(Permissions.SiteMember, (...a) => run(getMyListingOptionsImpl, a));
export const createVenue         = webMethod(Permissions.SiteMember, (...a) => run(createVenueImpl, a));
export const createCatering      = webMethod(Permissions.SiteMember, (...a) => run(createCateringImpl, a));
export const createPackage       = webMethod(Permissions.SiteMember, (...a) => run(createPackageImpl, a));
export const createPromotion     = webMethod(Permissions.SiteMember, (...a) => run(createPromotionImpl, a));

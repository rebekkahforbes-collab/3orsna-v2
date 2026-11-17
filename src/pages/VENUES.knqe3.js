// ============================================================================
//  3orsna — Our Venues
//  Velo page code. Pair with 3orsna-venues-page.html inside an HTML iframe.
//
//  ELEMENTS THIS EXPECTS
//    #html1   HTML iframe — filters AND the card grid
//
//  #venuesDataset, the repeater, and every filter element can now be deleted.
//  This queries the collection directly, which is what lets the iframe render
//  the cards.
//
//  TRADE-OFF, so it is a choice and not a surprise: cards drawn inside an
//  iframe are not in the parent page's HTML, so Google will not index this grid
//  as venue content. Your individual venue dynamic pages are still indexed
//  normally and are what actually rank. If the listing grid needs to be
//  crawlable, keep a native repeater and go back to the filter-only build.
// ============================================================================

import wixData from 'wix-data';
import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';

const IFRAME    = '#html1';
const PAGE_SIZE = 9;            // venues per page — numbered pages, not "show more"

// Wix generates a link field per dynamic page, named link-<collection>-<field>.
// Its value is the full path — "/venue/terrace-gardens-venue" — already built
// from whatever prefix and key field the page uses. Reading it means the cards
// cannot drift out of step with the dynamic page settings.
//
// The hyphens mean it can only be read with bracket notation, never v.link...
// The venue page's link field is found by where it points (its name depends on
// how the dynamic page was created). Edit-page links are skipped.
// One venue's page (/venues/x) — not the list page (/venues) and not the edit page.
const viewLinkOf = (v) => { const k = Object.keys(v).find((x) => x.startsWith('link-') && typeof v[x] === 'string' && /^\/[^/]+\/[^/]+/.test(v[x]) && !/edit/i.test(v[x])); return k ? v[k] : null; };

// Only used if the link field is missing on a row.
const ROUTE_VENUE = '/venues';

const FALLBACK_LOCATION_TYPES = ['Indoor Only', 'Outdoor Only', 'Indoor and Outdoor', 'Rooftop', 'Beachfront'];
const FALLBACK_VENUE_TYPES = [
    'Banquet Hall', 'Indoor Ballroom', 'Hotel', 'Outdoor Garden',
    'Outdoor Terrace', 'Poolside', 'Farm', 'Restaurant'
];

let iframeReady = false;
let queued      = [];

$w.onReady(function () {

    $w(IFRAME).onMessage(async (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        // Links inside the iframe cannot navigate on their own — the component is
        // sandboxed on another origin, so a same-site href renders "Forbidden"
        // inside the box. The iframe hands the URL out here instead.
        if (msg.type === 'iframe:navigate') {
            wixLocation.to(msg.url);
            return;
        }


        // Changing page asks the page to scroll back up to the results once the
        // iframe has been sized to its content (nothing to scroll inside it then).
        if (msg.type === 'venues:scrollTo') {
            await $w(IFRAME).scrollTo().catch(() => {});
            if (msg.y > 0) await wixWindowFrontend.scrollBy(0, msg.y).catch(() => {});
            return;
        }

        if (msg.type === 'venues:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            return;
        }

        if (msg.type === 'venues:apply') {
            await search(msg.filters, msg.skip || 0);
        }
    });

    setup();
});

// --------------------------------------------------------------------------
function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}

// --------------------------------------------------------------------------
// Wix stores images as wix:image://v1/<fileId>/<name>#originWidth=...
// An <img src> cannot use that. Convert it to the static host and ask the image
// service for the exact size the card needs, so a 4000px original does not get
// shipped to a 270px card.
function imageUrl(raw, w = 720, h = 540) {
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;

    const match = /^wix:image:\/\/v1\/([^/]+)/.exec(raw);
    if (!match) return null;

    const fileId = match[1];
    return `https://static.wixstatic.com/media/${fileId}/v1/fill/w_${w},h_${h},al_c,q_80/file.jpg`;
}

function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function shape(v) {
    return {
        id:            v._id,
        name:          v.venueName || v.title || 'Unnamed venue',
        city:          v.city || null,
        locationType:  v.locationType || null,
        minGuests:     toNumber(v.minimumGuests),
        maxGuests:     toNumber(v.maximumGuests),
        pricePerGuest: toNumber(v.pricePerGuestJod),
        startingPrice: toNumber(v.startingPrice),
        tags:          Array.isArray(v.venueTypes) ? v.venueTypes : [],
        image:         imageUrl(v.image),
        url:           viewLinkOf(v) || (v.slug ? `${ROUTE_VENUE}/${v.slug}` : `${ROUTE_VENUE}/${v._id}`)
    };
}


// Public listings: switched on by the vendor AND approved by our team.
// Rows from before approvals existed have no status yet and still count.
function liveVenues() {
    // Live unless an admin rejected it — there's no pre-approval.
    return wixData.query('Venues').eq('visibility', true).ne('approved', 'rejected');
}

// --------------------------------------------------------------------------
async function setup() {
    let cities = [];
    let locationTypes = FALLBACK_LOCATION_TYPES;

    try {
        const res = await liveVenues()
            .limit(1000)
            .find();

        cities = [...new Set(res.items.map((v) => v.city).filter(Boolean))].sort();

        const found = [...new Set(res.items.map((v) => v.locationType).filter(Boolean))].sort();
        if (found.length) locationTypes = found;

        const total = await wixData.query('Venues').count();
        console.log(`[venues] ${res.totalCount} of ${total} venues have visibility === true`);

    } catch (err) {
        console.error('[venues] could not read filter options:', err);
    }

    send({
        type: 'venues:setup',
        cities,
        locationTypes,
        venueTypes: FALLBACK_VENUE_TYPES,
        initial: readUrlFilters()
    });
}

// --------------------------------------------------------------------------
async function search(f, skip) {
    try {
        let q = liveVenues();

        if (f.city) q = q.eq('city', f.city);
        if (f.locationType) q = q.eq('locationType', f.locationType);

        // Capacity overlap — your original logic, kept.
        if (isNum(f.guestsFrom)) q = q.ge('maximumGuests', f.guestsFrom);
        if (isNum(f.guestsTo))   q = q.le('minimumGuests', f.guestsTo);

        if (isNum(f.budget)) q = q.le('pricePerGuestJod', f.budget);

        if (f.venueTypes && f.venueTypes.length) {
            q = q.hasSome('venueTypes', f.venueTypes);
        }

        const res = await q
            .ascending('venueName')
            .skip(skip)
            .limit(PAGE_SIZE)
            .find();

        send({
            type: 'venues:results',
            items: res.items.map(shape),
            total: res.totalCount,
            skip,
            pageSize: PAGE_SIZE,
            hasMore: skip + res.items.length < res.totalCount
        });

        writeUrlFilters(f, Math.floor(skip / PAGE_SIZE) + 1);

    } catch (err) {
        console.error('[venues] search failed:', err);
        send({ type: 'venues:error' });
    }
}

// --------------------------------------------------------------------------
function isNum(v) { return typeof v === 'number' && !isNaN(v); }

const FILTER_KEYS = ['city', 'locationType', 'guestsFrom', 'guestsTo', 'budget', 'venueTypes', 'page'];

function writeUrlFilters(f, page) {
    const params = {};
    if (page > 1) params.page = String(page);   // so refresh and the back button keep the page
    if (f.city) params.city = f.city;
    if (f.locationType) params.locationType = f.locationType;
    if (isNum(f.guestsFrom)) params.guestsFrom = String(f.guestsFrom);
    if (isNum(f.guestsTo)) params.guestsTo = String(f.guestsTo);
    if (isNum(f.budget)) params.budget = String(f.budget);
    if (f.venueTypes && f.venueTypes.length) params.venueTypes = f.venueTypes.join('|');

    const stale = FILTER_KEYS.filter((k) => !(k in params));
    if (stale.length) wixLocation.queryParams.remove(stale);
    if (Object.keys(params).length) wixLocation.queryParams.add(params);
}

function readUrlFilters() {
    const q = wixLocation.query || {};
    const n = (v) => {
        if (v === undefined || v === '') return null;
        const parsed = Number(v);
        return isNaN(parsed) ? null : parsed;
    };
    return {
        city:         q.city || '',
        locationType: q.locationType || '',
        guestsFrom:   n(q.guestsFrom),
        guestsTo:     n(q.guestsTo),
        budget:       n(q.budget),
        venueTypes:   q.venueTypes ? q.venueTypes.split('|') : [],
        page:         Math.max(1, Math.floor(n(q.page) || 1))
    };
}

// ============================================================================
//  WHAT CHANGED BY MOVING THE CARDS INTO THE IFRAME
//
//  1. Images are now sized. A Wix repeater bound to image ships whatever
//     the vendor uploaded — often a 3000px phone photo — into a 270px card.
//     imageUrl() asks the Wix image service for 720x540 at q_80, which is
//     usually the difference between a 4 MB grid and a 400 KB one. Bump the w
//     and h arguments if you go to a wider card.
//
//  2. wix:image:// URIs do not work in an <img src>. If you ever build cards
//     like this again and the images come out blank, that is why — the URI has
//     to be converted to the static.wixstatic.com host first.
//
//  3. Paging is explicit. PAGE_SIZE is 9 with numbered pages (the page number is in the URL), using
//     skip/limit against totalCount, so the first paint is one small query
//     rather than the whole collection.
//
//  4. The count is real. Every result set carries totalCount, so the page can
//     say "Showing 12 of 47" instead of leaving people to guess.
//
//  5. SEO — see the note at the top. This grid is no longer in the parent
//     page's HTML. Your venue dynamic pages are unaffected.
//
//  STILL WORTH FIXING IN THE DATA
//
//  6. pricePerGuestJod holds strings, because the original listing form
//     inserted it without Number(). le() on a text column compares
//     alphabetically, so a budget of 30 hides venues priced at 9 and shows ones
//     priced at 300. The card display works either way, so this will look fine
//     while returning wrong results. Convert the column to Number and migrate
//     the existing rows.
//
//  7. Same for minimumGuests / maximumGuests if any were written as text — the
//     ge/le capacity filters have the identical failure mode.
//
//  8. If slug is not a field on Venues, card links fall back to /venue/<_id>.
//     Point ROUTE_VENUE at whatever your dynamic page actually uses.
// ============================================================================
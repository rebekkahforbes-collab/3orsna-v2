/* PAGE: HOME — "New venues" and "New wedding talent" section
   HTML iframe ID: #latestFrame  ←  iframes/home-latest.html

   Shows the 3 newest live venues and the 3 newest live talent listings, using
   the same "live" rule as the directories: switched on by the owner and not
   taken down by an admin. Cards link to each listing's own page.

   If HOME already has page code: put the two imports at the top of it (skip
   any that are already there — a duplicate import is an error) and paste the
   rest at the bottom. Wix runs every $w.onReady on the page, so it won't
   interfere with what's there. */
import wixData from 'wix-data';
import wixLocationFrontend from 'wix-location-frontend';

const LATEST_FRAME = '#latestFrame';
const LATEST_COUNT = 3;
// "See all" links: the venue and talent directory pages.
const LATEST_ROUTES = { venues: '/venues', talent: '/wedding-talent' };
// Fallback page prefix for a card whose own link Wix hasn't generated (the item pages).
const LATEST_ITEM_PREFIX = { venues: '/venues', talent: '/talent' };

$w.onReady(() => {
    const frame = $w(LATEST_FRAME);
    const latest = loadLatest();                       // start the queries straight away

    // Listener first, before anything is awaited, or the iframe waits forever.
    frame.onMessage(async ({ data: msg }) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'iframe:navigate') {
            if (typeof msg.url === 'string' && /^\/[^/]?/.test(msg.url)) wixLocationFrontend.to(msg.url);
            return;
        }
        if (msg.type === 'hl:ready') {
            frame.postMessage(Object.assign({ type: 'hl:data', venuesUrl: LATEST_ROUTES.venues, talentUrl: LATEST_ROUTES.talent }, await latest));
        }
    });
});

async function loadLatest() {
    const [venues, talent] = await Promise.all([
        wixData.query('Venues').eq('visibility', true).ne('approved', 'rejected')
            .descending('_createdDate').limit(LATEST_COUNT).find()
            .then((r) => r.items.map(latestVenue))
            .catch((e) => { console.error('[home latest] venues', e); return []; }),
        wixData.query('Talent').eq('visibility', true).ne('approvalStatus', 'rejected')
            .descending('_createdDate').limit(LATEST_COUNT).find()
            .then((r) => r.items.map(latestTalent))
            .catch((e) => { console.error('[home latest] talent', e); return []; })
    ]);
    return { venues, talent };
}

// wix:image://v1/<id>/… → a URL an <img> can load, at the size the card needs.
function latestImage(raw, w = 720, h = 540) {
    if (raw && typeof raw === 'object') raw = raw.src || '';
    if (!raw || typeof raw !== 'string') return null;
    if (raw.startsWith('http')) return raw;
    const m = /^wix:image:\/\/v1\/([^/]+)/.exec(raw);
    return m ? `https://static.wixstatic.com/media/${m[1]}/v1/fill/w_${w},h_${h},al_c,q_80/file.jpg` : null;
}
// "55 JOD", "Starting From 7000 JOD" or 55 → 55
function latestMoney(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const m = String(v).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
}
// The listing's own page: one item (/venues/x), not the list page or the edit page.
function latestLink(r) {
    const k = Object.keys(r).find((x) => x.startsWith('link-') && typeof r[x] === 'string' && /^\/[^/]+\/[^/]+/.test(r[x]) && !/edit/i.test(r[x]));
    return k ? r[k] : null;
}

function latestVenue(v) {
    return {
        name: v.venueName || v.title || 'Venue',
        city: v.city || null,
        maxGuests: latestMoney(v.maximumGuests),
        pricePerGuest: v.showPricing === 'No' ? null : latestMoney(v.pricePerGuestJod),
        startingPrice: v.showPricing === 'No' ? null : latestMoney(v.startingPrice),
        tags: Array.isArray(v.venueTypes) ? v.venueTypes : [],
        image: latestImage(v.image),
        url: latestLink(v) || `${LATEST_ITEM_PREFIX.venues}/${v.slug || v._id}`,
        created: v._createdDate
    };
}

function latestTalent(t) {
    return {
        title: t.title || 'Wedding talent',
        category: t.category || '',
        headline: t.headline || null,
        city: t.city || null,
        priceFrom: latestMoney(t.priceFrom),
        priceUnit: t.priceUnit || null,
        featured: t.featured === true,
        image: latestImage(t.heroImage),
        url: latestLink(t) || `${LATEST_ITEM_PREFIX.talent}/${t.slug || t._id}`,
        created: t.submittedAt || t._createdDate
    };
}

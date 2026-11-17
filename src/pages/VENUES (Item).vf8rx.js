// ============================================================================
//  3orsna — Venue detail (dynamic page)
//  Pair with 3orsna-venue-detail.html in an HTML iframe,
//  and backend/venueInquiry.jsw for the inquiry.
//
//  ELEMENTS THIS EXPECTS
//    #html1           HTML iframe    — the entire page body
//    #dynamicDataset  Dataset        — stays, it is how the page knows which venue
//
//  Everything else can be deleted: all six repeaters and their inner elements,
//  #datePicker, #selectedDatesText, #name, #email, #guests, #phone, #submitBtn,
//  #formError, #successMessage, #profile, and the section/title elements.
//
//  The ICON_MAP stays here because the icons are Wix media and the iframe needs
//  resolved https URLs. Long term these belong in a small Icons collection keyed
//  by slug, which is what the original comment said they were.
// ============================================================================

import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';
import wixData from 'wix-data';
import { sendInquiry, getVenueVendor } from 'backend/venueInquiry';
import { getMyRole } from 'backend/accounts.web';
import { authentication } from 'wix-members-frontend';
import { session } from 'wix-storage-frontend';
import { ROUTES } from 'public/routes';


const IFRAME = '#html1';

const ROUTE_VENUES  = '/venues';
const ROUTE_CLAIM   = '/claim-venue';

const ICON = {
    venueType:      'wix:image://v1/974d64_ecddbc0cce25498c9f5e9e9e20e469bd~mv2.png/wedding.png',
    capacity:       'wix:image://v1/974d64_90c8fa78f4c24f6c8daa38e8c9c2a1b2~mv2.png/cake.png',
    locationType:   'wix:image://v1/974d64_9ad0ba30a6724d07933510bceb106265~mv2.png/location.png',
    pricing:        'wix:image://v1/974d64_7026548ee430448faf11c2bf8744ca5c~mv2.png/price-tag.png',
    eventTypes:     'wix:image://v1/974d64_ecfe65a3b4e5426398a2cc90e617486d~mv2.png/party.png',
    parking:        'wix:image://v1/974d64_d6d5911e49d94ce8b4f65965c2e8cbf4~mv2.png/parking.png',
    prepSuite:      'wix:image://v1/974d64_bee35b76b5244957b9ba8848720e550c~mv2.png/dressing-table.png',
    rating:         'wix:image://v1/974d64_37e62a2ed33d406aa2dd706030a7eb55~mv2.png/star.png',
    alcoholPolicy:  'wix:image://v1/974d64_5ae8dc19b9224484b04959e91c13c078~mv2.png/alchohol.png',
    cateringPolicy: 'wix:image://v1/974d64_f12346c7bd054bb3876efc801d9a581c~mv2.png/cutlery.png',
    seating:        'wix:image://v1/974d64_d0270745221343cd84f8ebb0acb099c0~mv2.png/dinner-table.png',
    danceFloor:     'wix:image://v1/974d64_e2f68c757e0348d8bbee836fa7fec927~mv2.png/disco-ball.png',
    soundLighting:  'wix:image://v1/974d64_9e8bcbf5fc7e49e6bc669a313d529ff8~mv2.png/sound-system.png',
    stage:          'wix:image://v1/974d64_2dfd9e6eb87d4e57bb6742d4c8e54890~mv2.png/lighting.png',
    weddingCake:    'wix:image://v1/974d64_534ea34dd69046a685655584cb65e850~mv2.png/cake.png',
    dj:             'wix:image://v1/974d64_126698489ab748809774b25f911ffc84~mv2.png/music.png',
    decorations:    'wix:image://v1/974d64_f0e3be4d62bb440b9fb3049c76dad7e8~mv2.png/flower-bouquet.png'
};

const AMENITY_ICON = {
    'Seatings & Tables':  ICON.seating,
    'Dance Floor':        ICON.danceFloor,
    'Sound & Lighting':   ICON.soundLighting,
    'Stage':              ICON.stage,
    'Wedding Cake':       ICON.weddingCake,
    'DJ & Entertainment': ICON.dj,
    'Decorations':        ICON.decorations
};

let iframeReady = false;
let queued      = [];
let venueId     = null;

$w.onReady(function () {
    authentication.onLogin(sendViewer);
    authentication.onLogout(sendViewer);

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

        // The iframe asks the page to scroll once it has been sized to its content
        // (there is nothing left to scroll inside it): to the iframe, then down by y.
        if (msg.type === 'detail:scrollTo') {
            await $w(IFRAME).scrollTo().catch(() => {});
            if (msg.y > 0) await wixWindowFrontend.scrollBy(0, msg.y).catch(() => {});
            return;
        }
        if (msg.type === 'detail:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            await sendViewer();
            return;
        }
        if (msg.type === 'detail:signup') { goSignUp(); return; }
        if (msg.type === 'detail:login')  { authentication.promptLogin({ mode: 'login' }).catch(() => {}); return; }
        if (msg.type === 'detail:back')    { wixLocation.to(ROUTE_VENUES); return; }
        if (msg.type === 'detail:claim')   { wixLocation.to(ROUTE_CLAIM); return; }
        if (msg.type === 'detail:inquiry') { await handleInquiry(msg.payload); }
    });

    $w('#dynamicDataset').onReady(async function () {
        const venue = $w('#dynamicDataset').getCurrentItem();
        if (!venue) {
            console.error('[detail] no current item');
            send({ type: 'detail:error' });
            return;
        }
        venueId = venue._id;
        try {
            await build(venue);
        } catch (err) {
            // Without this, any throw inside build() means detail:data is never
            // sent and the iframe sits on its loading skeleton indefinitely.
            console.error('[detail] build failed:', err);
            send({ type: 'detail:error' });
        }
    });
});

// --------------------------------------------------------------------------
// Who is viewing — enquiries are for couples. The iframe shows a pop-up to
// anyone else; "Create a couple account" opens sign-up with Couple chosen and
// brings them back to this page afterwards.
async function sendViewer() {
    const me = await getMyRole().catch(() => null);
    send({ type: 'detail:viewer', viewer: me ? { loggedIn: !!me.loggedIn, role: me.role || '', admin: !!me.admin } : null });
}
function goSignUp() {
    session.setItem('signupRole', 'couple');
    session.setItem('returnTo', wixLocation.url);
    wixLocation.to(ROUTES.signup);
}
const GATE_CODES = ['LOGIN_REQUIRED', 'NEEDS_TYPE', 'COUPLE_ONLY'];

// --------------------------------------------------------------------------
function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}

// Wix media URI -> a real https URL at the size actually needed.
function media(raw, w = 1400, h = 800) {
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    const m = /^wix:image:\/\/v1\/([^/]+)/.exec(raw);
    if (!m) return null;
    return `https://static.wixstatic.com/media/${m[1]}/v1/fill/w_${w},h_${h},al_c,q_80/file.jpg`;
}
function icon(raw) {
    if (!raw) return null;
    const m = /^wix:image:\/\/v1\/([^/]+)/.exec(raw);
    return m ? `https://static.wixstatic.com/media/${m[1]}` : null;
}

const yes = (v) => v === 'Yes' || v === true;
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
};

// Your money columns hold strings with units: "55 JOD", "1500 JOD",
// "Starting From 7000 JOD". Number() on any of those is NaN, which is why every
// price rendered as "On request". Pull the first number out instead.
const money = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
};

// websiteUrl came through as markdown: "[www.terracegardens.jo](https://...)".
// Unwrap it, and add a scheme so the href is not treated as a relative path.
const website = (v) => {
    if (!v) return null;
    let raw = String(v).trim();
    const md = /\[[^\]]*\]\(([^)]+)\)/.exec(raw);
    if (md) raw = md[1].trim();
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw.replace(/^\/+/, '');
    return raw;
};
const list = (v) => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
const fmt = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

// Wix pre-fills a gallery item's title with the uploaded filename, so g.title
// arrives as things like "festive-wedding-table-with-burning-candles-crysta
// -2026-01-05-06-33-50-utc.jpg". That is not a caption. Only let through text a
// person actually wrote.
function caption(v) {
    if (!v) return null;
    const t = String(v).trim();
    if (!t) return null;

    // Any image extension means it is a filename.
    if (/\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(t)) return null;

    // Stock-library slugs: hyphen or underscore separated with no spaces.
    if (!/\s/.test(t) && /[-_]/.test(t)) return null;

    // Wix media ids, e.g. 974d64_a1b2c3~mv2
    if (/~mv2/i.test(t)) return null;

    // A bare timestamp is not a caption either.
    if (/^\d{4}[-_]\d{2}[-_]\d{2}/.test(t)) return null;

    return t;
}

// --------------------------------------------------------------------------
const EXPECTED = [
    'venueName', 'city', 'minimumGuests', 'maximumGuests',
    'pricePerGuestJod', 'venueTypes', 'amenities', 'image'
];

async function build(venue) {

    const absent = EXPECTED.filter((k) => venue[k] === undefined || venue[k] === null || venue[k] === '');
    if (absent.length) {
        console.warn('[detail] fields absent on this venue:', absent.join(', '));
    }

    const [vendor, cateringRes, packagesRes, promotionsRes] = await Promise.all([
        // Through the backend, so only what the vendor chose to show leaves the server.
        venue.reference
            ? getVenueVendor(venue._id).then((r) => (r && r.vendor) || null).catch((e) => { console.warn('[detail] vendor load failed:', e); return null; })
            : Promise.resolve(null),
        wixData.queryReferenced('Venues', venue._id, 'Catering_venue').catch(() => ({ items: [] })),
        wixData.queryReferenced('Venues', venue._id, 'Packages_venue').catch(() => ({ items: [] })),
        wixData.queryReferenced('Venues', venue._id, 'Promotions_venue').catch(() => ({ items: [] }))
    ]);

    // ---- price headline ----
    const perGuest = money(venue.pricePerGuestJod);
    const perPack  = money(venue.pricePerPackageJod);
    const starting = money(venue.startingPrice);
    let priceHeadline = 'On request';
    let priceCaption  = null;

    if (venue.showPricing === 'No') {
        priceHeadline = 'On request';
        priceCaption  = 'Contact the venue for a quote.';
    } else if (perGuest != null) {
        priceHeadline = `JOD ${perGuest}`;
        priceCaption  = 'per guest';
    } else if (perPack != null) {
        priceHeadline = `JOD ${perPack}`;
        priceCaption  = 'per package';
    } else if (starting != null) {
        priceHeadline = `From JOD ${starting}`;
    }

    // ---- specifics ----
    const facts = [];
    const push = (key, value, ic) => { if (value !== null && value !== undefined && value !== '') facts.push({ key, value: String(value), icon: icon(ic) }); };

    if (list(venue.venueTypes).length) push('Venue type', list(venue.venueTypes).join(', '), ICON.venueType);

    const gMin = num(venue.minimumGuests), gMax = num(venue.maximumGuests);
    if (gMin != null && gMax != null) push('Guest capacity', `${gMin} – ${gMax}`, ICON.capacity);
    else if (gMax != null) push('Guest capacity', `Up to ${gMax}`, ICON.capacity);

    if (venue.locationType) push('Location type', list(venue.locationType).join(', '), ICON.locationType);
    if (list(venue.eventTypesSupported).length) push('Event types', list(venue.eventTypesSupported).join(', '), ICON.eventTypes);
    if (venue.preparationSuite) push('Preparation suite', venue.preparationSuite, ICON.prepSuite);
    if (venue.alcoholPolicy) push('Alcohol policy', venue.alcoholPolicy, ICON.alcoholPolicy);
    if (venue.cateringPolicy) push('Catering policy', venue.cateringPolicy, ICON.cateringPolicy);
    if (venue.parking) push('Parking', venue.parking, ICON.parking);
    if (venue.city) push('City', venue.city, ICON.locationType);
    if (yes(venue.showAddress) && venue.address) push('Address', venue.address, ICON.locationType);
    if (num(venue.distanceFrom7thCircleKm) != null) push('From 7th Circle', `${num(venue.distanceFrom7thCircleKm)} km`, ICON.locationType);

    // ---- amenities ----
    const amenities = list(venue.amenities).map((a) => ({
        key: 'Included', value: a, icon: icon(AMENITY_ICON[a] || '')
    }));

    // ---- pricing and terms ----
    const pricing = [];
    if (venue.showPricing !== 'No') {
        if (perGuest != null) pricing.push({ key: 'Per guest', value: `JOD ${perGuest}`, icon: icon(ICON.pricing) });
        if (perPack != null) pricing.push({ key: 'Per package', value: `JOD ${perPack}`, icon: icon(ICON.pricing) });
        if (money(venue.depositToHoldVenueJod) != null) pricing.push({ key: 'Deposit to hold', value: `JOD ${money(venue.depositToHoldVenueJod)}`, icon: icon(ICON.pricing) });
    }
    if (venue.cancellationNoticePeriod) pricing.push({ key: 'Cancellation notice', value: venue.cancellationNoticePeriod });
    if (list(venue.popularMonths).length) pricing.push({ key: 'Busiest months', value: list(venue.popularMonths).join(', ') });

    // ---- gallery ----
    const rawGallery = venue.galleryImages || venue.galleryImagesCount || venue.mediagallery || [];
    const venueLabel = venue.venueName || venue.title || 'Venue';
    const gallery = (Array.isArray(rawGallery) ? rawGallery : [])
        .map((g, i) => ({
            src: media(g.src, 900, 675),
            // description first — if a vendor wrote anything, it went there.
            caption: caption(g.description) || caption(g.title),
            alt: `${venueLabel}, photo ${i + 1}`
        }))
        .filter((g) => g.src);

    // ---- offers ----
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dayMs = 86400000;

    // Catering options carry a required hero image. The card was ignoring it.
    const catering = cateringRes.items
        .map((c) => ({
            title: c.title || 'Catering option',
            description: c.description || '',
            image: media(c.image, 640, 360),
            amount: money(c.price) != null ? `JOD ${money(c.price)} per guest` : null,
            sort: money(c.price)
        }))
        .sort((a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity));

    // A package's whole purpose is that it expires. Showing one past its
    // validUntilDate means quoting a price the vendor has withdrawn.
    const stillValid = (raw) => {
        if (!raw) return true;                       // no expiry set = always on
        const end = new Date(raw);
        end.setHours(0, 0, 0, 0);
        return end >= today;                         // inclusive of the last day
    };
    const livePackages = packagesRes.items.filter((p) => stillValid(p.validUntilDate));

    const expiredPackageCount = packagesRes.items.length - livePackages.length;
    if (expiredPackageCount) {
        console.log(`[detail] hid ${expiredPackageCount} expired package(s)`);
    }

    // What catering each package includes. One query per package — venues have
    // a handful, so this is cheap. Revisit if that stops being true.
    const includedPerPackage = await Promise.all(
        livePackages.map((p) =>
            wixData.queryReferenced('Packages', p._id, 'cateringOptions')
                .then((r) => r.items.map((c) => c.title).filter(Boolean))
                .catch(() => [])
        )
    );

    const packages = livePackages
        .map((p, i) => {
            const lo = num(p.guestCountMin), hi = num(p.guestCountMax);
            let guests = null;
            if (lo != null && hi != null) guests = `${lo}\u2013${hi} guests`;
            else if (p.guestCountRange) guests = `${p.guestCountRange} guests`;

            let expiry = null;
            if (p.validUntilDate) {
                // Normalise both ends to local midnight. validUntilDate is stored
                // at midday UTC, so a raw diff rounds up and overstates the time
                // left — telling someone they have 13 days when they have 12.
                const end = new Date(p.validUntilDate);
                end.setHours(0, 0, 0, 0);
                const daysLeft = Math.round((end - today) / dayMs);

                if (daysLeft <= 0) expiry = 'Last day to book';
                else if (daysLeft === 1) expiry = 'Only 1 day left to book';
                else if (daysLeft <= 30) expiry = `Only ${daysLeft} days left to book`;
                else expiry = `Book by ${fmt(p.validUntilDate)}`;
            }

            return {
                title: p.title || 'Package',
                description: p.description || '',
                amount: money(p.price) != null ? `JOD ${money(p.price)}` : null,
                when: [guests, expiry].filter(Boolean).join('  \u00b7  ') || null,
                includes: includedPerPackage[i],
                urgent: expiry ? expiry.startsWith('Only') : false,
                sort: money(p.price)
            };
        })
        .sort((a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity));

    // Same expiry logic for promotions — a live discount that has lapsed is
    // worse than a hidden one. Remove this filter if you want them to persist.
    const promotions = promotionsRes.items
      .filter((p) => stillValid(p.validDateRangeEnd))
      .map((p) => {
        const a = fmt(p.validDateRangeStart), b = fmt(p.validDateRangeEnd);
        return {
            title: p.title || 'Promotion',
            description: p.description || '',
            amount: p.discountType === 'percent' && num(p.discountValue) != null
                ? `${num(p.discountValue)}% off`
                : (num(p.discountValue) != null ? `JOD ${num(p.discountValue)} off` : (p.discountOrFixedAmount || null)),
            when: a && b ? `${a} – ${b}` : null
        };
    });

    // ---- vendor ----
    // The vendor's contact card: name always; photo, phone and email as the
    // vendor set them on their dashboard (already filtered by the backend).
    let vendorOut = null;
    if (vendor && vendor.name) {
        vendorOut = {
            name: vendor.name,
            position: vendor.position || null,
            about: vendor.about || null,
            image: vendor.image ? media(vendor.image, 200, 200) : null,
            phone: vendor.phone || null,
            email: vendor.email || null
        };
    }

    send({
        type: 'detail:data',
        venue: {
            id: venue._id,
            name: venue.venueName || venue.title || 'Venue',
            tagline: venue.tagline || null,
            city: venue.city ? `${venue.city}, Jordan` : null,
            rating: num(venue.rating),
            reviewCount: num(venue.reviewCount),
            notes: venue.notes || null,
            heroImage: media(venue.image, 1400, 800),
            venueTypes: list(venue.venueTypes),
            eventTypes: list(venue.eventTypesSupported),
            highlights: buildHighlights(venue),
            priceHeadline,
            priceCaption,
            phone: yes(venue.showPhone) ? (venue.phoneContact || (vendor && vendor.phone) || null) : null,
            email: yes(venue.showEmail) ? (venue.emailContact || (vendor && vendor.email) || null) : null,
            website: website(venue.websiteUrl),
            videoUrl: venue.videoUrl || null,
            claimable: !venue.reference,
            backUrl: ROUTE_VENUES,
            facts, amenities, pricing, gallery, catering, packages, promotions,
            vendor: vendorOut
        }
    });
}

// --------------------------------------------------------------------------
function buildHighlights(venue) {
    const out = [];
    const gMax = num(venue.maximumGuests);
    if (gMax != null) out.push(`Seats up to ${gMax} guests`);
    if (venue.preparationSuite && venue.preparationSuite !== 'None') out.push('Private preparation suite');
    if (venue.cateringPolicy) out.push(venue.cateringPolicy);
    if (venue.parking && venue.parking !== 'None') out.push(`${venue.parking} parking`);
    return out.slice(0, 4);
}

// --------------------------------------------------------------------------
async function handleInquiry(payload) {
    // sendInquiry returns { ok, error } instead of throwing (Wix hides thrown messages).
    const res = await sendInquiry(venueId, payload)
        .catch((err) => ({ ok: false, error: 'That did not send. Try again in a moment.', detail: String((err && err.message) || err) }));
    if (!res.ok) console.warn('[detail] inquiry refused:', res.error, res.detail || '');
    const code = GATE_CODES.includes(res.error) ? res.error : '';
    send({
        type: 'detail:inquiryResult',
        ok: !!res.ok,
        code,
        message: res.ok
            ? (res.emailSent ? 'Sent. The venue will be in touch shortly.' : 'Received. We have logged your request and will pass it on.')
            : (code ? '' : (res.error || 'That did not send. Try again in a moment.'))
    });
}

// ============================================================================
//  NOTES ON THE ORIGINAL CODE
//
//  1. SECURITY — sendRequestEmail was called from the browser with a
//     client-supplied ownerEmail. A web method is a public endpoint, so anyone
//     could POST to it with any recipient and any body: an open email relay on
//     your sending domain. submitInquiry() now takes only the venue id and the
//     enquirer's own details, and re-derives the recipient from the venue's
//     vendor profile server-side.
//
//  2. PRIVACY — console.log(JSON.stringify(venue)) and the same for the vendor
//     ran on a public page, printing the full vendor record including email and
//     phone to the browser console regardless of the showEmail / showPhone
//     flags those fields were meant to respect. Removed.
//
//  3. forEachItem() was called immediately after setting .data on all six
//     repeaters. Assigning .data is asynchronous; forEachItem only visits
//     items that are already rendered, so on a cold load it frequently visits
//     nothing and the repeaters stay blank. onItemReady, registered before the
//     assignment, is the correct pair. Moot now — no repeaters.
//
//  4. The multi-date picker was a Wix datePicker with an onChange that pushed
//     into an array. The picker's own value stayed on whichever date was
//     clicked last, so the control showed one date while the array held five,
//     and the "max 5" limit only did console.warn — silent to the user. It is a
//     real multi-select calendar now, with the chosen dates shown as removable
//     chips and an explicit limit message.
//
//  5. suitableDates stored toLocaleDateString('en-GB') strings like
//     "29/07/2026". Locale-dependent, unsortable, unqueryable, and ambiguous
//     with US format in the same collection. Stored as Dates now — which also
//     means you can finally query "which venues were asked about in March".
//
//  6. numberOfGuests was a string.
//
//  7. The three "Nothing Listed Yet" titles were assigned to sections that had
//     just been collapsed, so nobody ever saw them. Empty sections are simply
//     not rendered now.
//
//  8. submitBtn.label was set to 'Request Sent' and never restored, so a second
//     inquiry needed a page reload.
//
//  9. There was no email format validation on either side.
//
// 10. A failed email was swallowed with console.warn while the UI showed
//     success. The record now carries an emailSent flag so undelivered
//     inquiries are findable, and the confirmation wording differs.
//
// 11. Gallery images went straight to <img> as wix:image:// URIs, which do not
//     load. That is what the broken tile in your screenshot was. All media is
//     converted to static.wixstatic.com at a requested size, and a failed load
//     falls back to a quiet "Photo unavailable" tile instead of sprawling alt
//     text across the grid.
//
// 12. ICON_MAP was 17 hardcoded media URIs in page code, with a comment saying
//     they came from an Icons CMS. They still are hardcoded here. Worth moving
//     to a small Icons collection keyed by slug so a designer can swap one
//     without a deploy.
// ============================================================================
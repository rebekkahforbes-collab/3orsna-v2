// ============================================================================
//  3orsna — Venue Dashboard (vendor)
//  Pair with vendor-dashboard.html in the HTML iframe (#html1),
//  and backend/vendorDashboard.jsw for every read and write.
//
//  ELEMENTS THIS EXPECTS
//    #html1   HTML iframe — the whole dashboard
//
//  PAGE SETUP
//    A Member's Private Page. Pick "Member's Private Page", NOT "Member Page" —
//    a Member Page is reachable at another member's slug.
//
//  REPLACES
//    The Update Your Venues page (3orsna-venues-list.html + velo-venues-page-code.js
//    + backend/vendorVenues.jsw). Everything that page did is here, alongside
//    claiming and account details. Keep one or the other, not both — two pages
//    writing the same visibility flag is how they drift.
// ============================================================================

import wixLocation from 'wix-location';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { session } from 'wix-storage-frontend';
import { vdLoad, vdSetVisibility, vdClaim, vdSaveProfile, vdEnquiries, vdSetEnquiryStatus }
    from 'backend/vendorDashboard';

const IFRAME = '#html1';

// The only place page URLs are written. The iframe receives these and builds
// its own links, so nothing hardcodes a path twice.
// Edit and View links are not here on purpose — they come from Wix's generated
// link fields, read in backend/vendorDashboard.jsw, so they follow whatever the
// dynamic pages are actually set to.
// The four Add buttons all open the one Add listing page. These are markers,
// not real URLs — the navigate handler below catches them, remembers which
// tab to open, and goes to the plain page URL from public/routes.js.
const ROUTES = {
    add:           '/add-listing/venue',
    addPackage:    '/add-listing/package',
    addPromotion:  '/add-listing/promotion',
    addCatering:   '/add-listing/catering',
    contact:       '/contact'
};

const ROUTE_LOGIN        = '/login';
const ROUTE_VENDOR_SETUP = '/vendor-setup';

// Set false once things are working.
const DEBUG = true;
const SHOW_ERROR_DETAILS = true;

let iframeReady = false;
let queued      = [];

$w.onReady(async function () {
    requireRole('vendor');   // sends the wrong account type to their own dashboard — never delays the iframe listener below

    $w(IFRAME).onMessage(async (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        // Links inside the iframe cannot navigate on their own — the component is
        // sandboxed on another origin, so a same-site href renders "Forbidden"
        // inside the box. The iframe hands the URL out here instead.
        if (msg.type === 'iframe:navigate') {
            const add = /\/add-listing\/(venue|catering|package|promotion)/.exec(String(msg.url || ''));
            if (add) {
                session.setItem('addListingType', add[1]);
                wixLocation.to(URLS.vendorAddListing);
                return;
            }
            // If a link does nothing, this line tells you whether the click even
            // reached Velo, and with what URL.
            if (DEBUG) console.log('[page] navigate ->', msg.url);
            wixLocation.to(msg.url);
            return;
        }

        if (msg.type === 'vd:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            await load();
            return;
        }
        if (msg.type === 'vd:refresh') {
            await load();
            return;
        }
        if (msg.type === 'vd:visibility') {
            await visibility(msg.id, msg.visible);
            return;
        }
        if (msg.type === 'vd:claim') {
            await doClaim(msg.id);
            return;
        }
        if (msg.type === 'vd:saveProfile') {
            await profile(msg.patch);
        }
        if (msg.type === 'vd:enquiryStatus') {
            await enquiryStatus(msg.id, msg.status);
        }
    });
});

// --------------------------------------------------------------------------
// The backend returns { ok, result } / { ok: false, error } instead of throwing
// (Wix hides thrown error messages). Turn a refusal back into the error this
// page already knows how to handle.
function unwrap(res) {
    if (res && res.ok) return res.result;
    const e = new Error((res && res.error) || 'UNEXPECTED');
    if (res && res.validation) e.name = 'ValidationError';
    e.detail = res && res.detail;
    throw e;
}

function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}

function block(title, message, actionLabel, actionHref) {
    send({ type: 'vd:blocked', title, message, actionLabel, actionHref });
}

// --------------------------------------------------------------------------
async function load() {
    try {
        const data = unwrap(await vdLoad());

        if (DEBUG) {
            console.log('[page] venues received:', (data.venues || []).length);
            (data.venues || []).forEach((v) => {
                console.log('  ', v.name, '| view:', v.link || 'NULL', '| edit:', v.editLink || 'NULL');
            });
            console.log('[page] claims:', (data.claims || []).length, '| counts:', JSON.stringify(data.counts));
        }

        send({ type: 'vd:data', ...data, routes: ROUTES, baseUrl: wixLocation.baseUrl });
        await enquiries();
    } catch (err) {
        console.error('[venueDashboard] load failed:', err);
        route(err);
    }
}

// --------------------------------------------------------------------------
// Venue enquiries (RequestDirectory) — shown in the dashboard's Enquiries tab.
async function enquiries() {
    const r = await vdEnquiries().catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
    send({ type: 'vd:enquiries', ok: !!r.ok, data: r.result, error: r.ok ? '' : (r.detail || r.error) });
}

async function enquiryStatus(id, status) {
    const r = await vdSetEnquiryStatus(id, status).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
    send({ type: 'vd:enquiryStatusResult', ok: !!r.ok, id, status,
           error: r.ok ? '' : (r.error === 'NOT_YOURS' ? 'That enquiry is not for one of your venues.' : (r.detail || r.error)) });
}

// --------------------------------------------------------------------------
async function visibility(id, visible) {
    try {
        const res = unwrap(await vdSetVisibility(id, visible));
        send({
            type: 'vd:visResult',
            id,
            ok: true,
            message: res.visible
                ? 'Now visible in search.'
                : 'Hidden from search. Nothing was deleted.'
        });
    } catch (err) {
        console.error('[venueDashboard] visibility failed:', err);
        send({
            type: 'vd:visResult',
            id,
            ok: false,
            message: friendly(err, 'We could not change that. Try again in a moment.')
        });
    }
}

// --------------------------------------------------------------------------
async function doClaim(id) {
    try {
        unwrap(await vdClaim(id));
        send({
            type: 'vd:claimResult',
            id,
            ok: true,
            // Says what happened next, because a claimed venue does NOT go live
            // straight away and a bare "Claimed" would imply it had.
            message: 'Claimed. It is in your venues below, hidden until you have checked the details and made it visible.'
        });
    } catch (err) {
        console.error('[venueDashboard] claim failed:', err);
        send({
            type: 'vd:claimResult',
            id,
            ok: false,
            message: friendly(err, 'We could not claim that venue. Try again in a moment.')
        });
    }
}

// --------------------------------------------------------------------------
async function profile(patch) {
    try {
        unwrap(await vdSaveProfile(patch));
        send({ type: 'vd:profileSaved', ok: true, message: 'Saved.' });
    } catch (err) {
        console.error('[venueDashboard] profile save failed:', err);
        send({
            type: 'vd:profileSaved',
            ok: false,
            message: friendly(err, 'That did not save. Try again in a moment.')
        });
    }
}

// --------------------------------------------------------------------------
function route(err) {
    switch (err && err.message) {
        case 'NOT_LOGGED_IN':
            wixLocation.to(ROUTE_LOGIN);
            return;
        case 'NO_PROFILE':
            block(
                'Finish your vendor profile',
                'Your venues live under a vendor profile, and we could not find one for your account.',
                'Set up your profile',
                ROUTE_VENDOR_SETUP
            );
            return;
        default:
            // While testing, show the technical reason. Set SHOW_ERROR_DETAILS to false at launch.
            block('We could not load your venues',
                'Refresh the page to try again.' +
                (SHOW_ERROR_DETAILS ? ` (${(err && (err.detail || err.message)) || err})` : ''));
    }
}

function friendly(err, fallback) {
    if (err && err.name === 'ValidationError') {
        // NOT_YOURS is deliberately not spelled out — telling someone a venue
        // exists but belongs to another account is information they should not get.
        if (err.message === 'NOT_YOURS') return 'That venue is not on your account.';
        if (err.message === 'NO_PROFILE') return 'We could not find your vendor profile. Refresh and try again.';
        return err.message;   // our own wording, e.g. the missing-fields list
    }
    return fallback;
}

// ============================================================================
//  NOTES
//
//  1. Every read and write derives the vendor profile server-side from the
//     caller's login email and refuses a venue whose reference does not match.
//     The page this replaces called wixData.update with suppressAuth from the
//     browser, where suppressAuth is ignored — so the only protection was the
//     Venues collection permission. Set that back to Admin once this is live.
//
//  2. Claiming re-checks toBeClaimedByEmail server-side, case-insensitively.
//     Filtering the list by it is not access control; the original never
//     re-checked at all, so any member could claim any venue by id.
//
//  3. A claimed venue arrives HIDDEN. Somebody else entered those details, and
//     publishing them unread is how a wrong phone number goes live. The
//     confirmation says so rather than just "Claimed".
//
//  4. Making a venue visible is refused while a cover photo, price per guest,
//     guest capacity or description is missing — and the error names which. A
//     venue missing capacity is excluded from the guest filter entirely, so
//     publishing it wastes everyone's time. Each row shows the same list without
//     needing a click.
//
//  5. The claim failure path rolls the venue back if the reference insert fails.
//     Otherwise it would be marked claimed, its toBeClaimedByEmail wiped, and
//     linked to nobody — gone from both lists with no way back through the UI.
//
//  6. Money is parsed, not trusted. pricePerGuestJod holds "55 JOD", so
//     Number() on it is NaN and the card would show no price while the venue
//     looked fine.
//
//  7. View links use Wix's generated link-venues-title rather than a
//     hardcoded prefix, so they follow the dynamic page settings.
//
//  8. Not built here: the vendor cannot see their booking enquiries.
//     RequestDirectory has no vendor-facing view, same gap the talent dashboard
//     just closed for TalentEnquiries. It would be a fourth tab.
// ============================================================================
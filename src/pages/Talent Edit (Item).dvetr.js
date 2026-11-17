// ============================================================================
//  3orsna — Edit Your Listing (freelancer)
//  Pair with 3orsna-talent-edit.html in an HTML iframe,
//  backend/talentEdit.jsw for the reads and writes,
//  and backend/talentMedia.jsw for new photos.
//
//  ELEMENTS THIS EXPECTS
//    #html1   HTML iframe — the whole page
//
//  ROUTING — DYNAMIC PAGE
//    Collection: Talent.  URL: /talent-edit/{slug}  (or whatever you name it).
//    #dynamicDataset supplies the listing; there is no picker, because the
//    dashboard is the list.
//
//    A dynamic route is PUBLIC by default and Wix adds every item to your
//    sitemap, so set two things on this page:
//        Permissions -> Members only
//        SEO         -> hide from search engines
//    Neither is the security boundary. backend/talentEdit.jsw refuses any listing
//    whose owner does not match the caller, so a non-owner who reaches the URL
//    gets a block rather than somebody else's form. Those settings stop the URLs
//    being published, which is a different problem.
// ============================================================================

import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { loadMine, saveMine } from 'backend/talentEdit';
import { uploadTalentImage } from 'backend/talentMedia';

const IFRAME = '#html1';

const ROUTE_LOGIN     = '/login';
const ROUTE_SUBMIT    = URLS.talentOnboarding;
const ROUTE_CONTACT   = '/contact';
const ROUTE_DASHBOARD = URLS.talentDashboard;

let iframeReady = false;
let queued      = [];
let started     = false;

$w.onReady(async function () {
    requireRole('talent');   // sends the wrong account type to their own dashboard — never delays the iframe listener below

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
        if (msg.type === 'te:scrollTo') {
            await $w(IFRAME).scrollTo().catch(() => {});
            if (msg.y > 0) await wixWindowFrontend.scrollBy(0, msg.y).catch(() => {});
            return;
        }
        if (msg.type === 'te:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            if (started) return;              // the iframe repeats "ready" until it hears back
            started = true;
            await start();
            return;
        }
        if (msg.type === 'te:reload') {
            // Discard changes: re-fetch the saved version of the same listing.
            await open(msg.id);
            return;
        }
        if (msg.type === 'te:upload') {
            await handleUpload(msg.index, msg.base64, msg.name);
            return;
        }
        if (msg.type === 'te:save') {
            await handleSave(msg.id, msg.patch);
        }
    });
});

// --------------------------------------------------------------------------
function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}

function block(title, message, actionLabel, actionHref) {
    send({ type: 'te:blocked', title, message, actionLabel, actionHref });
}

// --------------------------------------------------------------------------
async function start() {
    $w('#dynamicDataset').onReady(async function () {
        const item = $w('#dynamicDataset').getCurrentItem();

        if (!item) {
            console.error('[talentEdit] no current item on the dataset');
            block(
                'We could not find that listing',
                'The link may be out of date.',
                'Your dashboard',
                ROUTE_DASHBOARD
            );
            return;
        }

        console.log('[talentEdit] dataset item:', item._id, item.title || '');
        await open(item._id);
    });
}

// --------------------------------------------------------------------------
async function open(id) {
    try {
        const data = await loadMine(id);
        send({ type: 'te:data', ...data, baseUrl: wixLocation.baseUrl });

        // Reflect the open listing in the URL so a refresh returns to it, and a
        // vendor can bookmark the one they are working on.
        if ((wixLocation.query || {}).id !== id) {
            wixLocation.queryParams.add({ id });
        }
    } catch (err) {
        console.error('[talentEdit] open failed:', err);
        route(err);
    }
}

// --------------------------------------------------------------------------
async function handleUpload(index, base64, name) {
    const res = await uploadTalentImage(base64, name).catch(() => ({ ok: false, error: 'SERVER' }));
    if (res.ok) return send({ type: 'te:uploaded', index, ok: true, url: res.url });
    console.error('[talentEdit] upload failed at index', index, res.error, res.detail);
    send({
        type: 'te:uploaded', index, ok: false,
        // The backend's own wording names the problem (format, size, too many).
        message: res.error && !['SERVER', 'NOT_LOGGED_IN'].includes(res.error)
            ? res.error : `Photo ${index + 1} would not upload. Press Save to try again.`
    });
}

// --------------------------------------------------------------------------
async function handleSave(id, patch) {
    try {
        const res = await saveMine(id, patch);

        // No review on edits: saving a live listing keeps it live.
        const message = res.state === 'live' ? 'Saved and live.'
            : res.state === 'hidden' ? 'Saved. This listing is hidden — switch it on from your dashboard when you\'re ready.'
            : 'Saved.';

        send({ type: 'te:saved', ok: true, state: res.state, message });

    } catch (err) {
        console.error('[talentEdit] save failed:', err);

        if (err && ['NOT_LOGGED_IN', 'NO_PROFILE', 'ACCOUNT_SUSPENDED', 'NOT_YOURS', 'NOT_FOUND'].includes(err.message)) {
            route(err);
            return;
        }

        send({
            type: 'te:saved',
            ok: false,
            message: err && err.name === 'ValidationError'
                ? err.message
                : 'That did not save. Try again in a moment.'
        });
    }
}

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
function route(err) {
    switch (err && err.message) {
        case 'NOT_LOGGED_IN':
            wixLocation.to(ROUTE_LOGIN);
            return;
        case 'NO_PROFILE':
            block(
                'You do not have a listing yet',
                'Create one and you will be able to edit it here.',
                'Create your listing',
                ROUTE_SUBMIT
            );
            return;
        case 'ACCOUNT_SUSPENDED':
            block(
                'Your account is on hold',
                'Editing is paused on this account. Get in touch and we will sort it out.',
                'Contact us',
                ROUTE_CONTACT
            );
            return;
        case 'NOT_YOURS':
        case 'NOT_FOUND':
            // Same wording for both on purpose. Distinguishing them tells
            // someone probing slugs which ones exist.
            block(
                'We could not find that listing',
                'It may have been removed, or it belongs to another account.',
                'Your dashboard',
                ROUTE_DASHBOARD
            );
            return;
        default:
            block('We could not load your listings', 'Refresh the page to try again.');
    }
}

// ============================================================================
//  NOTES
//
//  1. Ownership is checked on every backend call, not by the dataset. The
//     dataset happily serves any row, so the filter that matters is server-side.
//
//  2. NOT_YOURS and NOT_FOUND return identical wording. Telling a prober that a
//     given id exists but belongs to someone else is information they should
//     not get.
//
//  3. Editing a rejected listing clears rejectionReason and resubmits it. That
//     is the point of the page — a rejection the vendor cannot respond to is a
//     dead end, and the reviewer's note is shown verbatim at the top so they
//     know what to change.
//
//  4. Editing a LIVE listing publishes straight away, EXCEPT when the title,
//     category, starting price or pricing unit changes — those are the claims a
//     couple decides on, so they go back for review. The banner on the page says
//     so before anyone edits, rather than surprising them after they save.
//     Flip REVIEW_EVERY_EDIT in the backend if you want all edits re-reviewed;
//     the cost is that vendors stop fixing typos.
//
//  5. Existing photos arrive already uploaded, carrying their stored URI. The
//     upload loop skips anything with a url already set, so re-saving does not
//     re-upload or duplicate them in the Media Manager. Only newly added photos
//     are sent.
//
//  6. The backend re-reads the row before writing rather than merging into a
//     snapshot from page load, and only writes the EDITABLE allowlist. visibility,
//     featured and approvedAt are admin decisions, so a crafted payload cannot
//     self-publish or self-feature.
//
//  7. Renaming is checked against the vendor's other listings, since a duplicate
//     title is rejected at submission too.
//
//  8. No picker. The dashboard lists the vendor's listings and links here with
//     the generated dynamic-page link for each one.
// ============================================================================
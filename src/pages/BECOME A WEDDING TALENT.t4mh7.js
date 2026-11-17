// ============================================================================
//  3orsna — List Yourself (freelancer submission)
//  Pair with 3orsna-talent-submit.html in an HTML iframe,
//  backend/talentSubmit.jsw for the row, and backend/talentMedia.jsw for images.
//
//  ELEMENTS THIS EXPECTS ON THE PAGE
//    #html1   HTML iframe — everything, including the photo picker
//
//  No UploadButton. The iframe picks the files, resizes them on a canvas, and
//  posts them one at a time; this file relays each to the backend, which puts it
//  in the Media Manager and returns a wix:image:// URI.
//
//  Why one at a time: a resized photo is roughly 300 KB, which is a comfortable
//  postMessage payload. Thirteen of them in a single message would not be.
// ============================================================================

import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { getSubmitContext, submitListing } from 'backend/talentSubmit';
import { uploadTalentImage } from 'backend/talentMedia';

const IFRAME = '#html1';

const ROUTE_LOGIN     = '/login';
const ROUTE_DIRECTORY = '/wedding-talent';   // the WEDDING TALENT directory page
const ROUTE_CONTACT   = '/contact';
const ROUTE_DASHBOARD = URLS.talentDashboard;

// Long enough to read the confirmation, short enough not to feel stuck.
const REDIRECT_AFTER_MS = 1800;

let iframeReady = false;
let queued      = [];

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
        if (msg.type === 'ts:scrollTo') {
            await $w(IFRAME).scrollTo().catch(() => {});
            if (msg.y > 0) await wixWindowFrontend.scrollBy(0, msg.y).catch(() => {});
            return;
        }
        if (msg.type === 'ts:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            return;
        }
        if (msg.type === 'ts:upload') {
            await handleUpload(msg.index, msg.base64, msg.name);
            return;
        }
        if (msg.type === 'ts:submit') {
            await handleSubmit(msg.account, msg.listing, msg.media);
        }
    });

    setup();
});

// --------------------------------------------------------------------------
function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}

function block(title, message, actionLabel, actionHref) {
    send({ type: 'ts:blocked', title, message, actionLabel, actionHref });
}

// --------------------------------------------------------------------------
async function setup() {
    try {
        const ctx = await getSubmitContext();
        send({ type: 'ts:setup', ...ctx });
    } catch (err) {
        console.error('[talentSubmit] setup failed:', err);

        if (err.message === 'NOT_LOGGED_IN') {
            wixLocation.to(ROUTE_LOGIN);
            return;
        }
        if (err.message === 'ACCOUNT_SUSPENDED') {
            block(
                'Your account is on hold',
                'New listings are paused on this account. Get in touch and we will sort it out.',
                'Contact us',
                ROUTE_CONTACT
            );
            return;
        }
        block('We could not open the form', 'Refresh the page to try again.');
    }
}

// --------------------------------------------------------------------------
async function handleUpload(index, base64, name) {
    try {
        const res = await uploadTalentImage(base64, name);
        send({ type: 'ts:uploaded', index, ok: true, url: res.url });
    } catch (err) {
        console.error('[talentSubmit] upload failed at index', index, err);
        send({
            type: 'ts:uploaded',
            index,
            ok: false,
            // The backend's own wording names the actual problem — wrong format,
            // too large, too many. A generic message would hide that.
            message: err && err.name === 'ValidationError'
                ? err.message
                : `Photo ${index + 1} would not upload. Press Submit to try again.`
        });
    }
}

// --------------------------------------------------------------------------
async function handleSubmit(account, listing, media) {
    try {
        if (!media || !media.heroImage) {
            send({ type: 'ts:result', ok: false, message: 'Add at least one photo before submitting.' });
            return;
        }

        const res = await submitListing(account, listing, media);

        send({
            type: 'ts:result',
            ok: true,
            message: 'Couples can find you in the directory now. Taking you to your dashboard…',
            // Kept as a fallback: if the redirect is blocked or slow, there is
            // still something to click rather than a dead end.
            actionLabel: 'Go to your dashboard',
            actionHref: ROUTE_DASHBOARD
        });

        // The dashboard shows the new listing as In review, which says the same
        // thing as a static confirmation page but leaves them somewhere useful.
        setTimeout(() => wixLocation.to(ROUTE_DASHBOARD), REDIRECT_AFTER_MS);

    } catch (err) {
        console.error('[talentSubmit] submit failed:', err);
        send({
            type: 'ts:result',
            ok: false,
            message: err && err.name === 'ValidationError'
                ? err.message
                : 'That did not save. Try again in a moment.'
        });
    }
}

// ============================================================================
//  NOTES
//
//  1. No UploadButton means no native Wix element to style, no mismatch between
//     the iframe's palette and the editor's, and no instruction telling the
//     vendor to use a control that sits outside the form they are filling in.
//
//  2. The resize happens in the browser, before anything is sent. A 4 MB phone
//     photo becomes about 300 KB at 1600px, which is smaller than the card grid
//     needs anyway. Two consequences worth knowing: uploads are fast even on a
//     Jordanian mobile connection, and your Media Manager stops filling up with
//     originals nobody displays.
//
//  3. Re-encoding through a canvas strips EXIF. Phone photos carry GPS
//     coordinates, and these land on a public profile page — so this is a
//     privacy fix, not just a size one.
//
//  4. Uploads are resumable. Each successful one is remembered in the iframe, so
//     if photo nine fails, pressing Submit again re-sends only nine onward.
//     Nothing already uploaded is duplicated.
//
//  5. Images are written to the Media Manager BEFORE the row exists. If the
//     insert then fails, the files are orphaned in /talent. They are small and
//     harmless, but if it bothers you, a scheduled job comparing Media Manager
//     contents against Talent.heroImage and portfolio will find them.
//
//  6. backend/talentMedia.jsw is a public endpoint. It requires a logged-in
//     member, caps decoded bytes, checks the actual file signature rather than
//     the claimed MIME type, and counts uploads per member per backend instance.
//     A filename and a Content-Type are both just strings the caller chose.
//
//  7. The first photo is the cover. The vendor can promote any other one with
//     "Make cover", which reorders rather than duplicating.
//
//  8. On success the page redirects to the talent dashboard after a short pause,
//     rather than ending on a confirmation screen. The new listing is already
//     there marked In review, so the dashboard carries the same message and
//     leaves them somewhere they can act. The confirmation still renders first,
//     with a manual link in case the redirect does not fire.
// ============================================================================
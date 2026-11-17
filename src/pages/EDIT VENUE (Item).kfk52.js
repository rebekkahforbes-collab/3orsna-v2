// ============================================================================
//  3orsna — Edit Venue (dynamic page)
//  Pair with 3orsna-edit-venue.html in an HTML iframe,
//  and backend/vendorVenueEdit.jsw for the reads and writes.
//
//  ELEMENTS THIS EXPECTS
//    #html1           HTML iframe — the whole form
//    #dynamicDataset  Dataset     — only used to learn which venue this is
//
//  Everything else goes: all 17 #input* fields, the three #dropdown*, the six
//  #checkboxShow*, the four #tags*, the three #checkboxGroup*, #profile,
//  #btnSave and #txtStatus.
//
//  Note the dataset is no longer the source of the field values. It tells us the
//  venue id; the backend then re-reads the record and checks that the signed-in
//  member actually owns it before sending anything back.
// ============================================================================

import wixLocation from 'wix-location';
import { requireRole } from 'public/role-guard';
import { loadVenueForEdit, saveVenue } from 'backend/vendorVenueEdit';
import { uploadListingImage } from 'backend/listingMedia';

const IFRAME = '#html1';

const ROUTE_LOGIN        = '/login';
const ROUTE_VENDOR_SETUP = '/vendor-setup';
const ROUTE_DASHBOARD    = '/vendor-dashboard';

// The iframe builds its Back button from this, so the path is written once.
const ROUTES = { dashboard: ROUTE_DASHBOARD };

let iframeReady = false;
let queued      = [];
let venueId     = null;
let isDirty     = false;

// One in-flight save: the form data, the photo plan, and the uploads as they
// land. Held here because the images arrive as separate messages after it.
let pending = null;

$w.onReady(async function () {
    requireRole('vendor');   // sends the wrong account type to their own dashboard — never delays the iframe listener below

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
        if (msg.type === 'edit:height') {
            $w(IFRAME).height = Math.max(700, Math.ceil(msg.height));
            return;
        }
        if (msg.type === 'edit:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            return;
        }
        if (msg.type === 'edit:dirty') {
            isDirty = !!msg.dirty;
            return;
        }
        if (msg.type === 'edit:save') {
            pending = {
                fields: msg.fields,
                links: msg.links,
                plan: msg.media || { hero: 'keep', gallery: [] },
                expected: Number(msg.mediaCount) || 0,
                done: 0,
                uploads: [],        // index -> wix:image:// url
                failed: false,
                chain: Promise.resolve()
            };
            return;
        }
        if (msg.type === 'edit:media') {
            if (!pending) return;
            pending.chain = pending.chain.then(() => storeImage(msg));
            return;
        }
        if (msg.type === 'edit:media:done') {
            if (!pending) return;
            pending.chain = pending.chain.then(() => handleSave());
        }
    });

    $w('#dynamicDataset').onReady(async function () {
        const item = $w('#dynamicDataset').getCurrentItem();
        if (!item) {
            block('We could not find that venue', 'The link may be out of date.', 'Back to dashboard', ROUTE_DASHBOARD);
            return;
        }
        venueId = item._id;
        await load();
    });
});

// --------------------------------------------------------------------------
function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}

function block(title, message, actionLabel, actionHref) {
    send({ type: 'edit:blocked', title, message, actionLabel, actionHref });
}

function progress(message) {
    send({ type: 'edit:progress', message });
}

// --------------------------------------------------------------------------
async function load() {
    try {
        const data = await loadVenueForEdit(venueId);
        send({ type: 'edit:data', ...data, routes: ROUTES });
    } catch (err) {
        console.error('[edit] load failed:', err);
        route(err);
    }
}

// --------------------------------------------------------------------------
/** One newly picked photo: base64 in, Media Manager URL out. */
async function storeImage(msg) {
    if (!pending || pending.failed) return;
    try {
        pending.done += 1;
        progress(`Uploading photo ${pending.done} of ${pending.expected}…`);

        pending.uploads[msg.index] = await uploadListingImage({
            base64: msg.data,
            fileName: msg.name,
            mimeType: msg.mimeType
        });
    } catch (err) {
        console.error('[edit] image upload failed:', err);
        pending.failed = true;
        send({
            type: 'edit:saveResult',
            ok: false,
            message: 'One of your photos would not upload, so nothing was saved. Try again, or remove that photo and save.'
        });
    }
}

// --------------------------------------------------------------------------
async function handleSave() {
    if (!pending || pending.failed) { pending = null; return; }

    const { fields, links, plan, uploads } = pending;

    try {
        progress('Saving your changes…');

        // Turn the plan into plain values the backend can write. It never sees
        // base64 — only the URLs the uploads produced, plus the srcs of photos
        // that were already on the record.
        const media = {
            hero: plan.hero === 'keep' ? 'keep'
                : plan.hero === 'remove' ? null
                : (uploads[plan.heroIndex] || 'keep'),
            gallery: Array.isArray(plan.gallery)
                ? plan.gallery
                    .map((g) => (g && g.existing ? g.existing : uploads[g && g.newIndex]))
                    .filter(Boolean)
                : null
        };

        const res = await saveVenue(venueId, fields, links, media);

        // Say what actually happened to the linked lists rather than a bare tick.
        const bits = [];
        Object.keys(res.links || {}).forEach((k) => {
            const r = res.links[k];
            if (r.added) bits.push(`${r.added} ${k} linked`);
            if (r.removed) bits.push(`${r.removed} ${k} unlinked`);
        });

        let message = bits.length ? `Saved. ${bits.join(', ')}.` : 'Saved.';
        if (res.resubmitted) {
            message = 'Saved and sent back for review. Our team usually looks within two working days.';
        }

        send({
            type: 'edit:saveResult',
            ok: true,
            message,
            resubmitted: res.resubmitted === true,
            // The saved photo state, so the form can adopt it and a second save
            // does not re-upload everything.
            media: res.media
        });

    } catch (err) {
        console.error('[edit] save failed:', err);
        send({
            type: 'edit:saveResult',
            ok: false,
            message: friendly(err, 'That did not save. Try again in a moment.')
        });
    } finally {
        pending = null;
    }
}

// --------------------------------------------------------------------------
function route(err) {
    const code = err && err.message;

    if (code === 'NOT_LOGGED_IN') {
        wixLocation.to(ROUTE_LOGIN);
        return;
    }
    if (code === 'NO_VENDOR_PROFILE') {
        block(
            'Finish your vendor profile',
            'Venues are edited through a vendor profile, and we could not find one for your account.',
            'Set up your profile',
            ROUTE_VENDOR_SETUP
        );
        return;
    }
    if (code === 'NOT_YOURS') {
        block(
            'This venue is not on your account',
            'You can only edit venues linked to your own vendor profile. If you believe this one should be yours, claim it from your dashboard.',
            'Back to dashboard',
            ROUTE_DASHBOARD
        );
        return;
    }
    if (code === 'IN_REVIEW') {
        // Reachable by URL even though the dashboard hides the Edit link, which
        // is exactly why the backend refuses rather than the browser.
        block(
            'This listing is being reviewed',
            'Our team is checking the details, so it cannot be edited right now. You will be able to change it again once it is approved, usually within two working days.',
            'Back to dashboard',
            ROUTE_DASHBOARD
        );
        return;
    }
    if (code === 'NOT_FOUND') {
        block('That venue no longer exists', 'It may have been removed.', 'Back to dashboard', ROUTE_DASHBOARD);
        return;
    }
    block('We could not load this venue', 'Refresh the page to try again.');
}

function friendly(err, fallback) {
    if (err && err.name === 'ValidationError') {
        switch (err.message) {
            case 'NOT_LOGGED_IN':     return 'Your session expired. Refresh and sign in again.';
            case 'NO_VENDOR_PROFILE': return 'We could not find your vendor profile. Refresh and try again.';
            case 'NOT_FOUND':         return 'That venue no longer exists.';
            case 'NOT_YOURS':         return 'That venue is not on your account.';
            case 'IN_REVIEW':         return 'This listing is with our team for review, so it cannot be changed right now.';
            default:                  return err.message;   // our own wording
        }
    }
    return fallback;
}

// ============================================================================
//  NOTES ON THE ORIGINAL CODE
//
//  1. SECURITY — there was no ownership check. The page read the venue from
//     #dynamicDataset (driven by the URL), separately resolved the signed-in
//     member's vendor profile, and never compared the two. And if no vendor
//     profile was found it only console.warn'd, then still called
//     populateAllFields() and wired up #btnSave. Any logged-in member could open
//     another vendor's edit URL and overwrite the whole record. Every read and
//     write now goes through the backend, which refuses a venue whose
//     .reference does not match the caller's profile.
//
//  2. DATA LOSS — the patch was Object.assign({}, venueData, { _id }), a full
//     copy of a snapshot taken at page load. That put adminNotes, visibility,
//     venueClaimed, _owner and the computed link-* fields back on every save.
//     The backend now writes a strict allowlist and re-reads the record first.
//
//  3. Fields could never be cleared. Every assignment sat behind `if (value)`,
//     so deleting a landline and saving kept the old landline. Blank now means
//     null.
//
//  4. minimumGuests / maximumGuests / distanceFrom7thCircleKm went through
//     Number() with no check, so a typo wrote NaN into the column.
//
//  5. pricePerGuestJod and the other money fields were written as raw strings —
//     this form is where "55 JOD" comes from. They are numeric inputs now, and
//     existing text values are parsed on load, so each save cleans one row.
//
//  6. The field is preparationSuite, singular. The form wrote preparationSuites,
//     so edits to it never appeared on the venue page.
//
//  7. saveReferences called insertReference('Venues', 'Catering_venue', ...).
//     Catering_venue is the computed reverse of Catering.venue, not a writable
//     field, so those calls rejected and took the surrounding Promise.all down
//     with them — which is why "Save failed" could appear even when the text
//     fields had gone in. Only the child side is written now.
//
//  8. A failed reference write left linkedSet holding the old values while the
//     checkboxes showed the new ones, so the next save computed the wrong diff.
//     The backend re-reads the current links every time.
//
//  9. Photos are edited here now. They are picked in the iframe, resized and
//     re-encoded there, and arrive as one message per new image; this file
//     uploads each through backend/listingMedia.jsw and hands the resulting URLs
//     to saveVenue. Photos already on the record travel as their stored src and
//     are never re-uploaded.
//
// 10. The page had no navigate interceptor, so the blocked-state link was a
//     plain anchor inside a sandboxed iframe and would have rendered
//     "Forbidden". Same-site links now navigate the parent, which is also what
//     makes the Back to dashboard button work.
//
// 11. isDirty is tracked from the iframe. Wix has no reliable beforeunload in an
//     HTML component, so the Back button arms on the first click when there are
//     unsaved changes and leaves on the second, rather than relying on a modal
//     the sandbox may suppress.
// ============================================================================
// ============================================================================
//  3orsna — Talent profile (dynamic page)
//  Pair with 3orsna-talent-profile.html in an HTML iframe,
//  and backend/talentEnquiry.jsw for the booking request.
//
//  ELEMENTS THIS EXPECTS
//    #html1           HTML iframe — the whole page
//    #dynamicDataset  Dataset     — tells us which listing this is
//
//  DYNAMIC PAGE SETUP
//    Collection: Talent
//    URL:        /talent/{slug}
//    Filter the page's dataset to approvalStatus = approved AND visibility = true,
//    or an unapproved profile is
//    reachable by anyone who guesses the slug. This file checks too, but the
//    dataset filter is the cheaper gate.
// ============================================================================

import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';
import { sendTalentEnquiry } from 'backend/talentEnquiry';
import { getMyRole } from 'backend/accounts.web';
import { authentication } from 'wix-members-frontend';
import { session } from 'wix-storage-frontend';
import { ROUTES } from 'public/routes';


const IFRAME = '#html1';
const ROUTE_DIRECTORY = '/wedding-talent';   // the WEDDING TALENT directory page

let iframeReady = false;
let queued      = [];
let talentId    = null;

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
        if (msg.type === 'tp:scrollTo') {
            await $w(IFRAME).scrollTo().catch(() => {});
            if (msg.y > 0) await wixWindowFrontend.scrollBy(0, msg.y).catch(() => {});
            return;
        }
        if (msg.type === 'tp:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            await sendViewer();
            return;
        }
        if (msg.type === 'tp:signup') { goSignUp(); return; }
        if (msg.type === 'tp:login')  { authentication.promptLogin({ mode: 'login' }).catch(() => {}); return; }
        if (msg.type === 'tp:back') { wixLocation.to(ROUTE_DIRECTORY); return; }
        if (msg.type === 'tp:enquiry') { await handleEnquiry(msg.payload); }
    });

    $w('#dynamicDataset').onReady(function () {
        const item = $w('#dynamicDataset').getCurrentItem();
        if (!item) {
            console.error('[talentProfile] no current item');
            send({ type: 'tp:error' });
            return;
        }

        // Belt and braces alongside the dataset filter. Needs both flags now:
        // approved by us, and switched on by the owner.
        const status = String(item.approvalStatus || '').trim().toLowerCase();
        const approved = status !== 'rejected';          // live unless an admin rejected it
        if (!approved || item.visibility !== true) {
            console.warn('[talentProfile] not publicly viewable:', item._id,
                'approvalStatus=', item.approvalStatus, 'visibility=', item.visibility);
            wixLocation.to(ROUTE_DIRECTORY);
            return;
        }

        talentId = item._id;

        try {
            send({ type: 'tp:data', talent: shape(item) });
        } catch (err) {
            // Without this, a throw in shape() leaves the iframe on its skeleton
            // forever with nothing in the console to explain it.
            console.error('[talentProfile] shape failed:', err);
            send({ type: 'tp:error' });
        }
    });
});

// --------------------------------------------------------------------------
// Who is viewing — enquiries are for couples. The iframe shows a pop-up to
// anyone else; "Create a couple account" opens sign-up with Couple chosen and
// brings them back to this page afterwards.
async function sendViewer() {
    const me = await getMyRole().catch(() => null);
    send({ type: 'tp:viewer', viewer: me ? { loggedIn: !!me.loggedIn, role: me.role || '', admin: !!me.admin } : null });
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

// wix:image:// cannot go in an <img src>. Convert, and request the size needed.
function media(raw, w = 1400, h = 800) {
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    const m = /^wix:image:\/\/v1\/([^/]+)/.exec(raw);
    return m ? `https://static.wixstatic.com/media/${m[1]}/v1/fill/w_${w},h_${h},al_c,q_80/file.jpg` : null;
}

function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

const list = (v) => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);

// Wix pre-fills a gallery item's title with the uploaded filename, so this keeps
// "festive-wedding-table-...utc.jpg" out of the captions.
function caption(v) {
    if (!v) return null;
    const t = String(v).trim();
    if (!t) return null;
    if (/\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(t)) return null;
    if (!/\s/.test(t) && /[-_]/.test(t)) return null;
    if (/~mv2/i.test(t)) return null;
    if (/^\d{4}[-_]\d{2}[-_]\d{2}/.test(t)) return null;
    return t;
}

// The schema stores a bare handle, but vendors paste whatever they like.
function handle(v) {
    if (!v) return null;
    return String(v).trim()
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
        .replace(/^@/, '')
        .replace(/\/+$/, '') || null;
}

// Guard against a pasted markdown link or a missing scheme — Venues.websiteUrl
// arrived as "[www.terracegardens.jo](https://www.terracegardens.jo)".
function website(v) {
    if (!v) return null;
    let raw = String(v).trim();
    const md = /\[[^\]]*\]\(([^)]+)\)/.exec(raw);
    if (md) raw = md[1].trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw.replace(/^\/+/, '');
    return raw;
}

// --------------------------------------------------------------------------
function shape(t) {
    const title = t.title || 'Untitled profile';

    const gallery = list(t.portfolio)
        .map((g, i) => ({
            src: media(g.src, 900, 675),
            caption: caption(g.description) || caption(g.title),
            alt: `${title}, portfolio image ${i + 1}`
        }))
        .filter((g) => g.src);

    return {
        id: t._id,
        title,
        category: t.category || '',
        headline: t.headline || null,
        bio: t.bio || null,
        city: t.city || null,
        serviceAreas: list(t.serviceAreas),
        languages: list(t.languages),
        willTravel: typeof t.willTravel === 'boolean' ? t.willTravel : null,
        image: media(t.heroImage),
        videoUrl: t.videoUrl || null,
        gallery,
        priceFrom: num(t.priceFrom),
        priceTo: num(t.priceTo),
        priceUnit: t.priceUnit || null,
        depositPercent: num(t.depositPercent),
        yearsExperience: num(t.yearsExperience),
        eventsCompleted: num(t.eventsCompleted),
        rating: num(t.rating),
        reviewCount: num(t.reviewCount),
        instagram: handle(t.instagram),
        website: website(t.website),
        // showPhone is a Boolean in this schema, not the 'Yes'/'No' string the
        // Venues collection uses.
        publicPhone: t.showPhone === true ? (t.publicPhone || null) : null,
        featured: t.featured === true,
        backUrl: ROUTE_DIRECTORY
    };
}

// --------------------------------------------------------------------------
// While testing, show the technical reason under any failure. Set to false at launch.
const SHOW_ERROR_DETAILS = true;

async function handleEnquiry(payload) {
    // The backend returns { ok, error, detail } instead of throwing, so the
    // real reason always reaches this page.
    const res = await sendTalentEnquiry(talentId, payload)
        .catch((err) => ({ ok: false, error: 'That did not send. Try again in a moment.',
                           detail: 'Could not reach the backend: ' + ((err && err.message) || err) }));
    if (!res.ok) console.warn('[talentProfile] enquiry refused:', res.error, res.detail || '', payload);
    const detail = SHOW_ERROR_DETAILS && res.detail ? ` (${res.detail})` : '';
    const code = GATE_CODES.includes(res.error) ? res.error : '';
    send({
        type: 'tp:enquiryResult',
        ok: !!res.ok,
        code,
        message: res.ok
            ? (res.emailSent ? 'Sent. They will be in touch shortly.' : 'Received. We have logged your request and will pass it on.')
            : (res.error || 'That did not send. Try again in a moment.') + detail
    });
}

// ============================================================================
//  NOTES
//
//  1. The enquiry recipient is resolved inside the backend from
//     Talent.owner -> TalentProfiles.loginEmail. It is never a parameter. The
//     venue equivalent passes ownerEmail from the browser, which makes that web
//     method an open relay on your sending domain — anyone can call it with any
//     address. Do not copy that pattern here.
//
//  2. Filter the dynamic page's dataset to visibility = true. Without it, an
//     unapproved listing is public to anyone who guesses the slug — and every
//     listing defaults to visibility false, so the whole approval queue would be
//     reachable. The redirect above is a second line of defence, not the gate.
//
//  3. eventDate is posted as "YYYY-MM-DD" and parsed at midday UTC in the
//     backend, so no offset can move it a day. It is stored as a real Date, so
//     you can query "all requests for October" — which RequestDirectory cannot
//     do, because it holds "29/07/2026" strings.
//
//  4. The record is inserted before the email is attempted, and emailSent is
//     flagged separately. A notification failure does not lose the request, and
//     you can query for the ones that need chasing.
//
//  5. A suspended TalentProfiles row blocks new requests without unpublishing
//     the listings, which is usually what you want mid-dispute.
//
//  6. shape() runs inside a try/catch. On the venue detail page a throw there
//     left the iframe on its loading skeleton with nothing in the console.
//
//  7. Gallery captions filter out filenames, and instagram/website are
//     normalised on read rather than trusted.
// ============================================================================
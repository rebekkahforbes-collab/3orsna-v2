// ============================================================================
//  PAGE: TALENT DASHBOARD  (/talent-dashboard · permissions Everyone — code-guarded)
//  HTML iframe ID: #html1  ←  iframes/talent-dashboard.html
//
//  Everything a talent does lives here now, including creating a listing — the
//  separate "Become a wedding talent" page is retired (its page code just sends
//  people here). A talent with no listings lands straight on the listing form.
//
//  Backend: talentDashboard.jsw (dashboard, enquiries, account),
//           talentSubmit.jsw (form setup + publishing), talentMedia.jsw (photos).
//  All three return { ok, error } instead of throwing — Wix hides thrown reasons.
// ============================================================================

import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { getDashboard, listEnquiries, setEnquiryStatus, saveProfile } from 'backend/talentDashboard';
import { getSubmitContext, submitListing } from 'backend/talentSubmit';
import { uploadTalentImage } from 'backend/talentMedia';

const IFRAME = '#html1';

// While true, an unexpected failure shows its technical reason. Set false at launch.
const DEBUG = true;

const ROUTES = {
    edit:    URLS.talentEdit,      // the member's edit page
    profile: '/talent'             // public profile pages: /talent/{slug}
};
const ROUTE_LOGIN   = '/login';
const ROUTE_CONTACT = '/contact';

let iframeReady = false;
let started     = false;
let queued      = [];

$w.onReady(function () {
    requireRole('talent');   // wrong account type → their own dashboard; never delays the listener below

    $w(IFRAME).onMessage(async (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
            case 'iframe:navigate':                        // site links can't navigate inside the sandboxed iframe
                if (typeof msg.url === 'string') wixLocation.to(msg.url);
                return;
            case 'dash:scrollTo':                          // iframe sized to its content → the page scrolls
                await $w(IFRAME).scrollTo().catch(() => {});
                if (msg.y > 0) await wixWindowFrontend.scrollBy(0, msg.y).catch(() => {});
                return;
            case 'dash:ready':
                iframeReady = true;
                queued.forEach((m) => $w(IFRAME).postMessage(m));
                queued = [];
                if (started) return;                       // the iframe repeats "ready" until it hears back
                started = true;
                return load();
            case 'dash:refresh':     return load();
            case 'dash:enquiries':   return enquiries(msg.filter, msg.skip || 0);
            case 'dash:enqStatus':   return enqStatus(msg.id, msg.status);
            case 'dash:saveProfile': return profile(msg.patch);
            case 'dash:upload':      return upload(msg.index, msg.base64, msg.name);
            case 'dash:submit':      return submit(msg.account, msg.listing, msg.media);
        }
    });
});

// --------------------------------------------------------------------------
function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}
function block(title, message, actionLabel, actionHref) {
    send({ type: 'dash:blocked', title, message, actionLabel, actionHref });
}
const lost = (e) => ({ ok: false, error: 'SERVER', detail: String((e && e.message) || e) });
// A backend reason worth showing as-is (validation wording), not an internal code.
const shown = (res, fallback) => res && res.error && !/^[A-Z_]+$/.test(res.error) ? res.error : fallback;

// --------------------------------------------------------------------------
// Dashboard data and the listing form's setup arrive together, so the form is
// ready the moment someone opens it.
async function load() {
    const [res, form] = await Promise.all([
        getDashboard().catch(lost),
        getSubmitContext().catch(lost)
    ]);
    if (!res.ok) { console.error('[dashboard] load failed:', res.error, res.detail); return route(res); }
    if (!form.ok) console.warn('[dashboard] listing form setup failed:', form.error, form.detail);
    send({
        type: 'dash:data', ...res,
        form: form.ok ? { categories: form.categories, needsAccount: form.needsAccount, suggestedName: form.suggestedName } : {},
        routes: ROUTES, baseUrl: wixLocation.baseUrl
    });
}

async function enquiries(filter, skip) {
    const res = await listEnquiries(filter, skip).catch(lost);
    if (!res.ok) { console.error('[dashboard] enquiries failed:', res.error, res.detail); return route(res); }
    send({ type: 'dash:enquiries', ...res });
}

async function enqStatus(id, status) {
    const res = await setEnquiryStatus(id, status).catch(lost);
    if (!res.ok) console.error('[dashboard] status change failed:', res.error, res.detail);
    send({ type: 'dash:enqResult', id, ok: !!res.ok, message: res.ok ? '' : shown(res, 'That did not work. Try again in a moment.') });
}

async function profile(patch) {
    const res = await saveProfile(patch).catch(lost);
    if (!res.ok) console.error('[dashboard] profile save failed:', res.error, res.detail);
    send({ type: 'dash:profileSaved', ok: !!res.ok, message: res.ok ? 'Saved.' : shown(res, 'That did not save. Try again in a moment.') });
}

// ---- new listing --------------------------------------------------------
async function upload(index, base64, name) {
    const res = await uploadTalentImage(base64, name).catch(lost);
    if (res.ok) return send({ type: 'dash:uploaded', index, ok: true, url: res.url });
    console.error('[dashboard] upload failed at', index, res.error, res.detail);
    send({ type: 'dash:uploaded', index, ok: false,
           message: shown(res, `Photo ${index + 1} would not upload. Remove it, or press Publish to try again.`) });
}

async function submit(account, listing, media) {
    if (!media || !media.heroImage) {
        return send({ type: 'dash:submitted', ok: false, message: 'Add at least two photos before publishing.' });
    }
    const res = await submitListing(account, listing, media).catch(lost);
    if (!res.ok) {
        console.error('[dashboard] publish failed:', res.error, res.detail);
        if (res.error === 'ACCOUNT_SUSPENDED') return route(res);
        return send({ type: 'dash:submitted', ok: false, message: shown(res, 'That did not save. Try again in a moment.') });
    }
    send({ type: 'dash:submitted', ok: true, message: 'Your listing is live. Couples can find you in the directory now.' });
    await load();                                          // the new listing appears straight away
}

// --------------------------------------------------------------------------
function route(res) {
    switch (res && res.error) {
        case 'NOT_LOGGED_IN':
            wixLocation.to(ROUTE_LOGIN);
            return;
        case 'ACCOUNT_SUSPENDED':
            block('Your account is on hold',
                'Your listings are hidden and new requests are paused. Get in touch and we will sort it out.',
                'Contact us', ROUTE_CONTACT);
            return;
        default:
            block('We could not load your dashboard',
                DEBUG && res && (res.detail || res.error) ? 'Error: ' + (res.detail || res.error) : 'Refresh the page to try again.');
    }
}

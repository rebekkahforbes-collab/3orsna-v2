/* PAGE: Add listing (/add-listing · Members only) — vendors add a VENUE here.
   HTML iframe ID: #addFrame  ←  iframes/vendor-add.html
   Tabs: Venue, Catering, Package, Promotion. Everything is published straight away.
   The tab to open comes from session storage ('addListingType'), set by the vendor dashboard. */
import wixLocation from 'wix-location';
import { session } from 'wix-storage-frontend';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { getAddPageData, uploadPhoto, createVenue, createCatering, createPackage, createPromotion } from 'backend/vendorCreate.web';

const fail = (e) => ({ ok: false, error: 'SAVE_FAILED', detail: String((e && e.message) || e) });
const reason = (r, fallback) => r.error === 'SAVE_FAILED' ? `${fallback} (${r.detail || 'unknown error'})` : (r.error || fallback);

$w.onReady(() => {
    const frame = $w('#addFrame');
    const allowed = requireRole('vendor');
    const kind = session.getItem('addListingType') || 'venue';
    session.removeItem('addListingType');
    const send = (m) => frame.postMessage(m);
    const sendData = async () => {
        const r = await getAddPageData().catch(fail);
        send({ type: 'al:data', ok: !!r.ok, data: r, kind, error: r.ok ? '' : reason(r, 'Please refresh the page.') });
    };

    frame.onMessage(async ({ data: msg }) => {
        if (!msg || typeof msg !== 'object') return;
        if (!(await allowed)) return;
        switch (msg.type) {
            case 'al:ready':
                await sendData();
                break;
            case 'al:upload': {
                const r = await uploadPhoto(msg.dataUrl, msg.name).catch(fail);
                send(r.ok ? { type: 'al:uploaded', uid: msg.uid, url: r.url }
                          : { type: 'al:uploadFailed', uid: msg.uid, error: reason(r, 'Upload failed') });
                break;
            }
            case 'al:save': {
                const call = { venue:     () => createVenue(msg.payload, msg.hero, msg.gallery),
                               catering:  () => createCatering(msg.payload, msg.hero),
                               package:   () => createPackage(msg.payload),
                               promotion: () => createPromotion(msg.payload) }[msg.kind];
                const r = call ? await call().catch(fail) : { ok: false, error: 'Unknown listing type.' };
                send({ type: 'al:saved', ok: !!r.ok, kind: msg.kind, error: r.ok ? '' : reason(r, "That didn't publish") });
                if (r.ok) await sendData();            // the new item becomes selectable in the other tabs
                break;
            }
            case 'al:nav':
                wixLocation.to(URLS.vendorDashboard);
                break;
        }
    });
});

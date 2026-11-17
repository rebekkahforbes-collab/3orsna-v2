/* PAGE: Admin Dashboard (your URL · permissions Everyone — guarded here and in the backend)
   HTML iframe ID: #adminFrame  ←  iframes/admin-dashboard.html

   Anyone who isn't an admin is sent to the home page. Every backend call checks
   again (backend/admin.web.js), so the open page shows nothing to anyone else.
   The iframe asks for data with { type:'ad:call', reqId, fn, args } and gets
   { type:'ad:result', reqId, ok, … } back. Only the functions below can be called. */
import wixLocationFrontend from 'wix-location-frontend';
import { ROUTES } from 'public/routes';
import { adminWhoAmI, adminOverview, adminList, adminAct, adminChoices, adminUploadPhoto, adminCreateVenue } from 'backend/admin.web';

const CALLS = {
  overview: adminOverview, list: adminList, act: adminAct, choices: adminChoices,
  upload: adminUploadPhoto, createVenue: adminCreateVenue
};

$w.onReady(() => {
  const frame = $w('#adminFrame');
  const who = adminWhoAmI().catch(() => ({ ok: false }));
  who.then((w) => { if (!w || !w.ok || !w.admin) wixLocationFrontend.to(ROUTES.home); });

  frame.onMessage(async ({ data: msg }) => {
    if (!msg || typeof msg !== 'object') return;
    const w = await who;
    if (!w || !w.ok || !w.admin) return;
    switch (msg.type) {
      case 'ad:ready':
        frame.postMessage({ type: 'ad:hello', email: w.email || '', base: wixLocationFrontend.baseUrl });
        break;
      case 'ad:call': {
        const fn = CALLS[msg.fn];
        const r = fn ? await fn(...(Array.isArray(msg.args) ? msg.args : [])).catch(() => ({ ok: false, error: 'Connection lost. Please try again.' }))
                     : { ok: false, error: 'Unknown request.' };
        frame.postMessage(Object.assign({}, r, { type: 'ad:result', reqId: msg.reqId }));
        break;
      }
      case 'ad:scrollTop':                              // tab change → bring the top of the dashboard into view
        frame.scrollTo().catch(() => {});
        break;
    }
  });
});

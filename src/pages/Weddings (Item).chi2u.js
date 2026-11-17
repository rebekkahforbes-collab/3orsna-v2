/* PAGE: Weddings (Item) — the guest invitation, dynamic page at /invite/{slug}
   HTML iframe ID: #inviteFrame  ←  iframes/wedding-invite.html
   The wedding is loaded through the backend, which hides drafts from everyone
   but the couple and matches personal guest links (?g=…). */
import wixLocationFrontend from 'wix-location-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import { getInvite, submitRsvp } from 'backend/weddings.web';

$w.onReady(() => {
  const frame = $w('#inviteFrame');
  const slug  = decodeURIComponent(wixLocationFrontend.path[0] || '');
  const token = wixLocationFrontend.query.g || '';
  const wedding = getInvite(slug, token).catch(() => null);     // starts now; the listener below waits for it

  frame.onMessage(async ({ data: msg }) => {
    if (!msg || typeof msg !== 'object') return;
    const data = await wedding;
    if (!data || data.redirectTo) return wixLocationFrontend.to('/');     // a draft seen by someone else, or an old address
    if (msg.type === '3orsna:inviteReady') {
      const rect = await wixWindowFrontend.getBoundingRect();
      frame.postMessage({ type: '3orsna:viewport', height: rect.window.height });
      frame.postMessage({ type: '3orsna:invite', data });
    }
    if (msg.type === '3orsna:rsvp') {
      const res = await submitRsvp(Object.assign({}, msg.data, { slug: data.slug, token: data.guest ? data.guest.token : '' }))
        .catch(() => ({ ok: false, reason: 'network' }));
      frame.postMessage(res.ok ? { type: '3orsna:rsvpDone', updated: res.updated } : { type: '3orsna:rsvpFailed', reason: res.reason });
    }
  });
});

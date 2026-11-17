/* PAGE: Guest list (/my-guests · Members only)
   HTML iframe ID: #guestsFrame  ←  iframes/guest-list.html
   Bulk WhatsApp sends go in batches of 20 so no backend call nears Wix's 14 s limit. */
import wixLocationFrontend from 'wix-location-frontend';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { listGuests, saveGuest, removeGuest, sendWhatsApp, linkReply } from 'backend/guests.web';

const BATCH = 20;

$w.onReady(() => {
  const frame = $w('#guestsFrame');
  const allowed = requireRole('couple');
  const post = (m) => frame.postMessage(m);
  const refresh = async () => post({ type: '3orsna:guests', data: await listGuests() });
  let sending = false;
  frame.onMessage(async ({ data: msg }) => {
    if (!msg || typeof msg !== 'object') return;
    if (!(await allowed)) return;
    switch (msg.type) {
      case '3orsna:guestsReady':
      case '3orsna:refresh':
        await refresh();
        break;
      case '3orsna:saveGuest': {
        const r = await saveGuest(msg.guest);
        post(r.ok ? { type: '3orsna:guestSaved', item: r.item, tempId: msg.tempId }
                  : { type: '3orsna:guestError', reason: r.reason, name: r.name, tempId: msg.tempId, id: msg.guest && msg.guest.id });
        break;
      }
      case '3orsna:removeGuest': {
        const r = await removeGuest(msg.id);
        post(r.ok ? { type: '3orsna:guestRemoved', id: r.id } : { type: '3orsna:guestError', reason: r.reason, id: msg.id });
        break;
      }
      case '3orsna:linkReply': {                       // a reply from someone not on the list → onto a guest
        const r = await linkReply(msg.rsvpId, msg.guestId || '').catch(() => ({ ok: false, reason: 'generic' }));
        if (!r.ok) post({ type: '3orsna:linkError', rsvpId: msg.rsvpId, reason: r.reason });
        await refresh();
        break;
      }
      case '3orsna:send': {
        if (sending) return;
        sending = true;
        const ids = msg.ids || [];
        let sent = 0, failed = 0, stopped = '';
        for (let i = 0; i < ids.length; i += BATCH) {
          const r = await sendWhatsApp(ids.slice(i, i + BATCH), msg.kind, msg.note || '').catch(() => ({ ok: false, reason: 'network' }));
          if (!r.ok) { stopped = r.reason; break; }
          sent += r.sent; failed += r.failed;
          post({ type: '3orsna:sendProgress', done: Math.min(ids.length, i + BATCH), total: ids.length, sent, failed, results: r.results });
        }
        post({ type: '3orsna:sendDone', sent, failed, total: ids.length, stopped });
        sending = false;
        await refresh();
        break;
      }
      case '3orsna:nav':
        wixLocationFrontend.to(msg.to === 'builder' ? '/edit-wedding' : URLS.coupleDashboard);
        break;
    }
  });
});

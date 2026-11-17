/* PAGE: My wedding — couple dashboard (/my-wedding · Members only)
   HTML iframe ID: #dashFrame  ←  iframes/couple-dashboard.html
   The same iframe shows the couple's shortlist: every venue and talent they've
   sent an enquiry to, with a status and notes (sl:* messages). */
import wixLocationFrontend from 'wix-location-frontend';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { getDashboard, setPublished } from 'backend/weddings.web';
import { shortlistList, shortlistUpdate } from 'backend/shortlist.web';

const fail = (e) => ({ ok: false, error: String((e && e.message) || e) });

$w.onReady(() => {
  const frame = $w('#dashFrame');
  const allowed = requireRole('couple');                 // runs alongside; the listener is registered straight away
  const base = `${wixLocationFrontend.baseUrl.replace(/\/$/, '')}/invite/`;
  const send = async () => {
    const data = await getDashboard();
    if (data && data.slug) data.publicUrl = base + encodeURIComponent(data.slug);
    frame.postMessage({ type: '3orsna:dash', data });
  };
  frame.onMessage(async ({ data: msg }) => {
    if (!msg || typeof msg !== 'object') return;
    if (!(await allowed)) return;
    if (msg.type === '3orsna:dashReady' || msg.type === '3orsna:refresh') await send();
    if (msg.type === '3orsna:setPublished') { await setPublished(!!msg.on); await send(); }
    if (msg.type === '3orsna:nav') wixLocationFrontend.to(msg.to === 'guests' ? '/my-guests' : '/edit-wedding');

    /* Shortlist */
    const post = (m) => frame.postMessage(m);
    const list = async () => { const r = await shortlistList().catch(fail); post({ type: 'sl:data', ok: !!r.ok, items: r.items, error: r.error }); };
    switch (msg.type) {
      case 'sl:ready':
      case 'sl:refresh': return list();
      case 'sl:update': {
        const r = await shortlistUpdate(msg.id, msg.patch).catch(fail);
        return post({ type: 'sl:saved', ok: !!r.ok, id: msg.id, patch: msg.patch, error: r.error });
      }
      case 'sl:open':                                    // the listing's own page, e.g. /venues/terrace-gardens
        if (typeof msg.url === 'string' && /^\/[^/]/.test(msg.url)) wixLocationFrontend.to(msg.url);
        return;
    }
  });
});
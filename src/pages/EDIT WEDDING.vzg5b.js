/* PAGE: Edit wedding — page builder (/edit-wedding · Members only)
   HTML iframe ID: #builderFrame  ←  iframes/wedding-builder.html */
import wixLocationFrontend from 'wix-location-frontend';
import { requireRole } from 'public/role-guard';
import { ROUTES as URLS } from 'public/routes';
import { getMyWedding, saveWedding } from 'backend/weddings.web';
import { uploadImage } from 'backend/media.web';

$w.onReady(() => {
  const frame = $w('#builderFrame');
  const allowed = requireRole('couple');
  const PUBLIC_BASE = `${wixLocationFrontend.baseUrl.replace(/\/$/, '')}/invite/`;
  const reason = (e) => String((e && e.message) || e).slice(0, 120);
  frame.onMessage(async ({ data: msg }) => {
    if (!msg || typeof msg !== 'object') return;
    if (!(await allowed)) return;
    switch (msg.type) {
      case '3orsna:ready':
        frame.postMessage({ type: '3orsna:load', data: (await getMyWedding()) || null, publicBase: PUBLIC_BASE });
        break;
      case '3orsna:save':
      case '3orsna:publish': {
        const res = await saveWedding(msg.data, msg.type === '3orsna:publish');
        if (res.ok) frame.postMessage({ type: '3orsna:saved', status: res.status, slug: res.slug, publicUrl: PUBLIC_BASE + encodeURIComponent(res.slug),
                                        wasPublish: msg.type === '3orsna:publish' });
        else if (res.reason === 'slugTaken' || res.reason === 'badSlug') frame.postMessage({ type: '3orsna:slugTaken', reason: res.reason });
        else frame.postMessage({ type: '3orsna:saveFailed', reason: res.reason });
        break;
      }
      case '3orsna:upload': {
        const res = await uploadImage(msg.dataUrl, msg.name).catch((e) => ({ ok: false, reason: reason(e) }));
        frame.postMessage(res.ok ? { type: '3orsna:uploaded', slot: msg.slot, uid: msg.uid, url: res.url }
                                 : { type: '3orsna:uploadFailed', slot: msg.slot, uid: msg.uid, reason: res.reason });
        break;
      }
      case '3orsna:scrollTop':                          // publish banner → bring the top of the builder into view
        frame.scrollTo().catch(() => {});
        break;
      case '3orsna:nav':
        wixLocationFrontend.to(URLS.coupleDashboard);
        break;
    }
  });
});

/* ============================================================
   backend/media.web.js — photo uploads from the builder.
   The builder has already downscaled the photo in the browser, so
   what arrives here is a compact JPEG data URL, not the raw file.
   ============================================================ */
import { Permissions, webMethod } from 'wix-web-module';
import { mediaManager } from 'wix-media-backend';
import { currentMember } from 'wix-members-backend';
import { safeImg } from 'backend/data';

export const uploadImage = webMethod(Permissions.SiteMember, async (dataUrl, name) => {
  const member = await currentMember.getMember();
  if (!member) return { ok: false, reason: 'signedOut' };
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { ok: false, reason: 'badImage' };
  if (m[2].length > 1400000) return { ok: false, reason: 'tooBig' };           // ≈ 1 MB of image

  const base = String(name || 'photo').replace(/\.\w+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 50) || 'photo';
  const ext  = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
  try {
    const file = await mediaManager.upload(`/3orsna/${member._id}`, Buffer.from(m[2], 'base64'), `${base}.${ext}`, {
      mediaOptions: { mimeType: m[1], mediaType: 'image' },
      metadataOptions: { isPrivate: false, isVisitorUpload: true }
    });
    const url = safeImg(file.fileUrl);
    if (!url) console.error('uploadImage: unexpected fileUrl', file && file.fileUrl);
    return url ? { ok: true, url } : { ok: false, reason: 'badUrl' };
  } catch (e) {
    console.error('uploadImage failed', e);
    return { ok: false, reason: String((e && e.message) || e).slice(0, 120) };
  }
});
/* ============================================================
   backend/guests.web.js — Module 2, the private guest list.
   Every call is SiteMember-only and scoped to the caller's own
   wedding inside backend/data.js.
   ============================================================ */
import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import * as core from 'backend/data';

const uid = async () => { const m = await currentMember.getMember(); return m ? m._id : null; };

export const listGuests   = webMethod(Permissions.SiteMember, async ()                 => core.listGuests(await uid()));
export const saveGuest    = webMethod(Permissions.SiteMember, async (guest)            => core.saveGuest(await uid(), guest));
export const removeGuest  = webMethod(Permissions.SiteMember, async (id)               => core.removeGuest(await uid(), id));
export const linkReply    = webMethod(Permissions.SiteMember, async (rsvpId, guestId)  => core.linkReply(await uid(), rsvpId, guestId));
export const sendWhatsApp = webMethod(Permissions.SiteMember, async (ids, kind, note)  => core.sendWhatsApp(await uid(), ids, kind, note));
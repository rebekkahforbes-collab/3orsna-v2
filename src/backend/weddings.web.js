/* ============================================================
   backend/weddings.web.js — couple + guest calls for the invitation.
   Thin wrappers: the rules live in backend/data.js.
   ============================================================ */
import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import * as core from 'backend/data';

const uid = async () => { try { const m = await currentMember.getMember(); return m ? m._id : null; } catch (e) { return null; } };

export const getMyWedding  = webMethod(Permissions.SiteMember, async ()                => core.myWedding(await uid()));
export const isSlugFree    = webMethod(Permissions.SiteMember, async (slug)            => core.slugFree(await uid(), slug));
export const saveWedding   = webMethod(Permissions.SiteMember, async (data, publish)   => core.saveWedding(await uid(), data, !!publish));
export const setPublished  = webMethod(Permissions.SiteMember, async (on)              => core.setPublished(await uid(), !!on));
export const getDashboard  = webMethod(Permissions.SiteMember, async ()                => core.dashboard(await uid()));

/* The dynamic invitation page asks for its wedding here. Drafts come back
   only for the couple who own them; everyone else gets null. */
export const getInvite     = webMethod(Permissions.Anyone,     async (slug, token)     => core.inviteForRouter(slug, token, await uid()));

/* The other call open to visitors. It validates everything itself and can
   only ever write a reply to a published wedding. */
export const submitRsvp    = webMethod(Permissions.Anyone,     async (payload)         => core.submitRsvp(payload));
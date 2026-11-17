/* ============================================================
   backend/access.js — who is calling, what type are they, are they an admin.
   Plain backend module (not callable from the browser).

   Account types are Wix contact labels (see ROLES in backend/config.js).
   Admins pass every check, so testing is never blocked (see ADMIN_* there).
   ============================================================ */
import { currentMember } from 'wix-members-backend';
import wixUsersBackend from 'wix-users-backend';
import { contacts } from 'wix-crm-backend';
import { ROLES, ADMIN_EMAILS, ADMIN_LABEL } from 'backend/config';

const SA = { suppressAuth: true };
const keyCache = {};

/* The label's key, creating the label in Contacts the first time. */
export async function labelKey(displayName) {
  if (keyCache[displayName]) return keyCache[displayName];
  const { label } = await contacts.findOrCreateLabel(displayName, SA);
  keyCache[displayName] = label.key;
  return label.key;
}

export async function me() {
  try { return await currentMember.getMember({ fieldsets: ['FULL'] }); } catch (e) { return null; }
}

async function labelKeysOf(contactId) {
  if (!contactId) return [];
  try {
    const c = await contacts.getContact(contactId, SA);
    return (c && c.info && c.info.labelKeys) || [];
  } catch (e) { console.error('[access] getContact failed', e); return []; }
}

/* 'couple' | 'vendor' | 'talent' | '' (no type label yet). */
export async function roleOf(member) {
  if (!member) return '';
  const keys = await labelKeysOf(member.contactId);
  for (const role of Object.keys(ROLES)) {
    if (keys.includes(await labelKey(ROLES[role].label))) return role;
  }
  return '';
}

export async function isAdmin(member) {
  try {
    const u = wixUsersBackend.currentUser;
    if (u.loggedIn && (u.role === 'Admin' || u.role === 'Owner')) return true;
  } catch (e) {}
  if (!member) return false;
  const email = String(member.loginEmail || '').trim().toLowerCase();
  if (ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) return true;
  const keys = await labelKeysOf(member.contactId);
  return keys.includes(await labelKey(ADMIN_LABEL));
}

/* Everything at once: { member, role, admin }. */
export async function caller() {
  const member = await me();
  if (!member) return { member: null, role: '', admin: await isAdmin(null) };
  const [role, admin] = await Promise.all([roleOf(member), isAdmin(member)]);
  return { member, role, admin };
}

/* Adds the type label. Retries once: a brand-new contact can take a moment to exist. */
export async function addRoleLabel(contactId, role) {
  const key = await labelKey(ROLES[role].label);
  try { await contacts.labelContact(contactId, [key], SA); }
  catch (e) {
    await new Promise(r => setTimeout(r, 1500));
    await contacts.labelContact(contactId, [key], SA);
  }
}

/* Throws unless the caller is the given type, unlabelled (older accounts), or an admin. */
export async function allowRole(role, message) {
  const c = await caller();
  if (c.admin) return c;
  if (c.role && c.role !== role) {
    const e = new Error(message || `This page is for ${ROLES[role].label.toLowerCase()} accounts.`);
    e.name = 'ValidationError';
    throw e;
  }
  return c;
}

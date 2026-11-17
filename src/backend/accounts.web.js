/* ============================================================
   backend/accounts.web.js — sign-up and account types.
   An account type is a contact label (Couple / Vendor / Talent).
   It is set once here; afterwards only you change it, in Contacts.
   ============================================================ */
import { Permissions, webMethod } from 'wix-web-module';
import { authentication } from 'wix-members-backend';
import wixData from 'wix-data';
import { ROLES, SIGNUP_PAGE } from 'backend/config';
import { caller, addRoleLabel } from 'backend/access';

const SA = { suppressAuth: true };
const ROLE_KEYS = Object.keys(ROLES);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* Vendors need a VendorProfiles row for their dashboard. This replaces the old
   events.js hook, which created one for every member, couples included. */
async function ensureVendorProfile(memberId, email, name) {
  const found = await wixData.query('VendorProfiles').eq('email', email).limit(1).find(SA);
  if (found.items.length) return;
  await wixData.insert('VendorProfiles', { _id: memberId, title: name || email, email, phoneNumber: '' }, SA);
}

async function setUp(member, role, name) {
  await addRoleLabel(member.contactId, role);
  if (role === 'vendor') await ensureVendorProfile(member._id || member.id, member.loginEmail, name);
}

export const registerWithRole = webMethod(Permissions.Anyone, async (p) => {
  p = p || {};
  const role = String(p.role || '');
  const email = clean(p.email, 120).toLowerCase();
  const password = typeof p.password === 'string' ? p.password : '';
  const firstName = clean(p.firstName, 60), lastName = clean(p.lastName, 60);

  if (!ROLE_KEYS.includes(role)) return { ok: false, reason: 'noRole' };
  if (!firstName) return { ok: false, reason: 'noName' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, reason: 'badEmail' };
  if (password.length < 8 || password.length > 100) return { ok: false, reason: 'weakPassword' };

  let reg;
  try { reg = await authentication.register(email, password, { contactInfo: { firstName, lastName } }); }
  catch (e) {
    const m = String((e && e.message) || e);
    console.error('register failed', m);
    return { ok: false, reason: /exist|already|taken|in use/i.test(m) ? 'emailTaken' : 'registerFailed' };
  }
  const member = Object.assign({ loginEmail: email }, reg.member || {});
  try { await setUp(member, role, `${firstName} ${lastName}`.trim()); }
  catch (e) { console.error('account type setup failed — add the label in Contacts by hand', e); }

  return {
    ok: true, status: reg.status,
    sessionToken: reg.status === 'ACTIVE' ? reg.sessionToken : '',
    dashboard: ROLES[role].dashboard
  };
});

/* For members who signed up through Wix's normal form: pick a type, once. */
export const chooseMyRole = webMethod(Permissions.SiteMember, async (role) => {
  role = String(role || '');
  if (!ROLE_KEYS.includes(role)) return { ok: false, reason: 'noRole' };
  const c = await caller();
  if (!c.member) return { ok: false, reason: 'signedOut' };
  if (c.role) return { ok: true, alreadySet: true, role: c.role, dashboard: ROLES[c.role].dashboard };
  const cd = c.member.contactDetails || {};
  await setUp(c.member, role, [cd.firstName, cd.lastName].filter(Boolean).join(' '));
  return { ok: true, role, dashboard: ROLES[role].dashboard };
});

/* Used by the sign-up page and by every dashboard's guard. */
export const getMyRole = webMethod(Permissions.Anyone, async () => {
  const c = await caller();
  return {
    loggedIn: !!c.member, role: c.role, admin: c.admin,
    dashboard: c.role ? ROLES[c.role].dashboard : '', signupPage: SIGNUP_PAGE,
    dashboards: Object.fromEntries(ROLE_KEYS.map(k => [k, ROLES[k].dashboard]))
  };
});
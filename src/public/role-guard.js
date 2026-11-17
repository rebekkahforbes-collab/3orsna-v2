/* ============================================================
   public/role-guard.js — keeps each account type on its own pages.
     import { requireRole } from 'public/role-guard';
     $w.onReady(async () => { if (!(await requireRole('vendor'))) return; … });

   · Not logged in → sent to the home page (ROUTES.home).
   · Logs out while on a guarded page → sent to the home page.
   · No type label yet → sent to the sign-up page to pick one.
   · Wrong type → sent to their own dashboard.
   · Admins → allowed on every page (so you can test everything).

   The logged-out check runs in the browser before any backend call, so the
   redirect is instant. In the editor's Preview it asks the backend instead,
   so the site owner (an admin) is never sent away while testing.

   Guarded pages must have their page permissions set to EVERYONE. On a
   Members-only page Wix shows its own login screen and this code never runs
   for logged-out visitors. The backend still checks every request, so a
   public page shows no data to anyone who isn't allowed.

   URLs come from public/routes.js and ROLES / SIGNUP_PAGE in backend/config.js.
   ============================================================ */
import wixLocationFrontend from 'wix-location-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import { authentication } from 'wix-members-frontend';
import { getMyRole } from 'backend/accounts.web';
import { ROUTES } from 'public/routes';

const goHome = () => wixLocationFrontend.to(ROUTES.home);

function inPreview() {
  try { return wixWindowFrontend.viewMode === 'Preview'; } catch (e) { return false; }
}

/* Logging out on a guarded page sends the visitor home. The handler only acts
   if they are still on the page that registered it, so logging out on a
   public page later on (e.g. /venues) leaves them where they are. */
let guardedUrl = '';
let logoutHooked = false;
function watchLogout() {
  guardedUrl = wixLocationFrontend.url;
  if (logoutHooked) return;
  logoutHooked = true;
  authentication.onLogout(() => {
    if (wixLocationFrontend.url === guardedUrl) goHome();
  });
}

export async function requireRole(role) {
  watchLogout();
  if (!authentication.loggedIn() && !inPreview()) { goHome(); return null; }
  const me = await getMyRole().catch(() => null);
  if (!me) return null;
  if (me.admin) return me;
  if (!me.loggedIn) { goHome(); return null; }
  if (!me.role) { wixLocationFrontend.to(me.signupPage); return null; }
  if (me.role !== role) { wixLocationFrontend.to(me.dashboard || ROUTES.home); return null; }
  return me;
}

/* Straight to the right dashboard.
     goToMyDashboard()                         — for a "My account" button: logged-out visitors get the login box
     goToMyDashboard({ ifLoggedOut: 'home' })  — for a page (MY PROFILE): logged-out visitors go home */
export async function goToMyDashboard({ ifLoggedOut = 'login' } = {}) {
  const me = await getMyRole().catch(() => null);
  if (!me || !me.loggedIn) {
    if (ifLoggedOut === 'home') return goHome();
    return authentication.promptLogin({ mode: 'login' }).catch(() => {});
  }
  wixLocationFrontend.to(me.role ? me.dashboard : me.signupPage);
}

/* ============================================================
   PAGE: Sign up  (/signup · everyone)
   HTML iframe ID: #signupFrame  ←  iframes/signup.html
   ============================================================ */
import wixLocationFrontend from 'wix-location-frontend';
import { authentication } from 'wix-members-frontend';
import { session } from 'wix-storage-frontend';
import { registerWithRole, chooseMyRole, getMyRole } from 'backend/accounts.web';

/* Arriving from a venue or talent page's "Create a couple account" pop-up:
   Couple is already chosen, and afterwards they go back to that listing. */
const preset = () => session.getItem('signupRole') || '';
function goAfter(dashboard, role) {
  const back = session.getItem('returnTo');
  session.removeItem('returnTo'); session.removeItem('signupRole');
  wixLocationFrontend.to(back && role === 'couple' ? back : dashboard);
}

$w.onReady(() => {
  const frame = $w('#signupFrame');
  const send = m => frame.postMessage(m);

  /* Logging in from here: straight to their own dashboard,
     or to the account-type picker if they don't have one yet. */
  authentication.onLogin(async () => {
    const me = await getMyRole().catch(() => null);
    if (me && me.role) goAfter(me.dashboard, me.role);
    else send({ type: '3orsna:signupState', loggedIn: true, preset: preset() });
  });

  frame.onMessage(async ({ data: msg }) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case '3orsna:signupReady': {
        const me = await getMyRole().catch(() => ({ loggedIn: false }));
        if (me.loggedIn && me.role) { goAfter(me.dashboard, me.role); return; }
        send({ type: '3orsna:signupState', loggedIn: !!me.loggedIn, preset: preset() });
        break;
      }

      case '3orsna:signup': {
        const res = await registerWithRole(msg.data).catch(() => ({ ok: false, reason: 'network' }));
        if (!res.ok) { send({ type: '3orsna:signupFailed', reason: res.reason }); break; }
        if (res.sessionToken) {
          await authentication.applySessionToken(res.sessionToken);
          goAfter(res.dashboard, msg.data && msg.data.role);
        } else {
          send({ type: '3orsna:signupDone', status: res.status });     // PENDING: approval or email confirmation
        }
        break;
      }

      case '3orsna:chooseRole': {
        const res = await chooseMyRole(msg.role).catch(() => ({ ok: false, reason: 'network' }));
        if (res.ok) goAfter(res.dashboard, res.role || msg.role);
        else send({ type: '3orsna:signupFailed', reason: res.reason });
        break;
      }

      case '3orsna:login':
        authentication.promptLogin({ mode: 'login' }).catch(() => {});
        break;
    }
  });
});

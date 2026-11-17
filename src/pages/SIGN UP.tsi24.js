/* ============================================================
   PAGE: Sign up  (/signup · everyone)
   HTML iframe ID: #signupFrame  ←  iframes/signup.html
   ============================================================ */
import wixLocationFrontend from 'wix-location-frontend';
import { authentication } from 'wix-members-frontend';
import { registerWithRole, chooseMyRole, getMyRole } from 'backend/accounts.web';

$w.onReady(() => {
  const frame = $w('#signupFrame');
  const send = m => frame.postMessage(m);

  /* Logging in from here: straight to their own dashboard,
     or to the account-type picker if they don't have one yet. */
  authentication.onLogin(async () => {
    const me = await getMyRole().catch(() => null);
    if (me && me.role) wixLocationFrontend.to(me.dashboard);
    else send({ type: '3orsna:signupState', loggedIn: true });
  });

  frame.onMessage(async ({ data: msg }) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case '3orsna:signupReady': {
        const me = await getMyRole().catch(() => ({ loggedIn: false }));
        if (me.loggedIn && me.role) { wixLocationFrontend.to(me.dashboard); return; }
        send({ type: '3orsna:signupState', loggedIn: !!me.loggedIn });
        break;
      }

      case '3orsna:signup': {
        const res = await registerWithRole(msg.data).catch(() => ({ ok: false, reason: 'network' }));
        if (!res.ok) { send({ type: '3orsna:signupFailed', reason: res.reason }); break; }
        if (res.sessionToken) {
          await authentication.applySessionToken(res.sessionToken);
          wixLocationFrontend.to(res.dashboard);
        } else {
          send({ type: '3orsna:signupDone', status: res.status });     // PENDING: approval or email confirmation
        }
        break;
      }

      case '3orsna:chooseRole': {
        const res = await chooseMyRole(msg.role).catch(() => ({ ok: false, reason: 'network' }));
        if (res.ok) wixLocationFrontend.to(res.dashboard);
        else send({ type: '3orsna:signupFailed', reason: res.reason });
        break;
      }

      case '3orsna:login':
        authentication.promptLogin({ mode: 'login' }).catch(() => {});
        break;
    }
  });
});
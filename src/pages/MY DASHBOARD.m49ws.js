/* ============================================================
   PAGE: My profile — sends each member to their own dashboard.
   Vendors → vendor dashboard, talent → talent dashboard, couples → their
   wedding. Logged-out visitors go to the home page.
   URLs are set in public/routes.js.
   ============================================================ */
import { goToMyDashboard } from 'public/role-guard';

$w.onReady(function () {
    goToMyDashboard({ ifLoggedOut: 'home' });
});

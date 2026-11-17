/* ============================================================
   public/routes.js — every account page URL, in one place.
   Change a URL here and every page and the sign-up redirects follow.
   Paths only (no domain), so they work on the test URL and on 3orsna.com.
   ============================================================ */
export const ROUTES = {
  home:             '/',                    // where logged-out visitors are sent from any dashboard page
  coupleDashboard:  '/my-wedding',
  vendorDashboard:  '/vendor-dashboard',
  vendorAddListing:   '/add-listing',                    // the one page for adding anything
  talentDashboard:  '/talent-dashboard',    // shows a talent their listings and enquiries
  talentOnboarding: '/talent-dashboard',    // listings are created inside the talent dashboard now
  talentEdit:       '/talent-edit',
  talentDirectory:  '/talent',
  signup:           '/signup'
};

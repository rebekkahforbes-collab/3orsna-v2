// ============================================================================
//  PAGE: BECOME A WEDDING TALENT — retired.
//  Listings are now created inside the Talent Dashboard, which opens straight
//  onto the listing form for anyone without a listing. This page only forwards
//  old links and bookmarks there; once nothing links to it, delete the page.
// ============================================================================
import wixLocation from 'wix-location';
import { ROUTES } from 'public/routes';

$w.onReady(() => { wixLocation.to(ROUTES.talentDashboard); });

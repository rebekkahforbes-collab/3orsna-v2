/* ============================================================
   backend/config.js
   Everything you might need to change lives here.
   ============================================================ */

/* Public invitation links look like  https://www.3orsna.com/invite/laith-sara
   Wix routers always sit under a prefix, so a root-level
   3orsna.com/laith-sara isn't possible. Change INVITE_PREFIX here AND
   rename the router to match (the router's name is the prefix). */
export const SITE_URL      = 'https://www.3orsna.com';
export const INVITE_PREFIX = 'invite';

/* Where the members-only pages live. Used by the dashboard's buttons. */
export const PAGES = {
  dashboard: '/my-wedding',
  builder:   '/edit-wedding',
  guests:    '/my-guests'
};

export const COL = {
  weddings: 'Weddings',
  rsvps:    'RSVPs',
  guests:   'Guests',
  wa:       'WhatsAppMessages'
};

export const WA = {
  graphVersion: 'v23.0',           // Meta Graph API version — bump here when Meta retires it
  defaultCountry: '962',           // numbers typed as 07… are treated as Jordanian
  batchMax: 20,                    // guests per backend call; keeps each call well under Wix's 14 s limit
  concurrency: 5,                  // parallel sends inside one batch
  dailyCapPerWedding: 500,         // protects the 3orsna number's quality rating and your costs

  /* Template names exactly as approved in WhatsApp Manager.
     Each needs an English (en) and Arabic (ar) version under the same name. */
  templates: {
    invite:   'wedding_invitation',
    reminder: 'wedding_reminder',
    update:   'wedding_update'
  },

  /* Secret names in the Wix Secrets Manager. */
  secrets: {
    token:       'WA_ACCESS_TOKEN',
    phoneId:     'WA_PHONE_NUMBER_ID',
    appSecret:   'WA_APP_SECRET',
    verifyToken: 'WA_VERIFY_TOKEN'
  }
};

export const publicUrl = slug => `${SITE_URL}/${INVITE_PREFIX}/${encodeURIComponent(slug)}`;
/* ============================================================
   ACCOUNTS — everything you may need to change later lives here.

   Account types are Wix CONTACT LABELS (Dashboard → Contacts → Labels).
   To change someone's type, change their label in Contacts.

   dashboard: where that type lands after signing up, and where the
              guard sends anyone who opens the wrong dashboard.
              The URLs are set in public/routes.js.
   ============================================================ */
/* The URLs themselves live in public/routes.js. */
import { ROUTES as URLS } from 'public/routes';

export const ROLES = {
  couple: { label: 'Couple', dashboard: URLS.coupleDashboard },
  vendor: { label: 'Vendor', dashboard: URLS.vendorDashboard },
  talent: { label: 'Talent', dashboard: URLS.talentDashboard }   // new talent see "Create your first listing" there
};

/* The sign-up page (the account-type picker). */
export const SIGNUP_PAGE = URLS.signup;

/* ADMINS — pass every check, so testing is never blocked.
   Someone counts as an admin if ANY of these is true:
     · they're the site owner / a Wix site admin
     · their login email is in ADMIN_EMAILS (lowercase)
     · their contact has the ADMIN_LABEL label in Contacts */
export const ADMIN_EMAILS = [
  'rebekah@pixelpals.agency',
  'info@ashouri.bio'
];
export const ADMIN_LABEL = 'Admin';
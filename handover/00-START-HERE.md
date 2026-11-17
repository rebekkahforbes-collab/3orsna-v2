# 3orsna — complete build guide

## Updates through GitHub (read first)

The code is updated through GitHub. Nothing gets pasted into Wix.

- **Site repository** (`3orsna-v2`, can be private): backend, public and page code in `src/`, plus this handover in `handover/`. Pushing to `main` updates the code in Wix; then publish.
- **Iframes repository** (`3orsna-iframes`, public, GitHub Pages): every iframe. Each Wix HTML element points at its file with **Website address**, so pushing updates the iframes directly.

**One-time setup:**
1. On GitHub, create a **public** repository called `3orsna-iframes`, and put the contents of the `3orsna-iframes` folder in it (including the hidden `.nojekyll` file).
2. In that repository, go to **Settings → Pages**, choose **Deploy from a branch**, then branch `main`, folder `/ (root)`, and **Save**. After a minute, the addresses below work.
3. In the Wix editor, for each HTML element in the table: **Settings → Website address** → paste its address → **Update**. The element ID stays the same.
4. Copy the `3orsna-site` folder over your local copy of `3orsna-v2`, then commit and push. Publish the site.

| Wix page | HTML element | Website address |
|---|---|---|
| Custom Signup | `#signupFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/signup.html` |
| MY WEDDING | `#dashFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/couple-dashboard.html` |
| EDIT WEDDING | `#builderFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/wedding-builder.html` |
| MY GUESTS | `#guestsFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/guest-list.html` |
| Weddings (Item) | `#inviteFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/wedding-invite.html` |
| VENDOR DASHBOARD | `#html1` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/vendor-dashboard.html` |
| ADD LISTING | `#addFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/vendor-add.html` |
| VENUES | `#html1` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/venues.html` |
| VENUES (Item) | `#html1` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/venue-detail.html` |
| TALENT DASHBOARD | `#html1` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/talent-dashboard.html` |
| Talent Edit (Item) | `#html1` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/talent-edit.html` |
| WEDDING TALENT | `#html1` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/talent-directory.html` |
| Talent (Item) | `#html1` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/talent-profile.html` |
| Admin Dashboard | `#adminFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/admin-dashboard.html` |
| HOME | `#latestFrame` | `https://rebekkahforbes-collab.github.io/3orsna-iframes/home-latest.html` |

**Every update after that:**
1. Copy the update's folders over both repositories.
2. Commit and push each one.
3. Add any new CMS fields listed in the update.
4. Publish.

GitHub Pages can take a few minutes to show iframe changes; hard-refresh to check.


This guide covers every page, iframe, backend file and collection, and what to change later. The folders are numbered in setup order:

| Folder | What's in it | Where it goes in Wix |
|---|---|---|
| `1-databases/` | 15 CSVs and `DATABASES.md` (field types and permissions) | CMS → create each collection by importing its CSV |
| `2-backend/` | 23 backend files | Code panel → Backend, same file names |
| `3-public/` | `routes.js`, `role-guard.js` | Code panel → Public |
| `4-pages/` | Page code, grouped account / couple / vendor / talent | Each page's code panel |
| `5-iframes/` | The 7 HTML iframes | Paste into the page's HTML element (Embed → Code) |
| `6-tools/` | Rebuilds the invitation iframe from the builder | Not uploaded — only needed if you change the builder's designs |

## 1. How it works

- **Iframes and page code.** Each feature is an HTML iframe on a Wix page. The iframe talks to its page code with `postMessage`. The page code calls the backend. The backend reads and writes the CMS.
- **Self-resizing.** Every iframe ends with the Pixel Pals height reporter v3, and the site-wide listener (Custom Code) sizes it to its content. Before the listener is live, each iframe scrolls inside itself with the scrollbar hidden, so all content is still reachable. See **Height** in section 9.
- **The ready handshake.** Every iframe repeats "ready" every second until its page answers. It never gets stuck loading, even when a page is slow to start listening. If no page ever answers, the Add listing iframe explains what to check.
- **Account types are contact labels:** **Couple**, **Vendor** (venues only) and **Talent** (photographers, DJs, singers, planners and every other service). People choose their type once, when they sign up. To change someone's type later, change their label in **Dashboard → Contacts**.
- **Admins pass every check**, so testing is never blocked. Someone is an admin if any of these is true:
  - they're the site owner
  - their email is in `ADMIN_EMAILS` in `backend/config.js`
  - their contact has the **Admin** label
- **Nothing is reviewed before going live.** Every new or edited venue, catering option, package, promotion and talent listing is saved approved and visible. To take something down, use **Reject** on the Admin Dashboard, and the owner can't switch it back on. **Approve** puts it back.
- **Login is Wix's normal login.** Sign-up is our own page, because it has to record the account type.

## 2. Where to change things later

| What | Where |
|---|---|
| Any account page URL (dashboards, Add listing, sign-up…) | `public/routes.js` |
| Labels, admin emails | `backend/config.js` — `ROLES`, `ADMIN_EMAILS`, `ADMIN_LABEL` |
| Invitation link prefix (`/invite/`) and site URL used in WhatsApp | `backend/config.js` — `SITE_URL`, `INVITE_PREFIX` |
| WhatsApp settings and template names | `backend/config.js` — `WA` |
| Venue form option lists | `backend/vendorCreate.web.js` — `VENUE_CHOICES` |
| Ready-made cover photos for couples | `iframes/wedding-builder.html` — `COVERS` (paste Wix Media URLs) |
| Technical error text and debug output shown while testing | Six flags, all `true` now — see **Before launch** below. Set them all to `false` at launch |

Use paths only, without the domain, so they work on the test URL and on 3orsna.com.

**Before launch — testing flags:**

| Flag | File | What it does while `true` |
|---|---|---|
| `SHOW_ERROR_DETAILS` | `4-pages/vendor/VENDOR DASHBOARD.js` | Shows the real error in brackets on the vendor dashboard |
| `DEBUG` | `4-pages/vendor/VENDOR DASHBOARD.js` | Extra logging in the vendor dashboard page code |
| `SHOW_ERROR_DETAILS` | `4-pages/talent/Talent (Item).js` | Shows the real error in brackets on the public talent page |
| `DEBUG` | `4-pages/talent/TALENT DASHBOARD.js` | The blocked panel shows the underlying error instead of only "we could not load" |
| `DEBUG` | `2-backend/vendorDashboard.jsw` | Logs link-field detection to the Wix site logs |
| `DEBUG` | `5-iframes/vendor-dashboard.html` (`var DEBUG`) | Debug output inside the vendor dashboard iframe |

Set all six to `false` at launch.

## 3. Pages

The **Iframe file** column is the HTML to paste into the page's HTML element. "Keep yours" means the iframe HTML already on the page is unchanged; only its page code changes.

| Page | URL | Who | Iframe ID | Iframe file | Page code |
|---|---|---|---|---|---|
| Custom Signup | `/signup` | Everyone | `#signupFrame` | `signup.html` | `account/SIGN UP (Custom Signup).js` |
| MY PROFILE | your URL | Account (code) | — | — | `account/MY PROFILE.js` (sends everyone to their own dashboard) |
| **Couple** | | | | | |
| MY WEDDING | `/my-wedding` | Account (code) | `#dashFrame` | `couple-dashboard.html` (dashboard + shortlist) | `couple/MY WEDDING.js` |
| EDIT WEDDING | `/edit-wedding` | Account (code) | `#builderFrame` | `wedding-builder.html` | `couple/EDIT WEDDING.js` |
| MY GUESTS | `/my-guests` | Account (code) | `#guestsFrame` | `guest-list.html` | `couple/MY GUESTS.js` |
| Weddings (Item) | `/invite/{slug}` | Everyone | `#inviteFrame` | `wedding-invite.html` | `couple/Weddings (Item) - invitation.js` |
| **Vendor (venues)** | | | | | |
| VENDOR DASHBOARD | `/vendor-dashboard` | Account (code) | `#html1` | `vendor-dashboard.html` (venues, enquiries, claims, account) | `vendor/VENDOR DASHBOARD.js` |
| **ADD LISTING** (new) | `/add-listing` | Account (code) | `#addFrame` | `vendor-add.html` | `vendor/ADD LISTING.js` |
| EDIT VENUE | your URL | Account (code) | `#html1` | keep yours | `vendor/EDIT VENUE.js` |
| VENUES | `/venues` | Everyone | `#html1` | `venues.html` | `vendor/VENUES.js` |
| VENUE | `/venues/{title}` | Everyone | `#html1` | `venue-detail.html` | `vendor/VENUE.js` |
| **Talent** | | | | | |
| TALENT DASHBOARD | `/talent-dashboard` | Account (code) | `#html1` | `talent-dashboard.html` (listings, enquiries, account **and creating a listing**) | `talent/TALENT DASHBOARD.js` |
| BECOME A WEDDING TALENT | `/become-a-talent` | — | — | **retired** (its code forwards to the dashboard; delete the page once nothing links to it) | `talent/BECOME A WEDDING TALENT.js` |
| Talent Edit (Item) | `/talent-edit/…` | Account (code) | `#html1` | `talent-edit.html` | `talent/Talent Edit (Item).js` |
| WEDDING TALENT | `/wedding-talent` | Everyone | `#html1` | `talent-directory.html` | `talent/WEDDING TALENT.js` |
| Talent (Item) | `/talent/…` | Everyone | `#html1` | `talent-profile.html` | `talent/Talent (Item).js` |
| **Admin** | | | | | |
| Admin Dashboard | your URL | **Everyone** (code) | `#adminFrame` | `admin-dashboard.html` | `admin/ADMIN DASHBOARD.js` |

**HOME:** add a new full-width section with an HTML element, ID `latestFrame`, holding `home-latest.html`, and add `home/HOME (latest section).js` to the page code (instructions at the top of that file). Its background is transparent, so the section's colour shows through.

The other pages (ABOUT, Blog, CONTACT US and the rest) need no changes, so they aren't in the package.

**Admin Dashboard:** replace the old iframe with a new HTML element, ID `adminFrame`, holding `admin-dashboard.html`, and paste the page code. Set the page to **Everyone**: anyone who isn't an admin is sent home, and every backend call checks again.

**ADD LISTING** has four tabs: **Venue, Catering, Package, Promotion**. The vendor dashboard's four Add buttons all open this page on the right tab.

- A vendor adds a venue first, then catering options for their venues, then packages, then promotions. The form guides them through that order.
- Photos upload straight to Wix Media.
- Whatever they publish is live immediately.

**Dynamic page URLs.** Both venue pages must be dynamic item pages of the **Venues** collection:
- **VENUE** (public) — e.g. `/venues/{title}`
- **EDIT VENUE** — its URL must contain the word **`edit`**, e.g. `/edit-venue/{title}`

The code finds each page's link by where it points, so the link fields' names don't matter. A URL with "edit" in it is the edit link, and any other is the public one.

**Dynamic page datasets.** On **Talent (Item)** and **VENUE**, check the dataset filter in the editor. If it filters on `approvalStatus` or `approved`, remove that and keep only `visibility = true`.

**Account (code)** pages are set to **Everyone** in the page's permissions, and the code guards them. Don't set them to Members: Wix would show its own login screen to logged-out visitors and the page code would never run. The code:

- sends logged-out visitors to the home page (and anyone who logs out while on one)
- sends members without an account type to sign-up
- sends anyone on the wrong dashboard to their own
- lets admins through everywhere

The backend checks every request, so an open page still shows no data to anyone who isn't allowed. You can also tick **Hide from search results** on these pages in their SEO settings.

## 4. Delete these

- Pages: **ADD VENUE**, **ADD CATERING OPTIONS**, **ADD PACKAGE**, **ADD PROMTION**. They're replaced by ADD LISTING.
- Backend: `email.web.js`, `vendorVenues.jsw`, `talentAdmin.jsw`, and `routers.js` if you ever created it.
- The router named `invite`, if you created one earlier. The invitation is a dynamic page now.

## 5. Backend files

Copy each into **Backend** with exactly this name. Wix no longer lets you create new `.jsw` files, so for the `.jsw` files, paste into the existing file of the same name.

| File | What it does |
|---|---|
| `config.js` | Settings: site URL, collections, WhatsApp, account types, admins |
| `access.js` | Who is calling: their account type (label) and whether they're an admin |
| `accounts.web.js` | Sign-up with an account type; pick a type once (Google or Wix sign-ups) |
| `data.js` | Weddings, RSVPs, guest list, WhatsApp sending and webhook logic |
| `whatsapp.js` | WhatsApp Cloud API: secrets, phone numbers, template and text messages |
| `weddings.web.js` | Builder, dashboard, invitation and RSVP calls |
| `guests.web.js` | Guest list and bulk WhatsApp calls |
| `media.web.js` | Couple photo uploads |
| `http-functions.js` | WhatsApp webhook at `/_functions/whatsapp` |
| `vendorCreate.web.js` | Add listing: venue, catering, package, promotion — all live on save |
| `vendorDashboard.jsw` | Vendor dashboard; creates a missing vendor profile automatically |
| `vendorVenueEdit.jsw` | Edit venue; edits stay live |
| `listingMedia.jsw` | Photo uploads for Edit venue |
| `venueInquiry.jsw` + `email.js` | Venue enquiries emailed to the venue's owner |
| `talentSubmit.jsw` | New talent listing — live on save |
| `talentEdit.jsw`, `talentDashboard.jsw`, `talentMedia.jsw` | Talent editing, dashboard and photos |
| `talentEnquiry.jsw` | Talent enquiries — saved to `TalentEnquiries` and emailed to the talent |
| `admin.web.js` (new) | Everything the Admin Dashboard reads and changes; admin-only |
| `adminReview.jsw` | The old review queue, now in `7-retired/`. The new Admin Dashboard doesn't use it — delete it from Backend once the new one is working |
| `events.js` | Intentionally empty (it used to make every member a vendor) |
| `permissions.json` | Keep as is |

**Public** (create these under Public in the code panel): `routes.js` and `role-guard.js`.

**Notes on the export rules:**

- **`.jsw` files:** only `export async function …` can be called from a page.
- **`.web.js` files:** only `export const x = webMethod(…)`, written literally, can be called.

Every file here follows those rules. Wix no longer lets you create new `.jsw` files, so new ones are `.web.js`.

## 6. Collections

Collection IDs and field keys are case-sensitive, and can't be changed after creation.

**All 15 collections, their CSVs, field types and permissions are in `DATABASES.md`.** The summary below covers only the collections this build added.

| Collection ID | Purpose | Notes |
|---|---|---|
| `Weddings` | One row per couple's page | **Read: Anyone** (the dynamic invitation page needs it); create, update and delete: Admin. `guestListEnabled` is on unless unticked |
| `Guests` | Couple's guest list | Phone stored as `+9627…` |
| `RSVPs` | Every reply | |
| `WhatsAppMessages` | Every WhatsApp sent or received | |
| `TalentEnquiries` | Talent enquiries | Your collection ID — the code uses exactly this |

**Field types for `Weddings`:**

| Fields | Type |
|---|---|
| `weddingDate`, `rsvpDeadline` | Date |
| `publishedAt` | Date and time |
| `isPrivate`, `guestListEnabled`, `rsvpOn`, `rsvpAskCount`, `rsvpAskMsg`, `rsvpAskPhone` | Boolean |
| `rsvpMaxParty` | Number |
| `previousSlugs` | Tags |
| `galleryUrls` | Array (any type works — the code reads all shapes) |
| everything else | Text |

**Field types for the others:**

| Collection | Fields | Type |
|---|---|---|
| Guests | `partySize` | Number |
| Guests | `rsvpAt`, `waLastSentAt` | Date and time |
| RSVPs | `attending` | Boolean |
| RSVPs | `partySize` | Number |
| RSVPs | `submittedAt` | Date and time |
| WhatsAppMessages | `sentAt`, `statusAt` | Date and time |
| TalentEnquiries | `eventDate` | Date |
| TalentEnquiries | `submittedAt` | Date and time |
| TalentEnquiries | `guestCount`, `budget` | Number |
| TalentEnquiries | `emailSent` | Boolean |

All other fields in these collections are Text.

**Existing, used as they are:** `Venues`, `VendorProfiles`, `Catering`, `Packages`, `Promotions`, `Talent`, `TalentProfiles`, `TalentCategories`, `RequestDirectory`.

- **Venues:** the review field is **`approved`** (Text). `approved` or empty means live; `rejected` means taken down.
- **Talent:** the review field is **`approvalStatus`**, with the same values.
- **VendorProfiles** rows are created at sign-up for vendors only, and automatically on the dashboard if one is missing. Old rows made for couples by the previous `events.js` are harmless and can be deleted.

## 7. Emails (Triggered Emails)

Create each triggered email in the dashboard with these IDs. Each needs the variables listed.

| ID | Variables | Sent when |
|---|---|---|
| `TALENT_ENQUIRY` | `talentTitle`, `name`, `email`, `phone`, `eventDate`, `guestCount`, `budget`, `message` | A couple enquires about a talent |
| `requestAvailability` | `venueName`, `guestName`, `guestEmail`, `guestPhone`, `numberOfGuests`, `suitableDates`, `SITE_URL` | A couple enquires about a venue |
| `VENUE_APPROVED`, `VENUE_REJECTED`, `TALENT_APPROVED`, `TALENT_REJECTED` | `name`, `listingTitle`, plus `reason` on rejections | An admin approves or rejects a listing |

| `VENUE_CLAIM_INVITE` | `venueName`, `signupUrl` | An admin adds a venue for its owner to claim (or presses Send invitation) |

On the Admin Dashboard, taking down or restoring emails the owner only when **Email the owner** is ticked. If a template is missing, the change still saves and the dashboard says the email couldn't be sent. If a template is missing, the enquiry is still saved. The visitor sees "Received" instead of "Sent".

## 8. WhatsApp (guest list)

1. **Secrets** (Dashboard → Developer tools → Secrets Manager): `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET`, and `WA_VERIFY_TOKEN` (any long random string).
2. **Meta setup:**
   - Verify the business and create a Meta app with WhatsApp.
   - Register the 3orsna number.
   - Create a system user with a permanent token that has `whatsapp_business_messaging` and `whatsapp_business_management`.
   - Webhook: callback URL `https://www.3orsna.com/_functions/whatsapp`, verify token = `WA_VERIFY_TOKEN`, subscribe to **messages**. Publish the site before you click Verify.
3. **Templates**, each in English (`en`) and Arabic (`ar`), with buttons in this order:
   - **`wedding_invitation`** (sent with the couple's invitation image and their own message)
     - Header: **Image**
     - Body (en):
       ```
       Dear {{1}},

       {{2}}

       View your invitation and RSVP here: https://www.3orsna.com/invite/{{3}} 💍
       ```
     - Body (ar):
       ```
       عزيزنا {{1}}،

       {{2}}

       لعرض الدعوة وتأكيد الحضور: https://www.3orsna.com/invite/{{3}} 💍
       ```
     - {{1}} = guest's name, {{2}} = the couple's message, {{3}} = their personal link (slug and token). WhatsApp doesn't allow a template to end on a variable, hence the ring after the link.
     - Buttons: Quick reply **Accept**; Quick reply **Decline** (no website button — the link is in the message).
   - **`wedding_reminder`**
     - Body: Hello {{1}}, a gentle reminder from {{2}}: please let them know by {{3}} whether you can join their wedding.
     - Buttons: Quick reply **Accept**; Quick reply **Decline**; Visit website (dynamic) `https://www.3orsna.com/invite/{{1}}`
   - **`wedding_update`**
     - Body: Hello {{1}}, an update from {{2}} about their wedding: {{3}} Open your invitation for the full details.
     - Buttons: Visit website (dynamic) only.
4. **Limits:** a new number reaches about 250 people a day across all couples. Meta may classify the templates as Marketing, which costs more. Couples must have their guests' permission to message them.

WhatsApp links only work on the real domain, because the template URL is fixed to www.3orsna.com.

## 9. Setup order

1. **Collections:** import all 15 CSVs from `1-databases/` and set types and permissions, as in `1-databases/DATABASES.md`.
2. **Backend and Public:** add every file in section 5, and delete the files in section 4.
3. **Pages:** create **ADD LISTING** (`/add-listing`, permissions Everyone) and the couple pages if you haven't yet. Paste each iframe and its page code (section 3), and delete the four old Add pages.
4. **Settings:** check the URLs in `public/routes.js` and the admin emails in `backend/config.js`.
5. **Secrets and Meta**, for WhatsApp (section 8). You can do this later; the guest list works without it.
6. **Publish.** Backend changes only take effect after publishing.
7. **Height.** Each iframe sits in its own full-width section.
   - **Before launch (no connected domain):** set each section to **100vh** and stretch the HTML element to fill it. The iframe scrolls inside itself, with no visible scrollbar.
   - **Once live on www.3orsna.com:** add the Pixel Pals auto-height listener v1 in **Settings → Custom Code** (All pages, Load code once, Body – end), then switch each section to **Auto** height with a small minimum. The iframes then grow and shrink to fit their content.

## 10. Test run

Use a private window for each new account. You can test as an admin throughout, since admins pass everything.

1. **Sign up as a vendor** at `/signup`. You land on `/vendor-dashboard`. Contacts shows the **Vendor** label, and `VendorProfiles` has your row.
2. **Click Add venue.** `/add-listing` opens on the Venue tab. Fill it in with a cover photo and publish. "Rose Garden is published", and it's live on `/venues` straight away.
3. **Add catering, then a package, then a promotion**, each linked to that venue. All go live straight away.
4. **Open `/my-wedding` as that vendor.** You're sent back to `/vendor-dashboard`.
5. **Sign up as talent.** You land on `/talent-dashboard`, which opens straight onto "Create your first listing". Publish it there and it's live on `/wedding-talent` straight away; the dashboard switches to your listings. "+ New listing" adds more.
6. **Send an enquiry from that talent's page** (logged out). You see "Sent" or "Received". A row appears in `TalentEnquiries`, and on the talent's dashboard.
7. **Sign up as a couple.** You land on `/my-wedding`. Build the page in the builder (`/edit-wedding`) and publish. Open the `/invite/<slug>` link in a private window, reply, and the reply shows on the dashboard.
8. **Add guests on `/my-guests`.** WhatsApp sending needs section 8 first.
9. **Open `/vendor-dashboard`, `/my-wedding` and `/talent-dashboard` in a private window without logging in.** Each one sends you to the home page. Log in on a dashboard, then log out there, and you're sent home too.
10. **As an admin, Take down the venue** on the Admin Dashboard (Venues). It disappears from `/venues`, and the vendor sees "Our team has taken this venue down" and can't switch it back on. **Restore** puts it back.
11. **On Add venue to claim, add a venue** with an email you can sign up with. Sign up as a vendor with that email: the venue is under **Venues waiting for you** on the vendor dashboard. Claim it, and it leaves the admin's "Waiting to be claimed" list.

If anything fails, the bracketed text in the message is the real error. Send it over.

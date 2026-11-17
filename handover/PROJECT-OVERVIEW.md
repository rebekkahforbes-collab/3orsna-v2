# 3orsna — project overview (for developers and AI assistants)

This file explains the whole build so someone new — human or AI — can work on it safely. Read it before changing anything. For step-by-step installation and a test run, see `00-START-HERE.md`; for every collection, field type and permission, see `1-databases/DATABASES.md`.

---

## 1. What this is

**3orsna** (3orsna.com, "عرسنا", "our wedding") is a bilingual (English/Arabic) wedding platform for Jordan, built on **Wix Studio with Velo**. Built by **Pixel Pals** (a London Wix Partner agency) for a client. The site is currently on a test URL (`https://pixel-pals.wixstudio.com/3orsna-v2`); it moves to www.3orsna.com later.

Three kinds of account use it:

| Account type | What they do |
|---|---|
| **Couple** | Builds a wedding invitation page with RSVP, manages a guest list (with WhatsApp invites), and tracks the venues and talent they've enquired with (shortlist). |
| **Vendor** | **Venues only.** Lists wedding venues, plus catering options, packages and promotions attached to them, and handles venue enquiries. |
| **Talent** | **Every other wedding service** — photographers, DJs, singers, planners, florists, make-up artists. Lists their service and handles enquiries. |

Plus **admins** (Pixel Pals / the client), who can take listings down.

---

## 2. Architecture in one picture

```
Browser (visitor / member)
 └─ Wix page (Velo page code, in 4-pages/)
     ├─ HTML iframe element (5-iframes/*.html) — all UI lives here
     │     ⇅ window.postMessage  ({ type: "...", ... })
     └─ page code ⇄ backend (2-backend/*.web.js / *.jsw)  — all data access
                       └─ Wix CMS collections (1-databases/*.csv)
                       └─ WhatsApp Cloud API (Meta), Wix Media, triggered emails
```

- **Every UI is a standalone HTML iframe** pasted into a Wix "Embed code → HTML" element. The iframe never talks to the database; it posts messages to its page, the page calls the backend, and the page posts the result back.
- **The backend owns all security.** Collections are Admin-only (apart from public read on listing data). Backend code uses `suppressAuth` and checks who is calling on every request.
- **Some public pages (VENUES, VENUE, WEDDING TALENT, Talent (Item)) and their iframes were built by the client/earlier developers.** Their iframes are not in this package; their page code is, where it was changed.

---

## 3. Folder map

| Folder | Contents |
|---|---|
| `00-START-HERE.md` | Installation order, page table (URL, iframe ID, files), WhatsApp setup, test run |
| `PROJECT-OVERVIEW.md` | This file |
| `1-databases/` | 15 CSVs (file name = collection ID) + `DATABASES.md` (types, permissions) |
| `2-backend/` | All backend files — paste into Wix **Backend** with the same names |
| `3-public/` | `routes.js`, `role-guard.js` — paste into Wix **Public** |
| `4-pages/` | Page code, grouped `account/`, `couple/`, `vendor/`, `talent/`; file name = Wix page name |
| `5-iframes/` | The 7 iframes this build owns |
| `6-tools/` | `build-invite.py` regenerates `wedding-invite.html` from the builder (not uploaded to Wix) |

### Backend files

| File | Type | Responsibility |
|---|---|---|
| `config.js` | plain | Site URL, invite prefix, collection names (couple side), WhatsApp settings, `ROLES` (label → dashboard), `ADMIN_EMAILS`, `ADMIN_LABEL` |
| `access.js` | plain | `caller()` → `{ member, role, admin }`; account type from **contact labels**; `allowRole()`; `addRoleLabel()` |
| `accounts.web.js` | web | Sign-up with an account type (`registerWithRole`), `chooseMyRole` (once), `getMyRole` |
| `data.js` | plain | Couple side core: weddings, RSVPs, dashboard, guest list, WhatsApp sending and webhook handling |
| `whatsapp.js` | plain | WhatsApp Cloud API: secrets, phone normalisation, template/text sends |
| `weddings.web.js` | web | Builder load/save/publish, dashboard, invitation (`getInvite`), RSVP |
| `guests.web.js` | web | Guest list CRUD and batched WhatsApp sends |
| `media.web.js` | web | Couple photo uploads (base64 → Wix Media) |
| `shortlist.web.js` | web | Couple's shortlist — built automatically from their enquiries; status + notes |
| `http-functions.js` | http | WhatsApp webhook `/_functions/whatsapp` (signature-verified) |
| `vendorCreate.web.js` | web | Add listing page: venue, catering, package, promotion; photo upload; option lists |
| `vendorDashboard.jsw` | jsw | Vendor dashboard data, visibility, claims, profile, **venue enquiries** + status |
| `vendorVenueEdit.jsw` | jsw | Edit venue |
| `listingMedia.jsw` | jsw | Photo upload/cleanup for Edit venue |
| `venueInquiry.jsw` + `email.js` | jsw + plain | Venue enquiry → `RequestDirectory` + email to the vendor |
| `talentSubmit.jsw` | jsw | New talent listing (onboarding) |
| `talentEdit.jsw`, `talentDashboard.jsw`, `talentMedia.jsw` | jsw | Talent editing, dashboard + enquiries, photos |
| `talentEnquiry.jsw` | jsw | Talent enquiry → `TalentEnquiries` + email to the talent |
| `admin.web.js` | web | **Admin dashboard**: overview counts, every list, hide/show, take down/restore, feature, publish, guest list on/off, enquiry status, suspend talent, talent categories, add venues for owners to claim; admin-only |
| `adminReview.jsw` | jsw | Old admin review queue — **moved to `7-retired/`**. Not used by the new Admin Dashboard; delete it from the site once that's in |
| `events.js` | plain | Intentionally empty (it used to create a vendor profile for every member) |
| `permissions.json` | — | Wix web-module permissions; keep as is |

### Public files

- `routes.js` — **every account page URL**, one place: `home`, `coupleDashboard`, `vendorDashboard`, `vendorAddListing`, `talentDashboard`, `talentOnboarding`, `talentEdit`, `talentDirectory`, `signup`. Paths only, no domain.
- `role-guard.js` — `requireRole(type)` (sends logged-out visitors to the home page — instantly, before any backend call — and does the same if they log out on the page; sends the wrong account type to their own dashboard; sends unlabelled members to sign-up; **admins pass everywhere**, including the site owner in Preview) and `goToMyDashboard()`.

### Iframes this build owns

| Iframe | Page (element ID) | What it is |
|---|---|---|
| `signup.html` | Custom Signup `/signup` (`#signupFrame`) | Pick Couple / Vendor / Talent + register; "pick a type" mode for members without one |
| `wedding-builder.html` | EDIT WEDDING `/edit-wedding` (`#builderFrame`) | Couple's invitation builder: details, design (Colour / Design / Your photo + optional couple photo), photos, replies, share. Draft/Live pill in the header; a full-width banner confirms Publish with the page link |
| `wedding-invite.html` | Weddings (Item) `/invite/{slug}` (`#inviteFrame`) | Public invitation + RSVP. **Generated** from the builder by `6-tools/build-invite.py` — never edit by hand |
| `couple-dashboard.html` | MY WEDDING `/my-wedding` (`#dashFrame`) | Couple dashboard **+ shortlist section** |
| `guest-list.html` | MY GUESTS `/my-guests` (`#guestsFrame`) | Guest list, RSVP status, WhatsApp single/bulk sends, and **replies from people not on the list** (shared link or another number) with Add to list / Match to a guest |
| `vendor-dashboard.html` | VENDOR DASHBOARD `/vendor-dashboard` (`#html1`) | Vendor's venues, **enquiries tab**, claims, account (originally the client's iframe, extended here) |
| `vendor-add.html` | ADD LISTING `/add-listing` (`#addFrame`) | One page, four tabs: Venue, Catering, Package, Promotion |
| `venues.html`, `venue-detail.html` | VENUES `/venues`, VENUE `/venues/{title}` (`#html1`) | Venue directory with filters; venue page with enquiry form (originally the client's) |
| `talent-directory.html`, `talent-profile.html` | WEDDING TALENT `/talent`, Talent (Item) `/talent/…` (`#html1`) | Talent directory; talent page with booking request (originally the client's) |
| `talent-dashboard.html` | TALENT DASHBOARD (`#html1`) | Listings, enquiries, account **and the new-listing form** (live on save). Talent with no listings land on the form. Messages `dash:*` incl. `dash:upload`/`dash:uploaded`, `dash:submit`/`dash:submitted`, `dash:scrollTo` |
| `talent-edit.html` | Talent Edit (Item) (`#html1`) | Edit a talent listing. (`talent-submit.html` / BECOME A WEDDING TALENT is retired — the form lives in the dashboard) |
| `home-latest.html` | HOME, new section (`#latestFrame`) | One section with Venues / Wedding talent tabs: the 3 newest live listings of each, with links to each page and to the directory for the selected tab. Messages `hl:ready` → `hl:data {venues, talent}` |
| `admin-dashboard.html` | Admin Dashboard (`#adminFrame`) | Overview · Venues · Talent (+ categories) · Catering & offers · **Add venue to claim** · Couples · Accounts · Enquiries |

---

## 4. Accounts, labels and admins

- **Account type = a Wix contact label**: `Couple`, `Vendor`, `Talent` (set in `ROLES` in `config.js`). Labels are created automatically on first use. To change someone's type, change the label in Dashboard → Contacts. **No Wix "Roles & Permissions" are used.**
- Set at sign-up (`registerWithRole`) or once via `chooseMyRole` (members who used Wix's normal sign-up/Google). It can't be changed from the browser.
- Vendors get a `VendorProfiles` row at sign-up (and one is created automatically on the dashboard / Add listing if missing). Talent create theirs through onboarding.
- **Admins pass every check** so testing is never blocked: the site owner, any email in `ADMIN_EMAILS`, or a contact with the `Admin` label.
- **Login is Wix's normal login.** Dashboard pages are set to **Everyone** in page permissions, not Members-only — otherwise Wix shows its own login screen and the page code never runs. `requireRole` sends logged-out visitors home and decides which type sees which page; the backend still checks every request, so the open page shows no data to anyone else.

---

## 5. Data (15 collections)

Full field lists, types and permissions: `1-databases/DATABASES.md`. Collection IDs and field keys are case-sensitive and permanent.

| Collection | Side | Notes |
|---|---|---|
| `Weddings` | Couple | One per couple (`ownerId`). Public read (invitation page). `style`: `colour` / `artwork` / `photo`; `couplePhotoUrl` optional on all. Old `portrait` style is converted to `artwork` + couple photo. |
| `Guests` | Couple | Guest list; phone in `+9627…` form; `inviteToken` for personal links |
| `RSVPs` | Couple | Every reply (page or WhatsApp) |
| `WhatsAppMessages` | Couple | Log of every WhatsApp message in/out |
| `Shortlist` | Couple | One row per venue/talent the couple enquired with; `status` + `note` |
| `Venues` | Vendor | Review field **`approved`** (`approved`/empty = live, `rejected` = taken down) + `visibility`; `reference` → VendorProfiles |
| `VendorProfiles` | Vendor | Matched to the vendor by `email` = login email; `venues` multi-ref |
| `Catering`, `Packages`, `Promotions` | Vendor | `owner` → VendorProfiles; multi-refs to venues / catering / packages |
| `RequestDirectory` | Vendor | Venue enquiries; `status` (`new`/`contacted`/`booked`/`declined`), `memberId` of the sender |
| `Talent` | Talent | Review field **`approvalStatus`** (same values as Venues' `approved`); `owner` → TalentProfiles |
| `TalentProfiles` | Talent | Matched by `loginEmail` |
| `TalentCategories` | Talent | Category list (`name`, `active`, `sortOrder`) |
| `TalentEnquiries` | Talent | Talent enquiries; `memberId` of the sender |

The main (primary) field is `title`; there are **no `_fld` fields** (`title`, `description`, `image`).

---

## 6. Business rules

- **Enquiries are for couples.** Venue and talent enquiries need a logged-in Couple account (admins pass). Anyone else gets a pop-up over the form; *Create a couple account* opens sign-up with Couple chosen (`session: signupRole`) and returns to the listing (`session: returnTo`).
- **Vendor contact card.** Each venue page shows the vendor's name always, plus photo, phone and email unless the vendor has hidden them (VendorProfiles `showImage/showPhone/showEmail`). Served by `getVenueVendor` in `venueInquiry.jsw`; no page reads VendorProfiles directly.
- **Premium = `guestListEnabled`.** Premium couples get the guest list, WhatsApp invitations and the invitation-as-image. The invitation JPG (`Weddings.cardImageUrl`) is made in the builder (html-to-image, loaded on demand) and refreshed on every publish.

- **No pre-approval.** Every new or edited listing (venue, catering, package, promotion, talent) is saved approved and visible. Admins take things down with **Reject** on the Admin Dashboard; the owner then sees "Our team has taken this down" and can't switch it back on. **Approve** restores.
- **Vendors are venues only; talent is everything else.** Venue option lists are wedding-only (`VENUE_CHOICES` in `vendorCreate.web.js`) — no conference halls, birthdays or corporate events.
- **Couple photo** is optional on every invitation style (circle / heart / square).
- **Shortlist** shows only venues/talent the couple has sent an enquiry to (matched by `memberId`, or by login email for older enquiries). No search or manual adding.
- **Contact details** (phone/email) are only shown where the listing shows them publicly (Venues: `showPhone`/`showEmail` = `Yes`; Talent: `showPhone` = true).
- **WhatsApp** goes out from the 3orsna business number via approved templates (`wedding_invitation`, `wedding_reminder`, `wedding_update`), in batches of 20, max 500/day per wedding. Guests can tap Accept/Decline in WhatsApp; the webhook updates their RSVP.

---

## 7. Message protocols (iframe ⇄ page code)

Height follows the Pixel Pals standard: every owned iframe ends with the **auto-height reporter v3**, which sends `setHeight` to the **site-wide listener** (Wix Custom Code). Page code no longer handles height. Until the listener is live, each iframe scrolls inside itself with hidden scrollbars. Every iframe **repeats its "ready" message every second** until the page answers (see §8).

| Iframe | Sends | Receives |
|---|---|---|
| `signup.html` | `3orsna:signupReady`, `3orsna:signup {data}`, `3orsna:chooseRole {role}`, `3orsna:login` | `3orsna:signupState {loggedIn}`, `3orsna:signupDone {status}`, `3orsna:signupFailed {reason}` |
| `wedding-builder.html` | `3orsna:ready`, `3orsna:save {auto,data}`, `3orsna:publish {data}`, `3orsna:upload {slot,uid,name,dataUrl}`, `3orsna:scrollTop` | `3orsna:load {data,publicBase}`, `3orsna:saved {status,slug,publicUrl,wasPublish}`, `3orsna:saveFailed`, `3orsna:slugTaken`, `3orsna:uploaded {slot,uid,url}`, `3orsna:uploadFailed` |
| `wedding-invite.html` | `3orsna:inviteReady`, `3orsna:rsvp {data}` | `3orsna:invite {data}`, `3orsna:viewport {height}`, `3orsna:rsvpDone`, `3orsna:rsvpFailed {reason}` |
| `couple-dashboard.html` | `3orsna:dashReady`, `3orsna:refresh`, `3orsna:setPublished {on}`, `3orsna:nav {to}`, `sl:ready`, `sl:refresh`, `sl:update {id,patch}`, `sl:open {url}` | `3orsna:dash {data}`, `3orsna:error`, `sl:data {items}`, `sl:saved {id,ok}` |
| `guest-list.html` | `3orsna:guestsReady`, `3orsna:refresh`, `3orsna:saveGuest {guest,tempId}`, `3orsna:removeGuest {id}`, `3orsna:send {ids,kind,note}`, `3orsna:linkReply {rsvpId,guestId?}`, `3orsna:nav` | `3orsna:guests {data: items, others, …}`, `3orsna:linkError {rsvpId,reason}`, `3orsna:guestSaved`, `3orsna:guestError`, `3orsna:guestRemoved`, `3orsna:sendProgress`, `3orsna:sendDone` |
| `vendor-dashboard.html` | `vd:ready`, `vd:refresh`, `vd:visibility {id,visible}`, `vd:claim {id}`, `vd:saveProfile {patch}`, `vd:enquiryStatus {id,status}`, `iframe:navigate {url}` | `vd:data`, `vd:blocked`, `vd:enquiries {data}`, `vd:enquiryStatusResult`, `vd:visResult`, `vd:claimResult`, `vd:profileSaved` |
| `admin-dashboard.html` | `ad:ready`, `ad:call {reqId,fn,args}` (fn: overview, list, act, choices, upload, createVenue), `ad:scrollTop` | `ad:hello {email,base}`, `ad:result {reqId,ok,…}` |
| `vendor-add.html` | `al:ready`, `al:upload {uid,dataUrl,name}`, `al:save {kind,payload,hero,gallery}`, `al:nav` | `al:data {data,kind}`, `al:uploaded {uid,url}`, `al:uploadFailed`, `al:saved {ok,kind,error}` |

The Add listing tab to open is passed in **session storage** (`addListingType`), set by the vendor dashboard's Add buttons — page URLs never carry query strings.

---


**Added in November 2026:**
- **Venue page:** `detail:viewer {viewer}` (page → iframe: who is viewing), `detail:signup`, `detail:login`. `detail:inquiryResult` now carries `code` (`LOGIN_REQUIRED` / `NEEDS_TYPE` / `COUPLE_ONLY`), which opens the pop-up.
- **Talent page:** the same messages, with the `tp:` prefix.
- **Vendor dashboard:** `vd:uploadPhoto {dataUrl,name}` → `vd:photoUploaded {ok,url,error}`; `vd:saveProfile` patch also takes `showImage`, `showPhone`, `showEmail` and `image` (`null` removes it).
- **Builder:** `3orsna:upload` with `slot: "card"` uploads the invitation JPG; saves carry `cardImageUrl`.
- **Guest list:** `3orsna:send {kind:"invite", note}` — `note` is the couple's invitation message.

## 8. Wix rules learned the hard way (do not break these)

1. **`.jsw` files: only `export async function name()` is callable from a page.** `export const x = …` in a `.jsw` is invisible to the browser ("x is not a function").
2. **New web modules must be `.web.js`**, and **each export must be written literally as `export const name = webMethod(Permissions.X, …)`**. A wrapper like `export const x = safe(fn)` is not registered.
3. **Wix hides thrown backend errors** — the browser only gets "Unable to handle the request". So backend calls used by pages **return `{ ok, error }` instead of throwing** (see `vdLoad`, `sendTalentEnquiry`, `vendorCreate`, `shortlist`). While testing, pages show the real reason in brackets (`SHOW_ERROR_DETAILS = true` in VENDOR DASHBOARD and Talent (Item) — set to false at launch, along with the other testing flags listed in §11).
4. **Page code must call `frame.onMessage(...)` before any `await`.** Account checks run alongside (`const allowed = requireRole('x')`, then `await allowed` inside the handler). Iframes repeat their ready message every second until answered. Breaking this leaves iframes stuck on "loading".
5. **Links inside iframes** resolve against the iframe's own domain (`*.filesusr.com`). Same-site navigation must be posted to the page (`iframe:navigate`, `sl:open`, `3orsna:nav`) and done with `wixLocation.to()`.
6. **Dynamic-page link fields are named after how the page was created** (`link-venues-title`, `link-copy-of-venues-venueName`, …). Code finds them by **where they point**: a URL containing `edit` is the edit page, any other is the public page. The EDIT VENUE page URL must contain "edit" (`/edit-venue/{title}`).
7. **Collection IDs and field keys are case-sensitive and can't be renamed.** Wix builds an ID from the typed name ("Talent categories" → `Talentcategories`), so type the exact ID.
8. **`eq()` is case-sensitive; `contains()` isn't.** Email matching uses `contains()` then an exact lowercase compare.
9. **Routers need a URL prefix**; the invitation is a dynamic page at `/invite/{slug}` instead.
10. **Backend calls stop after 14 s** — WhatsApp sends are batched (20 per call) from the page.
11. **Secrets**: use `secrets.getSecretValue` from `wix-secrets-backend.v2` with `elevate` (`getSecret` is deprecated).
12. **Photos** are downscaled in the iframe and sent as base64 to the backend (`uploadImage`, `uploadPhoto`), kept under ~1 MB; only Wix Media URLs are saved, never data URLs.
13. **Triggered emails to members** must use `triggeredEmails.emailMember(templateId, memberId)` — `createContact` for a member's email fails ("member already exists").
14. **Page code doesn't run in the Wix editor** — test in Preview or on the published site, and publish after every backend change.

---

## 9. Conventions when changing anything

- **Deliver updates as two folders that mirror the repositories.**
  - `3orsna-site/src/…` uses Wix's exact page file names, such as `VENUES (Item).vf8rx.js`.
  - `3orsna-iframes/` holds the iframes, served by GitHub Pages and loaded with **Website address**.
  - Always list new CMS fields at the top. They're the only manual step.

- **New features go into the existing page's iframe** (e.g. enquiries in the vendor dashboard, shortlist in the couple dashboard) — not a new page or iframe.
- **Layout safeguards (every iframe, `<style id="pp-layout">` before `</head>`):** transparent page background so the Wix section shows through; content width `max(80%, previous max width)`; venue and talent grids fixed at 3 / 2 / 1 columns; iOS-safe date fields; save bars not sticky; a `.pp-safe-space` block before the reporter (140px, 180px on phones). The invitation keeps its own colour and gets the safety space as padding inside `.inv`; sign-up keeps its narrow form column.
- **No scrollbars; everything self-resizes** in height and width; works on phones (no sideways scroll, inputs 16px). Every owned iframe has the standards CSS block at the top of its `<style>` and reporter v3 just before `</body>`; no `vh` or `height:100%` on wrappers; scroll code targets `document.body`.
- **No business name or logo inside iframes** — the Wix pages already have them.
- Couple-side brand gold **#BD9B68**, dark UI, **English + Arabic (RTL)**; language choice shared via `localStorage["3orsna:uiLang"]`. That language choice is the **only** thing kept in the browser: wedding data lives only in the database, because several couples may use the same browser (the builder used to keep a `3orsna:draft` copy, which leaked one account's invitation into the next). The vendor dashboard keeps its own existing design.
- **Wedding-only wording and options.**
- **Admins must never be blocked** (testing).
- When a collection changes, provide an **import-ready CSV** for it and update `DATABASES.md`.
- When the builder's designs/CSS change, run `python3 6-tools/build-invite.py` to regenerate `wedding-invite.html`.
- Deliver files individually; send `.jsw` code as `.txt` copies so it can be read in chat.

---

## 10. Settings you're likely to change

| What | Where |
|---|---|
| Account page URLs | `3-public/routes.js` |
| Labels, admin emails | `2-backend/config.js` (`ROLES`, `ADMIN_EMAILS`, `ADMIN_LABEL`) |
| Site URL for WhatsApp links, invite prefix | `config.js` (`SITE_URL`, `INVITE_PREFIX`) |
| WhatsApp templates, limits | `config.js` (`WA`) |
| Venue option lists | `vendorCreate.web.js` (`VENUE_CHOICES`) |
| Invitation designs (artwork PNGs), ornaments, cover-photo library | `wedding-builder.html` (`ARTWORKS`, `BORDERS`, `COVERS`) |
| Error details and debug output shown while testing | `SHOW_ERROR_DETAILS` and `DEBUG` flags — see the list in §11 |

---

## 11. Status and open items

**Tested by the client so far:** vendor sign-up, adding a venue, package, promotion and catering option, sending and receiving a venue enquiry. Couple side in progress. Talent side and WhatsApp not yet tested live.

**Known gaps / not built:**
- Vendors can add catering options, packages and promotions but **can't edit or delete** them (only venues have an edit page).
- The venue enquiry form has **no message field**; couples get **no confirmation email**.
- Vendors can hide a venue but not delete it.
- **WhatsApp** needs the Meta setup (secrets, webhook, approved templates) — see `00-START-HERE.md`.
- **Triggered emails** must exist in the dashboard: `requestAvailability` (venue enquiry), `TALENT_ENQUIRY`, and `VENUE_APPROVED` / `VENUE_REJECTED` / `TALENT_APPROVED` / `TALENT_REJECTED`.
- The cover-photo library (`COVERS` in the builder) is empty until Wix Media URLs are added; the 10 design PNGs and 7 ornament SVGs come from Wix Media and need checking in a browser.
- The client's public iframes are now in the package and on the same standards: `venues.html` (VENUES), `venue-detail.html` (VENUE), `talent-directory.html` (WEDDING TALENT), `talent-profile.html` (Talent (Item)), `talent-submit.html` (BECOME A WEDDING TALENT), `talent-edit.html` (Talent Edit (Item)). Their message prefixes are unchanged (`venues:`, `detail:`, `talent:`, `tp:`, `ts:`, `te:`); the old `*:height` messages are gone, and `detail:`/`tp:`/`ts:`/`te:` add a `scrollTo {y}` message the page answers by scrolling to the iframe and down by y. **Still to bring over:** the EDIT VENUE and TALENT DASHBOARD iframes (their page code still has the old height handlers until then). The Admin Dashboard is ours (`admin-dashboard.html`).
- **Admin Dashboard:** *Hide* is the owner's own switch (they can turn it back on); *Take down* is the admin's decision (they can't); *Restore* puts it back live. Venues added on **Add venue to claim** have no owner and carry `toBeClaimedByEmail`; a vendor signing up with that email claims it from **Venues waiting for you**. Enquiries to an unclaimed venue are saved but not emailed (there's no owner yet) — answer them from the Enquiries tab.
- Before launch: set every testing flag below to `false`, delete the CSV example rows, and switch the site URL to www.3orsna.com.

**Testing flags (all currently `true`):**

| Flag | File | What it does while `true` |
|---|---|---|
| `SHOW_ERROR_DETAILS` | `4-pages/vendor/VENDOR DASHBOARD.js` | Shows the real error in brackets on the vendor dashboard |
| `DEBUG` | `4-pages/vendor/VENDOR DASHBOARD.js` | Extra logging in the vendor dashboard page code |
| `SHOW_ERROR_DETAILS` | `4-pages/talent/Talent (Item).js` | Shows the real error in brackets on the public talent page |
| `DEBUG` | `4-pages/talent/TALENT DASHBOARD.js` | The blocked panel shows the underlying error instead of only "we could not load" |
| `DEBUG` | `2-backend/vendorDashboard.jsw` | Logs link-field detection to the Wix site logs |
| `DEBUG` | `5-iframes/vendor-dashboard.html` (`var DEBUG`) | Debug output inside the vendor dashboard iframe |

Set all six to `false` at launch.

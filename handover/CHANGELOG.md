# 3orsna — changes since the original brief

Everything below is already in this package. `00-START-HERE.md` is the setup guide and `PROJECT-OVERVIEW.md` the reference; this file is the "what changed" list, with what still has to be done on the site at the end.

## November 2026 additions
- **Talent opens on a category menu**: WEDDING TALENT starts with a grid of service boxes (icon + number listed, plus "All talent"); a box opens the directory on that category, "← All categories" goes back. Links with a category or other filter go straight to the directory.
- **Enquiries are for couples only**: on venue and talent pages anyone else gets a pop-up over the form — logged out: *Create a couple account* (opens sign-up with Couple chosen and comes back to the same listing) or *log in*; no account type: *Choose Couple*; vendor/talent accounts: told enquiries are for couples. The backend enforces it too (admins pass). The venue page's enquiry call no longer throws (`sendInquiry`).
- **Vendor contact card on venue pages**: name always; photo, phone and email can each be hidden from the dashboard's Account tab, which now has a profile photo upload. The venue page gets these from the backend (`getVenueVendor`), so hidden details never reach the browser. New fields **VendorProfiles → `showImage`, `showPhone`, `showEmail`** (Boolean).
- **Premium: invitation as a JPG**: builder → Share → *Save invitation as image* turns the card into a JPG to download and preview; it's saved with the wedding and refreshed on every publish. Locked for couples without Premium (`guestListEnabled`). New field **Weddings → `cardImageUrl`** (Text).
- **WhatsApp invitations send the card**: the invitation is now the card image, the couple's own message (written in the guest list, remembered for next time) and their personal link as the last line. New field **Weddings → `inviteMessage`** (Text); the `wedding_invitation` template changes (see `00-START-HERE.md` §8).

## Accounts and access
- **Logged-out visitors go to the home page** from every dashboard page (`3-public/role-guard.js`, `routes.js` has `home: '/'`). Logging out on a dashboard also sends you home. Dashboard pages must be set to **Everyone** in page permissions — the code guards them.
- `MY PROFILE` sends logged-out visitors home too.

## Couples
- **Invitation builder no longer leaks another account's invitation** — nothing is kept in the browser any more; every load starts blank and fills in only this couple's wedding. Saving is blocked until the wedding has loaded.
- **Publishing is obvious**: Draft/Live pill in the header, a full-width banner with the page link, View and Copy buttons, and clear failure messages. The publish/save race that could create two Weddings rows is fixed.
- **Couples can upload their own design** (Design style → "Your own design"): portrait PNG/WebP with a transparent background; flat white exports are refused with an explanation. New CMS field **Weddings.ownArtworkUrl** (Text).
- **The ten designs were replaced** with the latest artwork (Designs 1–10, same ids, so existing couples keep their numbered design).
- **Guest list shows replies from numbers not on the list** (shared link or another phone), with *Add to list* and *Match to a guest*.
- **Shortlist links to each venue/talent page** (photo, name and "View page").
- Style step wording fixed ("Three ways", in English and Arabic).

## Vendors, venues and talent (public pages)
- The client's public iframes are now in the package and on Pixel Pals standards: `venues.html`, `venue-detail.html`, `talent-directory.html`, `talent-profile.html`, `talent-edit.html`.
- **Venues and Wedding Talent directories: 9 per page with numbered pages** (page number kept in the address), 3 × 3 grid.
- **Talent directory link is `/wedding-talent`** everywhere ("See all talent", "Back to talent").
- Venue page: "Plan seating layout" removed; calendar now always shows on load; one faulty section can't break the page.
- Talent page: the date field no longer looks longer on iPhones.
- Wording that promised a review process removed (nothing waits for review).
- Fixed: chips toggling twice after "Discard changes" on Talent Edit; venue links that could point at the list page.

## Talent accounts
- **"Become a wedding talent" is now inside the Talent Dashboard.** A talent with no listings lands straight on "Create your first listing"; "+ New listing" adds more. The old page is retired (its page code forwards to the dashboard).
- The dashboard loads for new talent (an empty profile is created on first visit); name and phone are asked for on the listing form or the Account tab.
- Dashboard, listing form and photo uploads now return their error reasons (Wix hides thrown ones), so messages like "That title is already used" reach the talent.

## Admin
- **New Admin Dashboard** (`admin-dashboard.html`, `backend/admin.web.js`): overview, venues, talent (+ categories), catering & offers, **Add venue to claim**, couples, accounts, enquiries. Hide / take down / restore / feature / publish / suspend and more.

## Home page
- **New "Just added" section** with Venues / Wedding talent tabs — the 3 newest live listings of each (`home-latest.html`, `HOME (latest section).js`).

## Every iframe
- Height reporter v3 (site-wide listener sizes them once the domain is live); no scrollbars; old per-page height code removed.
- **Transparent background** — the Wix section shows through. Give those sections the site's dark colour.
- **Content width 80% of the frame** (never narrower than before); sign-up keeps its narrow form; the invitation keeps its own width.
- **Safety space at the bottom** of every iframe (140px, 180px on phones); the invitation's is inside it, in its own colour.
- iOS-safe form fields, long words wrap, repeating "ready" handshake, scroll-to-field works whether or not the iframe has been sized.

## Data
- `1-databases/Weddings.csv` has the new `ownArtworkUrl` column.
- `1-databases/samples/` — sample venues, talent and talent profiles (see its README).

## Retired (in `7-retired/`)
- `talent-submit.html` (BECOME A WEDDING TALENT) and `adminReview.jsw` — see `7-retired/README.md`.

## Still to do on the site
0. **November additions:** add **VendorProfiles → `showImage`, `showPhone`, `showEmail`** (Boolean) and **Weddings → `cardImageUrl`, `inviteMessage`** (Text); re-submit the **`wedding_invitation`** template in WhatsApp Manager with an Image header and the new body (en + ar); VendorProfiles read permission can now be Admin.
1. **CMS:** add **Weddings → `ownArtworkUrl`** (Text).
2. **Triggered email:** create **`VENUE_CLAIM_INVITE`** (variables `venueName`, `signupUrl`); the take-down/restore emails use `name`, `listingTitle`, `reason`.
3. **Page permissions:** dashboard pages and the Admin Dashboard set to **Everyone**.
4. **Sections:** each iframe in its own full-width section with the site's dark background; before launch 100vh with the element stretched, after launch Auto + the listener.
5. **BECOME A WEDDING TALENT:** delete the page once nothing links to it, and add the redirect to `/talent-dashboard`.
6. **`/claim-venue`:** make sure the page the venue page's "Claim this profile" button opens exists (or ask to point it at sign-up).
7. **Still the client's own iframe:** EDIT VENUE — send its HTML to bring it onto the same standards (its page code still has the old height handler).
8. **Before launch:** testing flags to `false` (list in `PROJECT-OVERVIEW.md` §11), delete sample rows, switch to www.3orsna.com, add the height listener in Custom Code.

# 3orsna — databases

There are 15 collections. For each one, create it by importing the CSV of the same name from this folder.

## Before you import

- **The collection ID must match the CSV file name exactly**, capitals included: `Venues`, `TalentEnquiries`, and so on. IDs can't be changed later.
- **The column headers are the exact field keys.** In the import screen, check each key is unchanged. Keys can't be changed later either.
- **Set each field's type in the import screen**, using the tables below. Anything not listed is **Text**.
- **The example rows are for testing.** Delete them before launch.
- **Reference fields** (marked **Ref →**) link to another collection, and are empty in the examples. If the import screen doesn't offer the Reference type, leave that column out, then add the field by hand after import, with exactly that key, as **Reference** or **Multiple items reference** to the collection shown.
- **The main (primary) field is `title`** in every collection that has one. Make sure the import maps the `title` column to the collection's Title field.
- **Dates** in the CSVs are `YYYY-MM-DD`, and date-times are ISO, e.g. `2026-10-01T10:00:00Z`. **Tags and arrays** are written as `["a","b"]`.
- **Photos (Image or Media gallery) are blank.** Upload them in the CMS, or let the site's forms fill them.

## Permissions

Set create, update and delete to **Admin** on every collection. All writes go through the backend, which checks who's asking.

**Read** is **Anyone** only where public pages read the collection directly:
- `Weddings` (the invitation page)
- `Venues`, `Catering`, `Packages`, `Promotions` (venue pages)

`VendorProfiles` can be **Admin** for read too: the venue page now gets the vendor's details from the backend, which leaves out anything the vendor has hidden.
- `Talent`, `TalentCategories` (talent pages)

All other collections are **Admin** for read too: `Shortlist`, `Guests`, `RSVPs`, `WhatsAppMessages`, `TalentEnquiries`, `RequestDirectory`, `TalentProfiles`.

## Couples (wedding pages and guest list)

**Weddings:**

| Fields | Type |
|---|---|
| `weddingDate`, `rsvpDeadline` | Date |
| `publishedAt` | Date and time |
| `isPrivate`, `guestListEnabled`, `rsvpOn`, `rsvpAskCount`, `rsvpAskMsg`, `rsvpAskPhone` | Boolean |
| `rsvpMaxParty` | Number |
| `previousSlugs` | Tags |
| `galleryUrls` | Array |

`couplePhotoUrl`, `coverUrl`, `ownArtworkUrl` and `cardImageUrl` are **Text** (image addresses). `cardImageUrl` is the invitation saved as a JPG (Premium); it is the image sent with WhatsApp invitations. `inviteMessage` (**Text**) is the couple's own invitation message, remembered from their last send. `ownArtworkUrl` is a couple's own uploaded design; `artwork` is `a1`–`a10` for ours or `own` for theirs. `style` is `colour`, `artwork` or `photo`; the couple photo is optional on all three.

**Guests:**

| Fields | Type |
|---|---|
| `partySize` | Number |
| `rsvpAt`, `waLastSentAt` | Date and time |

**RSVPs:**

| Fields | Type |
|---|---|
| `attending` | Boolean |
| `partySize` | Number |
| `submittedAt` | Date and time |

**WhatsAppMessages:**

| Fields | Type |
|---|---|
| `sentAt`, `statusAt` | Date and time |

`weddingRef`, `guestRef` and `ownerId` are plain **Text** IDs, not Reference fields.

## Shortlist (couples)

**Shortlist** — every venue and talent a couple has sent an enquiry to, shown under their dashboard on MY WEDDING. It's filled in automatically from their enquiries; couples set a status and notes. Every permission is **Admin**.

| Fields | Type |
|---|---|
| `enquiredAt`, `addedAt`, `updatedAt` | Date and time |

Everything else is **Text**:
- `ownerId` is the couple's member ID.
- `itemType` is `venue` or `talent`, and `itemId` is that listing's ID.
- `status` is `considering`, `favourite`, `booked` or `notForUs`.
- `title`, `category`, `city`, `image` and `link` are a saved copy of the listing.

**`RequestDirectory` and `TalentEnquiries` also have a `memberId` field** (Text): the member who sent the enquiry, when they were logged in. This is how enquiries reach the right shortlist, even if a couple typed a different email into the form.

## Venues (vendors)

**Venues:**

| Fields | Type |
|---|---|
| `distanceFrom7thCircleKm`, `minimumGuests`, `maximumGuests`, `startingPrice`, `pricePerGuestJod`, `pricePerPackageJod`, `depositToHoldVenueJod`, `rating`, `reviewCount` | Number |
| `venueTypes`, `eventTypesSupported`, `amenities`, `popularMonths` | Tags |
| `visibility`, `venueClaimed` | Boolean |
| `image` | Image |
| `galleryImagesCount` | Media gallery |
| `approvedAt` | Date and time |
| `websiteUrl`, `videoUrl` | URL |
| `reference` | **Ref → VendorProfiles** |

Also:
- `showPhone`, `showLandline`, `showEmail`, `showAddress`, `showPricing` and `showVendorProfile` are **Text**, holding `Yes` or `No`.
- `approved` is **Text**: `approved` means live, `rejected` means taken down by an admin.

**VendorProfiles:**

| Fields | Type |
|---|---|
| `image` | Image |
| `venues` | **Multi-ref → Venues** |
| `showImage`, `showPhone`, `showEmail` | Boolean |

Rows are matched to vendors by `email`, which must be their login email.

`showImage`, `showPhone` and `showEmail` control the contact card on the vendor's venue pages; the vendor sets them on their dashboard (Account tab). Empty means shown. The name always shows.

**Catering:**

| Fields | Type |
|---|---|
| `price` | Number |
| `image` | Image |
| `visibility` | Boolean |
| `owner` | **Ref → VendorProfiles** |
| `venue` | **Multi-ref → Venues** |

**Packages:**

| Fields | Type |
|---|---|
| `price`, `guestCountMin`, `guestCountMax` | Number |
| `validUntilDate` | Date |
| `visibility` | Boolean |
| `owner` | **Ref → VendorProfiles** |
| `venue` | **Multi-ref → Venues** |
| `cateringOptions` | **Multi-ref → Catering** |

**Promotions:**

| Fields | Type |
|---|---|
| `discountValue` | Number |
| `validDateRangeStart`, `validDateRangeEnd` | Date |
| `visibility` | Boolean |
| `owner` | **Ref → VendorProfiles** |
| `venue` | **Multi-ref → Venues** |
| `applicablePackages` | **Multi-ref → Packages** |

**RequestDirectory** (venue enquiries):

| Fields | Type |
|---|---|
| `numberOfGuests` | Number |
| `suitableDates` | Array |
| `submittedAt` | Date and time |
| `emailSent` | Boolean |

`status` is **Text**, holding `new`, `contacted`, `booked` or `declined`. The vendor sets it on their dashboard.

## Talent (photographers, DJs, singers, planners and the rest)

**Talent:**

| Fields | Type |
|---|---|
| `priceFrom`, `priceTo`, `depositPercent`, `yearsExperience`, `eventsCompleted`, `rating`, `reviewCount` | Number |
| `serviceAreas`, `languages` | Tags |
| `willTravel`, `showPhone`, `visibility`, `featured` | Boolean |
| `heroImage` | Image |
| `portfolio` | Media gallery |
| `website`, `videoUrl` | URL |
| `submittedAt`, `approvedAt` | Date and time |
| `owner` | **Ref → TalentProfiles** |

`approvalStatus` is **Text**: `approved` means live, `rejected` means taken down.

**TalentProfiles:**

| Fields | Type |
|---|---|
| `approved`, `suspended` | Boolean |

Rows are matched by `loginEmail`, which must be their login email.

**TalentCategories:**

| Fields | Type |
|---|---|
| `active` | Boolean |
| `sortOrder` | Number |

The 12 example categories are real wedding categories, so you can keep them.

**TalentEnquiries:**

| Fields | Type |
|---|---|
| `eventDate` | Date |
| `submittedAt` | Date and time |
| `guestCount`, `budget` | Number |
| `emailSent` | Boolean |

## Linking the examples

The example rows aren't linked to each other, because IDs only exist after import. To test the venue and talent pages with them:

1. **Venues → `reference`:** pick "Rose Garden Events".
2. **Catering, Packages and Promotions:** set `owner` to "Rose Garden Events" and `venue` to "Rose Garden Hall".
3. **Talent → `owner`:** pick the matching TalentProfiles row.

Easier still: sign up as a vendor or talent, and add listings through the site's forms. Those link everything automatically.

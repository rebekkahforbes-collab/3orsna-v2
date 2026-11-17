/* backend/events.js
   The old wixMembers_onMemberCreated hook created a VendorProfiles row for
   EVERY new member — couples and talent included. Vendor rows are now created
   at sign-up, only for vendors (backend/accounts.web.js). Nothing else runs here. */

# Sample data

Test listings to see the site working. Every contact uses `@example.com` and `+962 79 000 0xxx`, and each profile's notes say "Sample data — delete before launch", so they are easy to find and remove.

- `Venues-sample.csv` → **Venues** (10 venues, all live, no owner — they show as "waiting to be claimed" in the Admin Dashboard)
- `TalentProfiles-sample.csv` → **TalentProfiles** (14 owners). Import **first**, mapping `_id` to **ID**.
- `Talent-sample.csv` → **Talent** (14 listings, one per category plus two photographers; `owner` holds the profile IDs above). Import **second**, then check the Owner column shows names.

Photos are left empty — add cover photos in the CMS after importing.

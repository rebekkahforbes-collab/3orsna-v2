# 3orsna — handover

- `00-START-HERE.md` — setup, page table, WhatsApp, test run
- `PROJECT-OVERVIEW.md` — how the build works (read before changing anything)
- `CHANGELOG.md` — what changed, and what still has to be done on the site
- `databases/` — one CSV per collection, plus `DATABASES.md` (field types and permissions)

Code lives in `src/` (synced to Wix through GitHub). The iframes live in the separate public repository **3orsna-iframes**, published with GitHub Pages.

## How updates work
1. Copy the update's `3orsna-site` folder over this repository, then commit and push. Wix pulls the backend, public and page code.
2. Copy the update's `3orsna-iframes` folder over that repository, then commit and push. The iframes update on their own.
3. Add any new CMS fields listed at the top of the update (the only manual step), then publish the site.

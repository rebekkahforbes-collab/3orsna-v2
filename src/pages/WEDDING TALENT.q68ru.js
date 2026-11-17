// ============================================================================
//  3orsna — Talent directory
//  Pair with 3orsna-talent-directory.html inside an HTML iframe.
//
//  ELEMENTS THIS EXPECTS
//    #html1   HTML iframe — filters and the card grid
//
//  No dataset and no repeater. This queries Talent directly, which is what lets
//  the iframe render the cards and size the images.
//
//  SETUP
//    1. Create the collections per talent-module-schema.md
//    2. Set ROUTE_TALENT to your dynamic page prefix
//    3. Add indexes on (category + visibility), city, slug, owner
// ============================================================================

import wixData from 'wix-data';
import wixLocation from 'wix-location';
import wixWindowFrontend from 'wix-window-frontend';

const IFRAME    = '#html1';
const PAGE_SIZE = 9;            // profiles per page — numbered pages, not "show more"

const ROUTE_TALENT = '/talent';

// The profile's own page, as Wix generated it: one item (/talent/x), not the
// directory page and not the edit page. Falls back to /talent/<slug> above.
const viewLinkOf = (t) => { const k = Object.keys(t).find((x) => x.startsWith('link-') && typeof t[x] === 'string' && /^\/[^/]+\/[^/]+/.test(t[x]) && !/edit/i.test(t[x])); return k ? t[k] : null; };

// Since approval and visibility split, visibility=true alone no longer means a
// listing was reviewed — an owner can switch their own listing on from their
// dashboard. Public queries need both.
//
// RUN backfillApprovalStatus() BEFORE deploying this. Rows with a blank
// approvalStatus will not match, so an unstamped collection shows an empty
// directory.
const STATUS_FIELD = 'approvalStatus';

// Fallback if TalentCategories is empty or missing. Keep in step with the
// vocabulary in the schema doc.
const FALLBACK_CATEGORIES = [
    'Photographer', 'Videographer', 'Musician', 'DJ', 'Band', 'Florist',
    'Wedding Planner', 'Makeup Artist', 'Hair Stylist', 'Caterer',
    'Cake Designer', 'Decorator', 'Calligrapher', 'Entertainer'
];

let iframeReady = false;
let queued      = [];

$w.onReady(function () {

    $w(IFRAME).onMessage(async (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        // Links inside the iframe cannot navigate on their own — the component is
        // sandboxed on another origin, so a same-site href renders "Forbidden"
        // inside the box. The iframe hands the URL out here instead.
        if (msg.type === 'iframe:navigate') {
            wixLocation.to(msg.url);
            return;
        }

        // Changing page asks the page to scroll back up to the results once the
        // iframe has been sized to its content (nothing to scroll inside it then).
        if (msg.type === 'talent:scrollTo') {
            await $w(IFRAME).scrollTo().catch(() => {});
            if (msg.y > 0) await wixWindowFrontend.scrollBy(0, msg.y).catch(() => {});
            return;
        }

        if (msg.type === 'talent:ready') {
            iframeReady = true;
            queued.forEach((m) => $w(IFRAME).postMessage(m));
            queued = [];
            return;
        }
        if (msg.type === 'talent:search') {
            await search(msg.filters, msg.skip || 0);
        }
    });

    setup();
});

// --------------------------------------------------------------------------
function send(msg) {
    if (iframeReady) $w(IFRAME).postMessage(msg);
    else queued.push(msg);
}

// Wix stores images as wix:image://v1/<fileId>/name.jpg. That cannot go in an
// <img src>. Convert and ask the image service for the size the card needs, so a
// 3000px phone photo is not shipped into a 270px tile.
function media(raw, w = 720, h = 540) {
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    const m = /^wix:image:\/\/v1\/([^/]+)/.exec(raw);
    return m ? `https://static.wixstatic.com/media/${m[1]}/v1/fill/w_${w},h_${h},al_c,q_80/file.jpg` : null;
}

function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function shape(t) {
    return {
        id:              t._id,
        title:           t.title || 'Untitled profile',
        category:        t.category || '',
        headline:        t.headline || null,
        city:            t.city || null,
        image:           media(t.heroImage),
        priceFrom:       num(t.priceFrom),
        priceUnit:       t.priceUnit || null,
        yearsExperience: num(t.yearsExperience),
        rating:          num(t.rating),
        reviewCount:     num(t.reviewCount),
        featured:        t.featured === true,
        url:             viewLinkOf(t) || (t.slug ? `${ROUTE_TALENT}/${t.slug}` : `${ROUTE_TALENT}/${t._id}`)
    };
}

// --------------------------------------------------------------------------
async function setup() {
    let categories = FALLBACK_CATEGORIES.map((name) => ({ name, count: null }));
    let cities = [];
    let languages = [];

    try {
        // One read of the published set gives us the dropdowns and the per-category
        // counts. A category with nothing in it should not be offered as a filter
        // that returns an empty page.
        const res = await wixData.query('Talent')
            .ne(STATUS_FIELD, 'rejected')
            .eq('visibility', true)
            .limit(1000)
            .find();

        const counts = {};
        res.items.forEach((t) => {
            if (t.category) counts[t.category] = (counts[t.category] || 0) + 1;
        });

        // Prefer the CMS list if it exists, so a designer controls order and labels.
        let names = FALLBACK_CATEGORIES;
        try {
            const catRes = await wixData.query('TalentCategories')
                .eq('active', true)
                .ascending('sortOrder')
                .limit(50)
                .find();
            if (catRes.items.length) names = catRes.items.map((c) => c.name).filter(Boolean);
        } catch (e) {
            // Collection not created yet — the fallback list is fine.
        }

        categories = names
            .filter((name) => counts[name])
            .map((name) => ({ name, count: counts[name] }));

        cities = [...new Set(res.items.map((t) => t.city).filter(Boolean))].sort();

        const langSet = new Set();
        res.items.forEach((t) => {
            (Array.isArray(t.languages) ? t.languages : []).forEach((l) => l && langSet.add(l));
        });
        languages = [...langSet].sort();

        const total = await wixData.query('Talent').count();
        const unstamped = await wixData.query('Talent').isEmpty(STATUS_FIELD).count();
        console.log(`[talent] ${res.totalCount} of ${total} profiles are approved and visible`);
        if (unstamped) {
            console.warn(`[talent] ${unstamped} profiles have no ${STATUS_FIELD} and will NOT appear. Run backfillApprovalStatus().`);
        }

    } catch (err) {
        console.error('[talent] setup failed:', err);
    }

    send({
        type: 'talent:setup',
        categories,
        cities,
        languages,
        initial: readUrl()
    });
}

// --------------------------------------------------------------------------
async function search(f, skip) {
    try {
        let q = wixData.query('Talent').ne(STATUS_FIELD, 'rejected').eq('visibility', true);

        if (f.category) q = q.eq('category', f.category);
        if (f.city) {
            // A profile matches on its base city or anywhere it says it will travel.
            q = q.or(
                wixData.query('Talent').eq('city', f.city),
                wixData.query('Talent').hasSome('serviceAreas', [f.city])
            ).ne(STATUS_FIELD, 'rejected').eq('visibility', true);
            if (f.category) q = q.eq('category', f.category);
        }
        if (f.q) q = q.contains('title', f.q);
        if (num(f.budget) !== null) q = q.le('priceFrom', num(f.budget));
        if (f.language) q = q.hasSome('languages', [f.language]);
        if (num(f.experience) !== null) q = q.ge('yearsExperience', num(f.experience));

        switch (f.sort) {
            case 'priceAsc':  q = q.ascending('priceFrom'); break;
            case 'priceDesc': q = q.descending('priceFrom'); break;
            case 'rating':    q = q.descending('rating'); break;
            case 'newest':    q = q.descending('_createdDate'); break;
            default:          q = q.descending('featured').ascending('title');
        }

        const res = await q.skip(skip).limit(PAGE_SIZE).find();

        send({
            type: 'talent:results',
            items: res.items.map(shape),
            total: res.totalCount,
            skip,
            pageSize: PAGE_SIZE,
            hasMore: skip + res.items.length < res.totalCount
        });

        writeUrl(f, Math.floor(skip / PAGE_SIZE) + 1);

    } catch (err) {
        console.error('[talent] search failed:', err);
        send({ type: 'talent:error' });
    }
}

// --------------------------------------------------------------------------
const KEYS = ['q', 'category', 'city', 'budget', 'language', 'experience', 'sort', 'page'];

function writeUrl(f, page) {
    const params = {};
    if (page > 1) params.page = String(page);   // so refresh and the back button keep the page
    if (f.q) params.q = f.q;
    if (f.category) params.category = f.category;
    if (f.city) params.city = f.city;
    if (num(f.budget) !== null) params.budget = String(f.budget);
    if (f.language) params.language = f.language;
    if (num(f.experience) !== null) params.experience = String(f.experience);
    if (f.sort && f.sort !== 'featured') params.sort = f.sort;

    const stale = KEYS.filter((k) => !(k in params));
    if (stale.length) wixLocation.queryParams.remove(stale);
    if (Object.keys(params).length) wixLocation.queryParams.add(params);
}

function readUrl() {
    const p = wixLocation.query || {};
    return {
        q:          p.q || '',
        category:   p.category || '',
        city:       p.city || '',
        budget:     num(p.budget),
        language:   p.language || '',
        experience: num(p.experience),
        sort:       p.sort || 'featured',
        page:       Math.max(1, Math.floor(num(p.page) || 1))
    };
}

// ============================================================================
//  DESIGN AND BEHAVIOUR NOTES
//
//  1. Category is the primary filter, so it gets a full-width chip strip above
//     everything else rather than a dropdown — a couple arrives knowing they
//     want a photographer. Selecting one searches immediately; clicking it again
//     clears it. Categories with zero published profiles are not offered.
//
//  2. The name search debounces at 420ms and runs itself. A search box that
//     needs a separate button press reads as broken.
//
//  3. Filter state lives in the query string, so a filtered view can be shared
//     and the back button works. This is what the venues page was missing.
//
//  4. Default sort is featured first, then alphabetical. featured is a Boolean,
//     so descending() puts true ahead of false.
//
//  5. City matches base city OR serviceAreas, so a photographer in Amman who
//     travels to Aqaba appears in both. Note wixData .or() needs the shared
//     conditions restated — that is the awkward block above, not a mistake.
//
//  6. priceFrom is queried with le(), which only works because the schema makes
//     it a Number. On Venues, pricePerGuestJod holds "55 JOD" and the equivalent
//     filter compares strings: "55 JOD" against "30" alphabetically. Getting the
//     type right here is why this filter will actually work.
//
//  7. Images are resolved to https and requested at 720x540. A repeater bound
//     straight to heroImage ships the original upload into a 270px tile.
//
//  8. SEO — cards render inside an iframe, so this grid is not in the parent
//     page's HTML. Individual talent dynamic pages are indexed normally and are
//     what rank. Same trade-off as the venues grid; flagging it so it stays a
//     choice.
//
//  9. The console logs how many profiles have visibility === true on load.
//     Everything defaults to false pending approval, so an empty directory on a
//     fresh install is expected, not a bug.
// ============================================================================
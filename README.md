# RG-RNS — Redgate Release-Notes Feature Tracker

Automated, daily-refreshed feature overviews for **Redgate Monitor**, **Redgate Flyway**
and **Redgate Test Data Manager**, built from each product's public release notes.

Each product gets a self-contained, shareable HTML page, plus a combined page with one
tab per product. Data is stored as plain JSON in [`data/`](data/) and curated through pull
requests (the "hybrid" model — scrape automatically, review before publishing).

```
 release-notes pages ──▶ daily scrape ──▶ data/<product>.json ──▶ build ──▶ site/*.html ──▶ GitHub Pages
 (red-gate.com docs)     (GitHub Action)   (curated via PR)        (Node)    (self-contained)
```

---

## What gets produced

| File | Contents |
|------|----------|
| `site/monitor.html` | Redgate Monitor — standalone, self-contained |
| `site/flyway.html` | Redgate Flyway — standalone, self-contained |
| `site/test-data-manager.html` | Redgate Test Data Manager — standalone, self-contained |
| `site/all-products.html` | All three, as tabs |
| `site/index.html` | Redirect to `all-products.html` (GitHub Pages landing) |

Every page is **fully self-contained** — the data is inlined, so you can email a file or
open it with a double-click; no server or network needed.

### Live pages

Published via GitHub Pages at:

- All products: **https://thatinfradba.github.io/RGRNS/all-products.html**
- Monitor: **https://thatinfradba.github.io/RGRNS/monitor.html**
- Flyway: **https://thatinfradba.github.io/RGRNS/flyway.html**
- Test Data Manager: **https://thatinfradba.github.io/RGRNS/test-data-manager.html**

### Filters per page

The **version filter** (select versions include/exclude, and an *upgrade path* from→to) and
**search** + **column sorting** are available on every product. Product-specific filters:

| Product | Specialist filters |
|---------|--------------------|
| Monitor | **Platform** (SQL Server, PostgreSQL, Oracle, … — multi-select OR) · **Edition** (Enterprise / Preview) |
| Flyway | **Tier** (Community / Teams / Enterprise) · **Type** (Feature / Change / Improvement) |
| Test Data Manager | **Component** (TDM GUI / Anonymize / Subsetter / Workflow Engine) · **Type** |

A filter only appears when the data actually contains values for it (so empty facets stay
hidden until they're curated).

---

## Repository layout

```
data/                     curated JSON, one file per product (the source of truth)
  monitor.json
  flyway.json
  tdm.json
scripts/
  lib/
    products.js           ← central config: URLs, parse rules, filters, recency windows
    parse.js              HTML → versions + raw entries (cheerio)
    merge.js              hybrid merge: preserve curation, flag new entries
    fetch.js              HTTP fetch helper
  scrape.js               CLI: node scripts/scrape.js <monitor|flyway|tdm>
  seed-monitor.js         one-off: import the original hand-built Monitor HTML
  build.js                JSON → self-contained HTML pages
site/                     generated HTML (published to Pages)
.github/workflows/        daily scrape pipelines + build/deploy
```

**`scripts/lib/products.js` is the file you'll edit most** — add a product, change which
release-note sections are captured, adjust filters, or change a recency window there.

---

## The data model

Each `data/<product>.json` looks like:

```jsonc
{
  "product": "monitor",
  "productName": "Redgate Monitor",
  "source": "https://documentation.red-gate.com/monitor/...release-notes...",
  "generated": "2026-06-26",          // bumped only when content changes
  "versions": [                        // every release (even ones with no features)
    { "version": "14.22.0", "date": "2026-06-25", "dateDisplay": "25 Jun 2026", "link": "…#anchor" }
  ],
  "entries": [
    {
      "id": "14.20.0::sql-agent-job-monitoring-…",   // stable: version + slug(text)
      "version": "14.20.0",
      "date": "2026-06-10",
      "dateDisplay": "10 Jun 2026",
      "category": "feature",                          // feature|improvement|change|fix|important
      "text": "SQL Agent job monitoring is now available for …",
      "link": "https://…#version-14-20-0",
      "status": "curated",                            // curated | needs-review
      "platforms": ["sqlserver"],                     // product-specific tag (Monitor)
      "edition": ""                                   // product-specific tag (Monitor: ''|enterprise|preview)
    }
  ]
}
```

Product-specific tag fields: Monitor `platforms` (array) + `edition`; Flyway `edition` (the
tier); TDM `components` (array). `category` is shared.

---

## The review (curation) flow

This is the "scrape + flag for review" model you chose:

1. **Daily**, each product's workflow scrapes its release-notes page.
2. Genuinely new items are added to `data/<product>.json` with `"status": "needs-review"`
   and empty/best-effort tags. Already-curated versions are never touched (a published
   version's notes don't change), so curation is never overwritten.
3. If anything changed, the workflow opens (or updates) a **pull request** with a curation
   checklist.
4. You review the PR: tidy wording, fill the product-specific tags, and flip
   `"status"` to `"curated"` (delete anything that's just noise).
5. Merging to `main` triggers **Build & deploy**, which regenerates the HTML and publishes
   to GitHub Pages.

Pages show a small "⚠ N entries awaiting review" banner and a `Review` badge on any
`needs-review` rows, so un-curated data is always visibly marked.

> **Hand-adding entries is fine too.** TDM's public release notes are mostly component-version
> tables with few itemised changes, so its page is mainly a version timeline. To enrich it,
> add entries to `data/tdm.json` by hand with `"status": "curated"`.

---

## Local development

```bash
npm install                       # one-time

npm run scrape:monitor            # scrape one product into data/monitor.json
npm run scrape:flyway
npm run scrape:tdm

npm run build                     # regenerate site/*.html from data/*.json
```

Then open `site/all-products.html` (or any per-product file) in a browser.

Useful env vars for `scrape.js`:

| Var | Effect |
|-----|--------|
| `RNS_FIXTURE=path` | Parse a local HTML file instead of fetching (offline testing) |
| `RNS_SINCE_MONTHS=N` | Override the recency window for this run |
| `RNS_GENERATED=YYYY-MM-DD` | Override the "generated" stamp |

### Re-seeding Monitor (rarely needed)

`data/monitor.json` was seeded once from the original hand-built page so all the existing
platform/edition curation is preserved. To re-import it:

```bash
node scripts/seed-monitor.js "path/to/rgm-features-v12.0-v14.21.html"
```

---

## Tuning (in `scripts/lib/products.js`)

- **Which sections become entries** — each product's `capture: [...]`. Monitor is
  intentionally *features only*; add `"improvement"` etc. to widen it.
- **How far back to scrape** — `sinceMonths` (Flyway defaults to 12 because its engine log
  goes back to 2010; Monitor/TDM are unbounded). Dropped counts are always logged, never
  silent. Existing curated history is preserved regardless of this window.
- **Filters / colours** — the `facets` array and the style maps at the top of the file.
- **A new product** — add an entry to `PRODUCTS` (source URL, `versionHeading` regex, date
  format is auto-detected, `capture`, `facets`) and a `scrape-<key>.yml` workflow. No code
  changes needed in `parse.js` / `build.js`.

---

## Notes & limitations

- Parsing relies on the docs pages' heading structure (`<h2>` version + `<h3>` section). If
  Redgate restructures a page, update that product's `versionHeading` regex / section names.
- Flyway scrapes the **Flyway Engine** release notes (the CLI/engine changelog). Flyway
  Desktop has its own per-version pages — add them as a separate product/source if wanted.
- Auto-derived tags (Flyway tier, TDM component) are best-effort guesses and are always left
  as `needs-review` for confirmation.

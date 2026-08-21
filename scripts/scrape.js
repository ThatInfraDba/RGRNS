"use strict";

/**
 * Scrape one product's release notes and merge into data/<product>.json.
 *
 *   node scripts/scrape.js <monitor|flyway>
 *
 * Options (env):
 *   RNS_FIXTURE=<path>   parse a local HTML file instead of fetching (testing/CI offline)
 *   RNS_GENERATED=<date> override the "generated" stamp (defaults to today, UTC)
 *
 * Exit code is always 0 on success. The number of newly-flagged entries is written
 * to stdout and, when running in GitHub Actions, to the step output `added`.
 */

const fs = require("fs");
const path = require("path");
const { PRODUCTS } = require("./lib/products");
const { parseReleaseNotes } = require("./lib/parse");
const { mergeProduct } = require("./lib/merge");
const { fetchText } = require("./lib/fetch");

const DATA_DIR = path.join(__dirname, "..", "data");

async function main() {
  const key = (process.argv[2] || "").toLowerCase();
  const product = PRODUCTS[key];
  if (!product) {
    console.error(`Unknown product "${key}". Expected one of: ${Object.keys(PRODUCTS).join(", ")}`);
    process.exit(1);
  }

  const generated = process.env.RNS_GENERATED || new Date().toISOString().slice(0, 10);

  let html;
  if (process.env.RNS_FIXTURE) {
    html = fs.readFileSync(process.env.RNS_FIXTURE, "utf8");
    console.log(`[${key}] parsing fixture ${process.env.RNS_FIXTURE}`);
  } else {
    console.log(`[${key}] fetching ${product.source}`);
    html = await fetchText(product.source);
  }

  const scraped = parseReleaseNotes(html, product);
  console.log(`[${key}] parsed ${scraped.versions.length} versions, ${scraped.entries.length} captured items`);

  // Apply the recency window (if any) to *newly scraped* data. Existing curated
  // entries/versions are preserved by the merge regardless of this cutoff.
  const sinceMonths = process.env.RNS_SINCE_MONTHS
    ? Number(process.env.RNS_SINCE_MONTHS)
    : product.sinceMonths;
  if (sinceMonths) {
    const cut = new Date();
    cut.setMonth(cut.getMonth() - sinceMonths);
    const cutoff = cut.toISOString().slice(0, 10);
    const vBefore = scraped.versions.length;
    const eBefore = scraped.entries.length;
    scraped.versions = scraped.versions.filter((v) => !v.date || v.date >= cutoff);
    scraped.entries = scraped.entries.filter((e) => !e.date || e.date >= cutoff);
    console.log(
      `[${key}] recency window ${sinceMonths}mo (>= ${cutoff}): kept ` +
        `${scraped.versions.length}/${vBefore} versions, ${scraped.entries.length}/${eBefore} items ` +
        `(dropped ${eBefore - scraped.entries.length} older items)`
    );
  }

  const dataFile = path.join(DATA_DIR, `${key}.json`);
  const existing = fs.existsSync(dataFile)
    ? JSON.parse(fs.readFileSync(dataFile, "utf8"))
    : { versions: [], entries: [] };

  const { data, added } = mergeProduct(existing, scraped, product, generated);

  // Change detection: compare only the content (versions + entries), so a no-op
  // daily run produces no diff and therefore no pull request.
  const prevContent = JSON.stringify({ versions: existing.versions || [], entries: existing.entries || [] });
  const newContent = JSON.stringify({ versions: data.versions, entries: data.entries });
  const changed = prevContent !== newContent;
  data.generated = changed ? generated : existing.generated || generated;

  const rel = path.relative(path.join(__dirname, ".."), dataFile);
  if (changed || !fs.existsSync(dataFile)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  const needsReview = data.entries.filter((e) => e.status === "needs-review").length;
  console.log(
    `[${key}] ${changed ? "updated" : "no change to"} ${rel} — ` +
      `${data.entries.length} entries (${added} new, ${needsReview} awaiting review)`
  );

  // GitHub Actions step outputs
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `added=${added}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `needs_review=${needsReview}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed ? "true" : "false"}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

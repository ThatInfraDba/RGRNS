"use strict";

const { slug } = require("./parse");

/**
 * Stable identity for an entry: version + a slug of its text. This lets a daily
 * re-scrape recognise entries it has already seen (so curation is never lost)
 * and detect genuinely new ones.
 */
function entryId(version, text) {
  return `${version}::${slug(text)}`;
}

/**
 * The curated/facet fields a freshly-scraped entry starts with. Empty values are
 * intentional — the hybrid model flags these for human review (a PR), where the
 * platform/edition/component tags are filled in.
 */
function blankFacetFields(product, rawText) {
  const fields = {};
  for (const f of product.facets) {
    if (f.type === "multi") fields[f.field] = fields[f.field] || [];
    else if (f.field !== "category") fields[f.field] = fields[f.field] || "";
  }
  // Best-effort auto-derivation (still flagged needs-review for confirmation).
  if (typeof product.deriveEdition === "function" && "edition" in fields) {
    fields.edition = product.deriveEdition(rawText) || "";
  }
  if (typeof product.deriveComponents === "function" && "components" in fields) {
    fields.components = product.deriveComponents(rawText);
  }
  return fields;
}

/**
 * Merge freshly-scraped data into the existing curated dataset (hybrid model).
 *
 *  - Existing entries are preserved verbatim (curation is never overwritten).
 *  - Entries seen for the first time are added with status "needs-review".
 *  - Entries no longer present on the page are kept (older releases roll off the
 *    live page but should remain in the dataset).
 *  - The version list is unioned; scraped dates/links refresh existing rows.
 *
 * Returns { data, added } where `added` is the count of new needs-review entries.
 */
function mergeProduct(existing, scraped, product, generatedDate) {
  const data = {
    product: product.key,
    productName: product.name,
    source: product.source,
    // Preserved here; scrape.js bumps it to today only when content actually changes.
    generated: existing.generated || generatedDate,
    versions: [],
    entries: [],
  };

  // ── Versions: union, scrape is source of truth for date/link ──
  const versionMap = new Map();
  for (const v of existing.versions || []) versionMap.set(v.version, { ...v });
  for (const v of scraped.versions || []) {
    const prev = versionMap.get(v.version) || {};
    versionMap.set(v.version, { ...prev, ...v });
  }
  data.versions = [...versionMap.values()].sort(cmpVersionDesc);

  // ── Entries: preserve existing, add new ──
  const byId = new Map();
  const curatedVersions = new Set();
  for (const e of existing.entries || []) {
    const id = e.id || entryId(e.version, e.text);
    byId.set(id, { ...e, id });
    if (e.status === "curated") curatedVersions.add(e.version);
  }

  // A published version's release notes never change after the fact. So if a
  // version has already been hand-curated, don't re-ingest raw items for it — this
  // is what stops the scraper duplicating curated entries whose wording was rewritten.
  let added = 0;
  for (const raw of scraped.entries || []) {
    const id = entryId(raw.version, raw.text);
    if (byId.has(id)) continue; // already known — keep curated version
    if (curatedVersions.has(raw.version)) continue; // version already curated by hand
    byId.set(id, {
      id,
      version: raw.version,
      date: raw.date,
      dateDisplay: raw.dateDisplay,
      category: raw.category,
      text: raw.text,
      link: raw.link,
      status: product.autoCurate ? "curated" : "needs-review",
      ...blankFacetFields(product, raw.text),
    });
    added++;
  }

  data.entries = [...byId.values()].sort((a, b) => {
    const c = cmpVersionDesc({ version: a.version }, { version: b.version });
    if (c !== 0) return c;
    return (a.text || "").localeCompare(b.text || "");
  });

  return { data, added };
}

function parseVersion(v) {
  return String(v).split(".").map(Number).reduce((acc, n) => acc * 1000 + (n || 0), 0);
}
function cmpVersionDesc(a, b) {
  return parseVersion(b.version) - parseVersion(a.version);
}

module.exports = { mergeProduct, entryId, parseVersion, cmpVersionDesc };

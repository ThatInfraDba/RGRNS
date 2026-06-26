"use strict";

const cheerio = require("cheerio");
const { SECTION_CATEGORY } = require("./products");

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Parse a date string in any of the formats the Redgate docs use:
 *   "June 10, 2026"   (Monitor)
 *   "2026-06-18"      (Flyway)
 *   "25 June 2026"    (Test Data Manager)
 * Returns { iso: "YYYY-MM-DD", display: "DD Mon YYYY" } or null if unparseable.
 */
function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");

  // ISO: 2026-06-18
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return fmt(+m[1], +m[2] - 1, +m[3]);

  // "Month D, YYYY"  e.g. June 10, 2026
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && m[1].toLowerCase() in MONTHS) return fmt(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);

  // "D Month YYYY"  e.g. 25 June 2026
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (m && m[2].toLowerCase() in MONTHS) return fmt(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);

  return null;

  function fmt(y, monthIdx, d) {
    const iso = `${y}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const display = `${String(d).padStart(2, "0")} ${MON_SHORT[monthIdx]} ${y}`;
    return { iso, display };
  }
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normHeading(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse a release-notes HTML document into versions + raw entries.
 *
 * Walks h2/h3/h4 and ul elements in document order:
 *   - an <h2> matching the product's versionHeading regex starts a new version
 *   - a following <h3>/<h4> sets the current category (via SECTION_CATEGORY)
 *   - <ul> items under a captured category become entries
 *
 * Returns { versions: [...], entries: [...] } where entries carry only the raw,
 * un-curated fields (version, date, category, text, link). Curated/facet fields
 * are added later by the merge step.
 */
function parseReleaseNotes(html, product) {
  const $ = cheerio.load(html);
  const captureSet = new Set(product.capture);

  const versions = [];
  const entries = [];
  let current = null;       // { version, iso, display, id }
  let currentCategory = null;

  $("h2, h3, h4, ul").each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : el.name;

    if (tag === "h2") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const m = text.match(product.versionHeading);
      if (m) {
        const version = m[1];
        const date = parseDate(m[2]);
        const id = $(el).attr("id") || "";
        current = {
          version,
          iso: date ? date.iso : "",
          display: date ? date.display : (m[2] || "").trim(),
          id,
        };
        currentCategory = null;
        if (!versions.some((v) => v.version === version)) {
          versions.push({
            version,
            date: current.iso,
            dateDisplay: current.display,
            link: id ? `${product.source}#${id}` : product.source,
          });
        }
      } else {
        // A non-version <h2> (e.g. a standalone "Important" notice) ends the
        // current version so its items are not mis-attributed.
        current = null;
        currentCategory = null;
      }
      return;
    }

    if (tag === "h3" || tag === "h4") {
      if (!current) return;
      const cat = SECTION_CATEGORY[normHeading($(el).text())];
      currentCategory = cat || null;
      return;
    }

    // ul
    if (!current || !currentCategory || !captureSet.has(currentCategory)) return;
    // Skip nested lists — their text is already included in the parent <li>.
    if ($(el).parents("li").length > 0) return;

    $(el).children("li").each((__, li) => {
      const text = $(li).text().replace(/\s+/g, " ").trim();
      if (!text) return;
      entries.push({
        version: current.version,
        date: current.iso,
        dateDisplay: current.display,
        category: currentCategory,
        text,
        link: current.id ? `${product.source}#${current.id}` : product.source,
      });
    });
  });

  return { versions, entries };
}

module.exports = { parseReleaseNotes, parseDate, slug, normHeading };

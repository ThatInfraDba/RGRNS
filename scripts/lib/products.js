"use strict";

/**
 * Central product configuration.
 *
 * Each product declares:
 *  - how to find its release-notes content (source URL)
 *  - how to recognise a version heading and parse its date
 *  - which release-note sections to capture, and how their headings map to a category
 *  - which product-specific filter "facets" the HTML should offer
 *
 * The scraper (scripts/scrape.js) and the HTML builder (scripts/build.js) are both
 * fully driven by this file — adding/adjusting a product is a config change, not a
 * code change.
 */

// ── Shared style maps ────────────────────────────────────────────────────────

// Category badge colours (used by Flyway category facet + badges).
const CATEGORY_STYLES = {
  feature:     { label: "Feature",     bg: "#DCFCE7", color: "#14532D" },
  improvement: { label: "Improvement", bg: "#DBEAFE", color: "#1E40AF" },
  change:      { label: "Change",      bg: "#EDE9FE", color: "#5B21B6" },
  fix:         { label: "Fix",         bg: "#FEE2E2", color: "#991B1B" },
  important:   { label: "Important",   bg: "#FEF3C7", color: "#92400E" },
  other:       { label: "Other",       bg: "#F3F4F6", color: "#374151" },
};

// Redgate Monitor — DBMS platforms (carried over from the original hand-built page).
const MONITOR_PLATFORMS = {
  sqlserver:  { label: "SQL Server",     bg: "#DBEAFE", color: "#1E3A8A" },
  postgresql: { label: "PostgreSQL",     bg: "#EDE9FE", color: "#4C1D95" },
  oracle:     { label: "Oracle",         bg: "#FEE2E2", color: "#991B1B" },
  mysql:      { label: "MySQL",          bg: "#D1FAE5", color: "#065F46" },
  mongodb:    { label: "MongoDB",        bg: "#DCFCE7", color: "#14532D" },
  aurora:     { label: "Aurora",         bg: "#FEF3C7", color: "#78350F" },
  azuresql:   { label: "Azure SQL",      bg: "#BFDBFE", color: "#1E40AF" },
  rds:        { label: "Amazon RDS",     bg: "#FDE68A", color: "#92400E" },
  cloud:      { label: "Cloud / Multi",  bg: "#E9D5FF", color: "#6B21A8" },
  all_db:     { label: "All DBMS",       bg: "#F3F4F6", color: "#374151" },
};

// Redgate Monitor — edition badges.
const MONITOR_EDITIONS = {
  enterprise: { label: "Enterprise", bg: "#FEF3C7", color: "#92400E" },
  preview:    { label: "Preview",    bg: "#DBEAFE", color: "#1E40AF" },
};

// Flyway — licence tiers.
const FLYWAY_TIERS = {
  community:  { label: "Community",  bg: "#F3F4F6", color: "#374151" },
  teams:      { label: "Teams",      bg: "#DBEAFE", color: "#1E40AF" },
  enterprise: { label: "Enterprise", bg: "#FEF3C7", color: "#92400E" },
};

// ── Section heading → category normalisation ─────────────────────────────────
// Headings on the docs pages vary ("Features", "New features", "Bug fixes" …).
// This maps a lower-cased, trimmed heading to a canonical category.
const SECTION_CATEGORY = {
  "features": "feature",
  "new features": "feature",
  "new feature": "feature",
  "improvements": "improvement",
  "improvement": "improvement",
  "enhancements": "improvement",
  "changes": "change",
  "change": "change",
  "fixes": "fix",
  "bug fixes": "fix",
  "bugfixes": "fix",
  "fix": "fix",
  "important": "important",
};

// ── Per-product configuration ────────────────────────────────────────────────

const PRODUCTS = {
  monitor: {
    key: "monitor",
    name: "Redgate Monitor",
    eyebrow: "Release notes overview",
    // Consolidated release-notes page that gains each new release.
    source: "https://documentation.red-gate.com/monitor/redgate-monitor-14-1+-release-notes-317489801.html",
    outFile: "monitor.html",
    // Recency window for *new* scraped data (months). null = no limit. The consolidated
    // page only covers 14.1+, and curated history is preserved by the merge regardless.
    sinceMonths: null,
    // Matches: "Version 14.20.0 - June 10, 2026"
    versionHeading: /^Version\s+(\d+\.\d+(?:\.\d+)?)\s*[-–—]\s*(.+)$/i,
    // Sections whose items we keep as entries. Monitor's overview is intentionally
    // "features only" (matching the original page); add "improvement" here to widen it.
    capture: ["feature"],
    // Facets shown in the filter bar (rendered only when the data contains values).
    facets: [
      { key: "platform", label: "Platform", field: "platforms", type: "multi", styles: MONITOR_PLATFORMS, accent: true },
      { key: "edition",  label: "Edition",  field: "edition",   type: "single", styles: MONITOR_EDITIONS },
    ],
    primaryStat: { label: "Platforms", facet: "platform" },
  },

  flyway: {
    key: "flyway",
    name: "Redgate Flyway Engine",
    eyebrow: "Flyway Engine release notes",
    // The /release-notes-and-older-versions landing page is an index; the actual
    // change log lives on the Flyway Engine page.
    source: "https://documentation.red-gate.com/flyway/release-notes-and-older-versions/release-notes-for-flyway-engine",
    outFile: "flyway.html",
    // Flyway's engine log runs back to 2010 (hundreds of releases). Keep a rolling
    // window so the page and the review queue stay manageable. Set to null for all.
    sinceMonths: 12,
    // Matches: "Flyway 12.9.0 (2026-06-18)"
    versionHeading: /^Flyway\s+(\d+\.\d+(?:\.\d+)?)\s*\(([^)]+)\)\s*$/i,
    capture: ["feature", "improvement", "change"],
    facets: [
      { key: "tier",     label: "Tier",     field: "edition",  type: "single", styles: FLYWAY_TIERS },
      { key: "category", label: "Type",     field: "category", type: "single", styles: CATEGORY_STYLES, accent: true },
    ],
    // Best-effort tier inference from item text during scrape. Tier is rarely
    // called out explicitly in engine changelog bullets, so this almost never
    // fires — there's no meaningful human tagging step to gate on here, unlike
    // Monitor's platform tags. New entries land pre-curated (see autoCurate).
    deriveEdition: (text) => {
      if (/flyway enterprise|enterprise edition/i.test(text)) return "enterprise";
      if (/flyway teams|teams edition/i.test(text)) return "teams";
      return "";
    },
    // Skip the needs-review gate: scraped text comes verbatim from Redgate's own
    // docs (no noise to filter), and there's no facet worth holding for review.
    autoCurate: true,
    primaryStat: { label: "Types", facet: "category" },
  },

  flywaydesktop: {
    key: "flywaydesktop",
    name: "Redgate Flyway Desktop",
    eyebrow: "Flyway Desktop release notes",
    // Flyway Desktop's release notes are split across one page per major version
    // (…/flyway-desktop-9-release-notes, -8-, -7-, …). This tracks the current
    // major series; bump to the next page when Desktop 10 ships.
    source: "https://documentation.red-gate.com/flyway/release-notes-and-older-versions/flyway-desktop-9-release-notes",
    outFile: "flyway-desktop.html",
    // The version-9 page only goes back to Jan 2026 (older majors live on their
    // own pages), so no rolling window is needed.
    sinceMonths: null,
    // Matches: "9.7.2 - 21 August 2026"
    versionHeading: /^(\d+\.\d+(?:\.\d+)?)\s*[-–—]\s*(.+)$/i,
    capture: ["feature", "improvement", "change"],
    facets: [
      { key: "category", label: "Type", field: "category", type: "single", styles: CATEGORY_STYLES, accent: true },
    ],
    // Same reasoning as Flyway Engine: text comes verbatim from Redgate's docs, and
    // entries rarely carry a platform/tier callout worth gating for review.
    autoCurate: true,
    primaryStat: { label: "Types", facet: "category" },
  },
};

module.exports = {
  PRODUCTS,
  SECTION_CATEGORY,
  CATEGORY_STYLES,
  MONITOR_PLATFORMS,
  MONITOR_EDITIONS,
  FLYWAY_TIERS,
};

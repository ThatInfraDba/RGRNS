"use strict";

/**
 * One-off: convert the original hand-built Redgate Monitor HTML page into
 * data/monitor.json so all the curated platform/edition tagging is preserved as
 * the seed. After this, the daily scraper only *adds* newly released features
 * (flagged needs-review) on top of this curated history.
 *
 *   node scripts/seed-monitor.js [path-to-original-html]
 *
 * Re-running is safe: any existing data/monitor.json entries that are NOT in the
 * seed (e.g. later scraped/curated ones) are kept.
 */

const fs = require("fs");
const path = require("path");
const { slug, parseDate } = require("./lib/parse");
const { cmpVersionDesc } = require("./lib/merge");

const DEFAULT_HTML = path.join(
  "C:", "Users", "danny.dehaan", "OneDrive - Redgate", "Documents",
  "Solutions", "Monitor", "rgm-features-v12.0-v14.21.html"
);

function extractLiteral(html, name, open, close) {
  const start = html.indexOf(name);
  if (start === -1) throw new Error(`Could not find ${name} in source HTML`);
  const from = html.indexOf(open, start);
  // find matching close that is followed by ";"
  let depth = 0, i = from;
  for (; i < html.length; i++) {
    if (html[i] === open) depth++;
    else if (html[i] === close) {
      depth--;
      if (depth === 0) break;
    }
  }
  const literal = html.slice(from, i + 1);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${literal});`)();
}

// Replicates the original page's release-notes URL logic so seeded links match.
const RELEASE_NOTE_URLS = {
  "14": "https://documentation.red-gate.com/monitor/redgate-monitor-14-1+-release-notes-317489801.html",
  "14.0": "https://documentation.red-gate.com/monitor/redgate-monitor-14-0-release-notes-240977444.html",
  "13": "https://documentation.red-gate.com/sm13/sql-monitor-13-0-release-notes-199101003.html",
  "12.1": "https://documentation.red-gate.com/sm12/release-notes-and-other-versions/sql-monitor-12-1-release-notes",
  "12.0": "https://documentation.red-gate.com/sm12/release-notes-and-other-versions/sql-monitor-12-0-release-notes",
};
function releaseNotesUrl(v) {
  const parts = v.split(".");
  if (parts[0] === "14" && parts[1] === "0") return RELEASE_NOTE_URLS["14.0"];
  if (parts[0] === "14") return RELEASE_NOTE_URLS["14"];
  if (parts[0] === "13") return RELEASE_NOTE_URLS["13"];
  if (parts[0] === "12" && parts[1] === "1") return RELEASE_NOTE_URLS["12.1"];
  if (parts[0] === "12" && parts[1] === "0") return RELEASE_NOTE_URLS["12.0"];
  return RELEASE_NOTE_URLS["14"];
}
function versionAnchor(v) {
  return "version-" + v.replace(/\./g, "-");
}

function main() {
  const htmlPath = process.argv[2] || DEFAULT_HTML;
  const html = fs.readFileSync(htmlPath, "utf8");

  const FEATURES = extractLiteral(html, "const FEATURES", "[", "]");
  let KNOWN = [];
  try {
    KNOWN = extractLiteral(html, "const KNOWN_VERSIONS_NO_FEATURES", "[", "]");
  } catch { /* optional */ }

  const dataFile = path.join(__dirname, "..", "data", "monitor.json");
  const existing = fs.existsSync(dataFile)
    ? JSON.parse(fs.readFileSync(dataFile, "utf8"))
    : { entries: [], versions: [] };

  // Keep any existing entries that aren't part of the seed (e.g. later curated ones).
  const seedIds = new Set();
  const entries = [];
  const versionMap = new Map();

  for (const f of FEATURES) {
    const d = parseDate(f.date) || { iso: "", display: f.date };
    const id = `${f.v}::${slug(f.text)}`;
    seedIds.add(id);
    const link = releaseNotesUrl(f.v) + "#" + versionAnchor(f.v);
    entries.push({
      id,
      version: f.v,
      date: d.iso,
      dateDisplay: d.display,
      category: "feature",
      text: f.text,
      link,
      status: "curated",
      platforms: Array.isArray(f.p) ? f.p : [],
      edition: f.edition || "",
    });
    if (!versionMap.has(f.v)) {
      versionMap.set(f.v, { version: f.v, date: d.iso, dateDisplay: d.display, link });
    }
  }

  // Versions with no features (kept so they appear in the version filter/upgrade path).
  for (const v of KNOWN) {
    if (!versionMap.has(v)) {
      const link = releaseNotesUrl(v) + "#" + versionAnchor(v);
      versionMap.set(v, { version: v, date: "", dateDisplay: "", link });
    }
  }

  // Preserve non-seed existing entries/versions.
  for (const e of existing.entries || []) {
    if (!seedIds.has(e.id)) entries.push(e);
  }
  for (const v of existing.versions || []) {
    if (!versionMap.has(v.version)) versionMap.set(v.version, v);
  }

  const data = {
    product: "monitor",
    productName: "Redgate Monitor",
    source: RELEASE_NOTE_URLS["14"],
    generated: new Date().toISOString().slice(0, 10),
    versions: [...versionMap.values()].sort(cmpVersionDesc),
    entries: entries.sort((a, b) => {
      const c = cmpVersionDesc({ version: a.version }, { version: b.version });
      return c !== 0 ? c : (a.text || "").localeCompare(b.text || "");
    }),
  };

  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(
    `[seed] wrote data/monitor.json — ${data.entries.length} entries ` +
      `(${seedIds.size} curated from seed), ${data.versions.length} versions`
  );
}

main();

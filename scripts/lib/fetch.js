"use strict";

/**
 * Fetch a URL as text using Node's global fetch (Node >= 18).
 * Sends a browser-like User-Agent so the docs CDN returns the full page.
 */
async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 RG-RNS-bot/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return await res.text();
}

module.exports = { fetchText };

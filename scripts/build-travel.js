#!/usr/bin/env node
// Builds the Travel gallery from raw photos.
//
// Convention: drop full-resolution JPEGs into
//   images/travel/<YYYY_MM_name>/<location>/*.jpg
// (the <location> sub-folder is optional — photos directly inside a trip
// folder are treated as one unnamed location). This raw drop zone is
// gitignored, so it's never published.
//
// This script resizes/compresses each photo into two web-sized versions
// under images/travel-web/ (thumb + full), strips EXIF metadata
// (including GPS tags) for privacy, and regenerates js/travel-data.js
// to match whatever is currently in images/travel/.
//
// Run it again any time after adding/removing photos:
//   node scripts/build-travel.js
//
// Raw originals in images/travel/ are gitignored and never committed —
// only the resized output in images/travel-web/ is.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = ROOT; // the repo root is the GitHub Pages publish root
const SRC_DIR = path.join(ROOT, "images", "travel");
const OUT_DIR = path.join(PUBLIC_DIR, "images", "travel-web");
const DATA_FILE = path.join(PUBLIC_DIR, "js", "travel-data.js");

// Explicit location display order per trip (folder-name sort is alphabetical,
// which rarely matches the order a trip was actually travelled). Add an entry
// here for any trip where the locations should appear in a specific order;
// locations left out of the list are appended afterward, alphabetically.
const LOCATION_ORDER = {
  "2026_04_china": ["beijing", "shanghai", "chongqing", "chengdu", "hong_kong"],
  "2026_09_indonesia": ["bali", "gili_trawangan", "lombok"],
};

function orderLocations(tripDir, dirs) {
  const order = LOCATION_ORDER[tripDir];
  if (!order) return dirs;
  const rest = dirs.filter((d) => !order.includes(d)).sort(naturalCompare);
  return [...order.filter((d) => dirs.includes(d)), ...rest];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isImage(name) {
  return /\.(jpe?g)$/i.test(name);
}

// Natural sort: compares embedded numbers numerically (so "img_9" < "img_10"),
// and a bare name sorts before that same name with a "_1", "_2", ... suffix
// (e.g. "img_0148" before "img_0148_1"). Intl's localeCompare(numeric: true)
// gets the "_1" case backwards, so this compares split digit/non-digit runs
// directly instead.
function naturalCompare(a, b) {
  const aParts = a.match(/(\d+)|(\D+)/g) || [];
  const bParts = b.match(/(\d+)|(\D+)/g) || [];
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i];
    const bp = bParts[i];
    if (ap === undefined) return -1; // a is a prefix of b -> a sorts first
    if (bp === undefined) return 1;
    if (ap === bp) continue;
    const isNumericPair = /^\d+$/.test(ap) && /^\d+$/.test(bp);
    if (isNumericPair) {
      const diff = Number.parseInt(ap, 10) - Number.parseInt(bp, 10);
      if (diff !== 0) return diff;
    }
    return ap < bp ? -1 : 1;
  }
  return 0;
}

function listDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(naturalCompare);
}

function listImages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && isImage(d.name))
    .map((d) => d.name)
    .sort(naturalCompare);
}

function titleCase(slug) {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseTripFolder(name) {
  const match = name.match(/^(\d{4})(?:_(\d{2}))?_(.+)$/);
  if (!match) return { title: titleCase(name), dateLabel: null };
  const [, year, month, slug] = match;
  const dateLabel = month ? `${MONTH_NAMES[Number.parseInt(month, 10) - 1]} ${year}` : year;
  return { title: titleCase(slug), dateLabel };
}

function needsRebuild(src, out) {
  if (!fs.existsSync(out)) return true;
  return fs.statSync(src).mtimeMs > fs.statSync(out).mtimeMs;
}

function convert(src, out, maxWidth, quality) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync("ffmpeg", [
    "-y",
    "-i", src,
    "-vf", `scale='min(${maxWidth},iw)':-2`,
    "-q:v", String(quality),
    "-map_metadata", "-1", // strip EXIF (incl. GPS) from published images
    out,
  ], { stdio: ["ignore", "ignore", "pipe"] });
}

function processImage(trip, location, file) {
  const src = path.join(SRC_DIR, trip, ...(location ? [location] : []), file);
  const base = file.replace(/\.(jpe?g)$/i, "").toLowerCase();
  const relDir = path.join(trip, ...(location ? [location] : []));
  const thumbOut = path.join(OUT_DIR, relDir, "thumb", `${base}.jpg`);
  const fullOut = path.join(OUT_DIR, relDir, "full", `${base}.jpg`);

  if (needsRebuild(src, thumbOut)) convert(src, thumbOut, 640, 5);
  if (needsRebuild(src, fullOut)) convert(src, fullOut, 1920, 3);

  return {
    // relative to the repo root (the published root), since that's where travel.html lives
    thumb: path.relative(PUBLIC_DIR, thumbOut).replaceAll("\\", "/"),
    full: path.relative(PUBLIC_DIR, fullOut).replaceAll("\\", "/"),
  };
}

function build() {
  if (!fs.existsSync(SRC_DIR)) {
    console.log("No images/travel/ folder found — nothing to build.");
    return;
  }

  const trips = [];
  for (const tripDir of listDirs(SRC_DIR)) {
    const tripPath = path.join(SRC_DIR, tripDir);
    const { title: tripTitle, dateLabel } = parseTripFolder(tripDir);
    const locationDirs = orderLocations(tripDir, listDirs(tripPath));
    const locations = [];

    const rootImages = listImages(tripPath);
    if (rootImages.length) {
      locations.push({
        id: tripDir,
        title: null,
        photos: rootImages.map((file) => {
          const paths = processImage(tripDir, null, file);
          return { ...paths, alt: tripTitle };
        }),
      });
    }

    for (const locDir of locationDirs) {
      const images = listImages(path.join(tripPath, locDir));
      if (!images.length) continue;
      const locTitle = titleCase(locDir);
      locations.push({
        id: locDir,
        title: locTitle,
        photos: images.map((file) => {
          const paths = processImage(tripDir, locDir, file);
          return { ...paths, alt: `${locTitle} — ${tripTitle}` };
        }),
      });
    }

    const photoCount = locations.reduce((n, l) => n + l.photos.length, 0);
    if (photoCount === 0) {
      console.log(`Skipping "${tripDir}" — no photos yet.`);
      continue;
    }

    trips.push({ id: tripDir, title: tripTitle, dateLabel, locations });
    const dateSuffix = dateLabel ? ` (${dateLabel})` : "";
    console.log(`${tripTitle}${dateSuffix}: ${photoCount} photos`);
  }

  // Trip folders are named YYYY_MM_name, so sorting ascending (listDirs above)
  // then reversing puts the most recent trip first, without guessing dates.
  trips.reverse();

  const banner = "// AUTO-GENERATED by scripts/build-travel.js — do not edit by hand.\n" +
    "// Add/remove photos under images/travel/, then re-run the script.\n\n";
  fs.writeFileSync(DATA_FILE, banner + `const TRAVEL_DATA = ${JSON.stringify(trips, null, 2)};\n`);
  console.log(`\nWrote ${path.relative(ROOT, DATA_FILE)}`);
}

build();

// scripts/build-manifest.mjs
// Scans /assets folders, infers tags from filenames, and writes assets/manifest.json
import { promises as fs } from "fs";
import path from "path";

const REPO_ROOT = process.cwd();
const ASSETS_DIR = path.join(REPO_ROOT, "assets");
const OUT_FILE = path.join(ASSETS_DIR, "manifest.json");

// folders (create if missing)
const FOLDERS = ["backgrounds", "sprites", "hazards", "coins"];
const EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const IGNORE_WORDS = new Set(["bg","background","color","colour","sprite","player","tilesheet","sheet","image","img"]);

function safeJoin(...p){ return path.join(...p).replace(/\\/g, "/"); }
async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }

function filenameTags(base) {
  // lower, strip extension, split on non-alnum, also split camelCase
  const noExt = base.replace(/\.[^.]+$/, "");
  const camelSplit = noExt.replace(/([a-z])([A-Z])/g, "$1 $2");
  const raw = camelSplit.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return raw.filter(w => !IGNORE_WORDS.has(w));
}

function parseGridHint(base) {
  // matches like *_8x1.png or *-4X2.jpg anywhere in the name
  const m = base.match(/(\d+)\s*x\s*(\d+)/i);
  if (m) {
    const cols = parseInt(m[1], 10);
    const rows = parseInt(m[2], 10);
    if (cols > 0 && rows > 0) return { cols, rows };
  }
  // If the name contains "tilesheet", assume a sensible default
  if (/tilesheet/i.test(base)) return { cols: 8, rows: 1 };
  return null;
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (EXTS.has(ext)) files.push(safeJoin(dir, e.name));
      }
    }
    return files;
  } catch {
    return [];
  }
}

async function main() {
  await ensureDir(ASSETS_DIR);
  for (const f of FOLDERS) await ensureDir(path.join(ASSETS_DIR, f));

  const backgrounds = [];
  const players = [];
  const hazards = [];
  const coins = [];

  // Scan each folder
  for (const [bucket, arr] of [
    ["backgrounds", backgrounds],
    ["sprites", players],
    ["hazards", hazards],
    ["coins", coins],
  ]) {
    const dir = path.join(ASSETS_DIR, bucket);
    const files = await listFiles(dir);
    for (const full of files) {
      const rel = "/" + path.relative(REPO_ROOT, full).replace(/\\/g, "/");
      const base = path.basename(full);
      const id = base.replace(/\.[^.]+$/, "");
      const tags = filenameTags(base);

      const item = { id, path: rel, tags };
      if (bucket === "sprites") {
        const grid = parseGridHint(base);
        if (grid) item.frame = grid; // optional, helps runtime animation
      }
      arr.push(item);
    }
  }

  const manifest = { backgrounds, players, hazards, coins };
  await fs.writeFile(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote", OUT_FILE);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

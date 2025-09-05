// scripts/build-manifest.mjs
// Unified "drop anywhere" builder (RECURSIVE).
// Drag anything into assets/library/ (subfolders OK) or keep using assets/backgrounds/ and assets/sprites/.
// We auto-classify backgrounds vs. sprites and add tags. No renames needed.

import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const ASSETS = path.join(ROOT, "assets");
const LIB = path.join(ASSETS, "library");        // your one drop-zone (supports subfolders)
const BG_DIR = path.join(ASSETS, "backgrounds"); // still supported
const SPR_DIR = path.join(ASSETS, "sprites");     // still supported
const OUT = path.join(ASSETS, "manifest.json");

const EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const IGNORE = new Set(["bg","background","sprite","tilesheet","sheet","image","img","player","character","color","colour"]);

function pj(...p){ return path.join(...p).replace(/\\/g,"/"); }
async function ensureDir(d){ await fs.mkdir(d,{recursive:true}); }

function tagsFromName(base){
  const noExt = base.replace(/\.[^.]+$/, "");
  const split = noExt.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return split.filter(w => !IGNORE.has(w));
}

// ----- RECURSIVE directory walker -----
async function walk(dir){
  const out = [];
  try{
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for(const e of ents){
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...await walk(full));
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (EXTS.has(ext)) out.push(pj(full));
      }
    }
  } catch {}
  return out;
}

// --- image size sniffers (PNG/JPEG). WEBP returns null (still fine) ---
async function readSize(p){
  try{
    const buf = await fs.readFile(p);
    const ext = path.extname(p).toLowerCase();
    if (ext === ".png") {
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // IHDR
      return {w, h};
    }
    if (ext === ".jpg" || ext === ".jpeg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xFF) break;
        const marker = buf[i+1];
        const len = buf.readUInt16BE(i+2);
        if (marker === 0xC0 || marker === 0xC2) {
          const h = buf.readUInt16BE(i+5);
          const w = buf.readUInt16BE(i+7);
          return {w, h};
        }
        i += 2 + len;
      }
    }
  }catch{}
  return null; // WEBP or unknown -> no size
}

function looksLikeSpriteName(str){
  return /(sprite|tilesheet|sheet|player|character|soldier|zombie|enemy|hero)/i.test(str);
}
function looksLikeBackgroundName(str){
  return /(bg|background|castle|forest|grass|desert|mountain|ocean|water|underwater|city|urban|snow|winter|sky|hills|valley|field)/i.test(str);
}

function detectGridBySize(size){
  if(!size) return null;
  const W=size.w, H=size.h;
  const candidates = [
    [12,1],[10,1],[8,1],[6,1],[5,1],[4,1],[3,1],[2,1],
    [1,12],[1,10],[1,8],[1,6],[1,5],[1,4],[1,3],[1,2],
    [4,2],[3,2],[2,3],[4,4]
  ];
  for(const [cols,rows] of candidates){
    if((W % cols) === 0 && (H % rows) === 0){
      return { cols, rows };
    }
  }
  return null;
}

function classify(fullPath, base, size){
  const lowerPath = fullPath.toLowerCase();
  // Folder name hints
  if (lowerPath.includes("/background")) return "backgrounds";
  if (lowerPath.includes("/sprite"))     return "players";
  if (lowerPath.includes("/bg/") || lowerPath.endsWith("/bg")) return "backgrounds";

  // Filename hints
  if (looksLikeBackgroundName(base)) return "backgrounds";
  if (looksLikeSpriteName(base))     return "players";

  // Size heuristics
  if (size){
    const aspect = size.w / (size.h || 1);
    const area = size.w * size.h;
    if (size.w >= 1024 || size.h >= 900 || aspect >= 1.6 || area >= 900*700) return "backgrounds";
    if (size.w <= 800 && size.h <= 800) return "players";
  }
  // Default to players if ambiguous
  return "players";
}

async function gather(){
  await ensureDir(ASSETS);
  await ensureDir(LIB);
  await ensureDir(BG_DIR);
  await ensureDir(SPR_DIR);

  // Recursively gather all images from the three roots
  const files = [
    ...(await walk(LIB)),
    ...(await walk(BG_DIR)),
    ...(await walk(SPR_DIR))
  ];

  const backgrounds=[], players=[];
  for(const full of files){
    const rel = "/" + path.relative(ROOT, full).replace(/\\/g,"/");
    const base = path.basename(full);

    const size = await readSize(full);  // may be null
    const kind = classify(rel, base, size);
    const t = tagsFromName(base);

    if (kind === "backgrounds") {
      backgrounds.push({ id: base.replace(/\.[^.]+$/,""), path: rel, tags: t });
    } else {
      const grid = detectGridBySize(size);
      const item = { id: base.replace(/\.[^.]+$/,""), path: rel, tags: t };
      if (grid) item.frame = grid; // helps runtime animation
      players.push(item);
    }
  }

  backgrounds.sort((a,b)=> a.id.localeCompare(b.id));
  players.sort((a,b)=> a.id.localeCompare(b.id));

  const manifest = { backgrounds, players, hazards: [], coins: [] };
  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote", OUT, `(bg:${backgrounds.length}, players:${players.length})`);
}

gather().catch(err => { console.error(err); process.exit(1); });

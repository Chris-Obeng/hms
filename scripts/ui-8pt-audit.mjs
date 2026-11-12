#!/usr/bin/env node
// Visual tooling only. Counts 8-point-grid smells per file.
// Usage: node scripts/ui-8pt-audit.mjs [--json out.json] [--top N]
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const EXT = new Set([".tsx", ".ts", ".css"]);
const SKIP = new Set(["node_modules", ".next", "actions"]);

const SPACING_PREFIX =
  "(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|inset-x|inset-y|top|right|bottom|left|start|end|basis|scroll-m|scroll-p)";
// Odd steps: 5, 7, 9, 11 and any half step (0.5, 1.5, 2.5 ...)
const ODD_STEP = new RegExp(
  `(?<![\\w\\[-])-?(?:[a-z0-9_\\[\\]&>*:-]+:)*-?${SPACING_PREFIX}-(?:\\d+\\.5|5|7|9|11)(?![\\w./%-])`,
  "g",
);
const ARB_ANY = /(?<![\w])[a-z-]+-\[-?\d*\.?\d+(?:px|rem|em)\]/g;
const ARB_TEXT = /\btext-\[-?\d*\.?\d+(?:px|rem|em)\]/g;
const ARB_ROUNDED = /\brounded(?:-[a-z]{1,2})?-\[-?\d*\.?\d+(?:px|rem|em)\]/g;
const ARB_LEADING = /\bleading-\[[^\]]+\]/g;
const INLINE_STYLE_PX =
  /\b(?:padding|margin|gap|width|height|minWidth|minHeight|maxWidth|maxHeight|top|left|right|bottom|fontSize|lineHeight|borderRadius|rowGap|columnGap)\w*\s*:\s*(?:"-?\d*\.?\d+(?:px|rem)"|'-?\d*\.?\d+(?:px|rem)'|-?\d*\.?\d+\s*[,}\n])/g;
const CSS_PX = /(?<![\w.#-])-?(\d*\.?\d+)(px|rem)\b/g;
const CSS_DECL =
  /^\s*(?:padding|margin|gap|row-gap|column-gap|width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset|font-size|line-height|border-radius)[\w-]*\s*:[^;]*;?/gm;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(name.slice(name.lastIndexOf(".")))) out.push(p);
  }
  return out;
}

const count = (re, s) => (s.match(re) || []).length;

function cssOffGrid(src) {
  let total = 0;
  let off = 0;
  for (const decl of src.match(CSS_DECL) || []) {
    for (const m of decl.matchAll(CSS_PX)) {
      const n = parseFloat(m[1]);
      const px = m[2] === "rem" ? n * 16 : n;
      if (px <= 2) continue; // hairlines are exempt
      total++;
      if (px % 4 !== 0) off++;
    }
  }
  return { total, off };
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).sort();
const result = {};
const totals = {
  oddSteps: 0, arbitrary: 0, arbText: 0, arbRounded: 0, arbLeading: 0,
  inlineStylePx: 0, cssPxValues: 0, cssOffGrid: 0,
};

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = relative(ROOT, f);
  const isCss = f.endsWith(".css");
  const row = {
    oddSteps: isCss ? 0 : count(ODD_STEP, src),
    arbitrary: isCss ? 0 : count(ARB_ANY, src),
    arbText: isCss ? 0 : count(ARB_TEXT, src),
    arbRounded: isCss ? 0 : count(ARB_ROUNDED, src),
    arbLeading: isCss ? 0 : count(ARB_LEADING, src),
    inlineStylePx: isCss ? 0 : count(INLINE_STYLE_PX, src),
    cssPxValues: 0,
    cssOffGrid: 0,
  };
  if (isCss) {
    const c = cssOffGrid(src);
    row.cssPxValues = c.total;
    row.cssOffGrid = c.off;
  }
  const sum = Object.values(row).reduce((a, b) => a + b, 0);
  if (sum === 0) continue;
  row.score = sum;
  result[rel] = row;
  for (const k of Object.keys(totals)) totals[k] += row[k];
}

const out = { generatedBy: "scripts/ui-8pt-audit.mjs", totals, files: result };
const args = process.argv.slice(2);
const ji = args.indexOf("--json");
if (ji >= 0) {
  const target = args[ji + 1];
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
}
const ti = args.indexOf("--top");
const top = ti >= 0 ? Number(args[ti + 1]) : 20;
console.log("Totals:", JSON.stringify(totals));
console.log(`Files with findings: ${Object.keys(result).length} / ${files.length}`);
for (const [f, r] of Object.entries(result).sort((a, b) => b[1].score - a[1].score).slice(0, top)) {
  console.log(String(r.score).padStart(5), f);
}

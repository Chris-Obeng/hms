#!/usr/bin/env node
// Visual tooling only. Counts 8-point-grid smells per file.
// Usage: node scripts/ui-8pt-audit.mjs [--json out.json] [--top N]
//        node scripts/ui-8pt-audit.mjs --check   (fails on rule violations; see checkRules)
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

// ── --check: hard rules of the 8-point system (documented in app/globals.css) ──
// Allowed exceptions live in ui-audit/8pt-allowlist.json as
// { "file": "<repo-relative path>", "token": "<exact class or css value>" | "*", "reason": "..." }.
const VARIANTS = "(?:[a-z0-9*@\\[\\]&>_=/.()-]+:)*";
const BOUND = "(?<=^|[\\s\"'`{(,:!])";
const TW_RULES = [
  {
    id: "half-step",
    why: "half steps are off the grid",
    re: new RegExp(`${BOUND}${VARIANTS}-?${SPACING_PREFIX}-\\d+\\.5(?![\\w./%\\]-])`, "g"),
  },
  {
    id: "spacing-20-28",
    why: "padding, margin and gap use 4/8/12/16 inside components and multiples of 8 for layout",
    re: new RegExp(`${BOUND}${VARIANTS}-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-(?:5|7|9|11)(?![\\w./%\\]-])`, "g"),
  },
  {
    id: "control-height",
    why: "control heights are 32 / 40 / 48 (44 for mobile touch); no 28 or 36",
    re: new RegExp(`${BOUND}${VARIANTS}(?:h|min-h)-(?:7|9)(?![\\w./%\\]-])`, "g"),
  },
  {
    id: "arbitrary-text",
    why: "use the type scale (text-2xs/xs/sm/md/base/lg/xl/2xl); arbitrary sizes only for 22px+ display type",
    re: new RegExp(`${BOUND}${VARIANTS}text-\\[(\\d*\\.?\\d+)(px|rem)\\]`, "g"),
    keep: (m) => (m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])) >= 22,
  },
  {
    id: "arbitrary-radius",
    why: "use the radius scale (rounded-sm/lg/xl/2xl/3xl/full)",
    re: new RegExp(`${BOUND}${VARIANTS}rounded(?:-[a-z]{1,2})?-\\[([^\\]]+)\\]`, "g"),
    keep: (m) => /^(?:[0-2](?:\.\d+)?px|0)$/.test(m[1]), // hairline radii (<= 2px) are exempt
  },
  {
    id: "arbitrary-off-4",
    why: "arbitrary spacing and sizes must be multiples of 4px",
    re: new RegExp(`${BOUND}${VARIANTS}-?${SPACING_PREFIX}-\\[-?(\\d*\\.?\\d+)(px|rem)\\]`, "g"),
    keep: (m) => {
      const px = Math.abs(m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]));
      return px <= 2 || px % 4 === 0;
    },
  },
];
const CSS_RULES = [
  {
    id: "css-off-4",
    why: "CSS spacing and sizes must be multiples of 4px",
    decl: /(?<=^|[{;])\s*(?:padding|margin|gap|row-gap|column-gap|width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset)[\w-]*\s*:([^;{}]*)/gm,
    bad: (px) => px > 2 && px % 4 !== 0,
  },
  {
    id: "css-radius",
    why: "border radius uses 4 / 8 / 12 / 16 / 24 / full",
    decl: /(?<=^|[{;])\s*(?:border(?:-[a-z]+)*-radius|--[\w-]*radius)\s*:([^;{}]*)/gm,
    bad: (px) => px > 2 && ![4, 8, 12, 16, 24].includes(px) && px < 99,
  },
];

function loadAllowlist() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "ui-audit/8pt-allowlist.json"), "utf8"));
  } catch {
    return [];
  }
}

function checkRules() {
  const allow = loadAllowlist();
  const allowed = (rel, token) =>
    allow.some((a) => a.file === rel && (a.token === "*" || a.token === token));
  const problems = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    const src = readFileSync(f, "utf8");
    const lineOf = (i) => src.slice(0, i).split("\n").length;
    if (f.endsWith(".css")) {
      for (const rule of CSS_RULES) {
        for (const d of src.matchAll(rule.decl)) {
          for (const v of d[1].matchAll(/(?<![\w.#-])-?(\d*\.?\d+)(px|rem)\b/g)) {
            const px = Math.abs(v[2] === "rem" ? Number(v[1]) * 16 : Number(v[1]));
            if (!rule.bad(px) || allowed(rel, v[0])) continue;
            problems.push(`${rel}:${lineOf(d.index)}  ${rule.id}  ${d[0].trim()}  (${rule.why})`);
          }
        }
      }
      continue;
    }
    for (const rule of TW_RULES) {
      for (const m of src.matchAll(rule.re)) {
        if (rule.keep?.(m) || allowed(rel, m[0])) continue;
        problems.push(`${rel}:${lineOf(m.index)}  ${rule.id}  ${m[0]}  (${rule.why})`);
      }
    }
  }
  return problems;
}

if (process.argv.includes("--check")) {
  const problems = checkRules();
  if (problems.length) {
    console.error(problems.join("\n"));
    console.error(`\n${problems.length} 8-point violation(s). Fix them, or add a reasoned entry to ui-audit/8pt-allowlist.json.`);
    process.exit(1);
  }
  console.log("8-point check passed.");
  process.exit(0);
}

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

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");
const svg = readFileSync(join(iconsDir, "icon.svg"));

const sizes = [
  { name: "icon-180x180.png", size: 180 },
  { name: "icon-192x192.png", size: 192 },
  { name: "icon-512x512.png", size: 512 },
];

for (const { name, size } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(join(iconsDir, name));
  console.log(`Wrote ${name}`);
}

// Maskable icon — smaller logo inside safe zone (80%)
const maskableSize = 512;
const inner = Math.round(maskableSize * 0.62);
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maskableSize} ${maskableSize}">
  <rect width="${maskableSize}" height="${maskableSize}" fill="#1C1917"/>
  <text x="${maskableSize / 2}" y="${maskableSize / 2 + inner * 0.22}" font-family="Georgia, serif" font-size="${inner * 0.72}" font-weight="700" fill="white" text-anchor="middle">H</text>
</svg>`;

await sharp(Buffer.from(maskableSvg))
  .resize(maskableSize, maskableSize)
  .png()
  .toFile(join(iconsDir, "icon-512-maskable.png"));

console.log("Wrote icon-512-maskable.png");

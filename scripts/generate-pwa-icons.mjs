/**
 * Generates every RoomLine icon asset from lib/brand/mark.ts.
 *
 *   pnpm icons
 *
 * Output (public/):
 *   favicon.ico                   16/32/48 px, PNG-in-ICO, for /favicon.ico requests
 *   icons/icon.svg                rounded tile, scalable favicon
 *   icons/icon-{96,192,512}x…png  rounded tile, manifest `any` + shortcut icons
 *   icons/icon-{192,512}-maskable full-bleed, glyph inside the 40% safe circle
 *   icons/icon-180x180.png        full-bleed apple-touch-icon (iOS masks corners)
 *   icons/icon-monochrome-512.png alpha-only silhouette, manifest `monochrome`
 *   icons/badge-96x96.png         alpha-only silhouette, notification badge
 *   apple-touch-icon.png          same as icons/icon-180x180.png, at the path iOS probes
 *   splash/apple-splash-*.png     iOS launch screens (lib/brand/splash.ts): the tile
 *                                 centred on the dashboard's background colour
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, tileSvg, fullBleedSvg, monochromeSvg } from "../lib/brand/mark.ts";
import { LAUNCH_BACKGROUND, SPLASH_SCREENS } from "../lib/brand/splash.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const iconsDir = join(publicDir, "icons");

// Rasterise at a high density so small sizes are downsampled, not upscaled.
const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 288 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// Full-bleed icons (maskable, apple-touch-icon) carry no alpha channel at all:
// iOS paints transparency black and Android masks expect an opaque square.
const opaquePng = (svg, size) =>
  sharp(Buffer.from(svg), { density: 288 })
    .resize(size, size)
    .flatten({ background: BRAND.ink })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

async function write(name, svg, size, encode = png) {
  writeFileSync(join(iconsDir, name), await encode(svg, size));
  console.log(`Wrote icons/${name}`);
}

const tile = tileSvg();
// Glyph reaches 182 px from the centre on the 512 grid; at 0.9 it sits at
// 164 px, inside the 204.8 px maskable safe radius with room to breathe.
const maskable = fullBleedSvg(0.9);

writeFileSync(join(iconsDir, "icon.svg"), `${tile}\n`);
console.log("Wrote icons/icon.svg");

await write("icon-96x96.png", tile, 96);
await write("icon-192x192.png", tile, 192);
await write("icon-512x512.png", tile, 512);
await write("icon-192-maskable.png", maskable, 192, opaquePng);
await write("icon-512-maskable.png", maskable, 512, opaquePng);
const touchIcon = fullBleedSvg(0.92);
await write("icon-180x180.png", touchIcon, 180, opaquePng);
writeFileSync(join(publicDir, "apple-touch-icon.png"), await opaquePng(touchIcon, 180));
console.log("Wrote apple-touch-icon.png");
await write("icon-monochrome-512.png", monochromeSvg(0.9), 512);
// Android shows badges in the status bar at ~24 dp; a full-size glyph keeps it legible.
await write("badge-96x96.png", monochromeSvg(1.2), 96);

// ICO with embedded PNG images (supported by every current browser).
const icoSizes = [16, 32, 48];
const images = await Promise.all(icoSizes.map((size) => png(tile, size)));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, i) => {
  const entry = 6 + i * 16;
  header.writeUInt8(icoSizes[i], entry); // width
  header.writeUInt8(icoSizes[i], entry + 1); // height
  header.writeUInt8(0, entry + 2); // palette size
  header.writeUInt8(0, entry + 3); // reserved
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(join(publicDir, "favicon.ico"), Buffer.concat([header, ...images]));
console.log("Wrote favicon.ico");

// iOS launch screens: flat colour + one centred tile, so a palette PNG is tiny.
const splashDir = join(publicDir, "splash");
mkdirSync(splashDir, { recursive: true });
for (const screen of SPLASH_SCREENS) {
  const logo = await sharp(Buffer.from(tile), { density: 576 }).resize(screen.logo, screen.logo).png().toBuffer();
  const out = await sharp({
    create: { width: screen.width, height: screen.height, channels: 3, background: LAUNCH_BACKGROUND },
  })
    .composite([
      {
        input: logo,
        left: Math.round((screen.width - screen.logo) / 2),
        top: Math.round((screen.height - screen.logo) / 2),
      },
    ])
    .png({ palette: true, colours: 64, compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(publicDir, screen.url.slice(1)), out);
}
console.log(`Wrote ${SPLASH_SCREENS.length} splash screens`);

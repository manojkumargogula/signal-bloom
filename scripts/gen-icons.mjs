/**
 * Rasterises the hand-authored SVGs into every icon the app needs.
 *
 * This is the only sanctioned path from source to icon raster: CI re-runs it
 * and fails if the result differs from what is committed, so a hand-edited PNG
 * cannot drift away from the SVG it came from.
 *
 * sharp is used rather than ImageMagick because it bundles librsvg and emits
 * true RGBA. ImageMagick without a librsvg delegate falls back to its own
 * renderer, which mangles opacity and strokes.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = (name) => resolve(root, "assets/brand", name);
const out = (p) => resolve(root, p);

mkdirSync(out("public/icons"), { recursive: true });

const jobs = [
  { from: "icon.svg", to: "public/icons/icon-192.png", size: 192 },
  { from: "icon.svg", to: "public/icons/icon-512.png", size: 512 },
  // Separate artwork: a maskable icon is cropped to a circle, so reusing the
  // standard icon would clip the mark.
  { from: "maskable.svg", to: "public/icons/maskable-512.png", size: 512 },
  // iOS discards alpha and composites on white, so the background is baked in
  // -- which the source SVG already does.
  { from: "icon.svg", to: "src/app/apple-icon.png", size: 180 },
];

for (const job of jobs) {
  await sharp(brand(job.from), { density: 384 })
    .resize(job.size, job.size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toFile(out(job.to));
  console.log(`  ${job.to}  ${job.size}x${job.size}`);
}

console.log(`icons: ${jobs.length} written`);

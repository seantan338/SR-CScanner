import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  "pdfjs-dist/build/pdf.worker.min.mjs",
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
];

let source = "";
for (const candidate of candidates) {
  try {
    source = require.resolve(candidate);
    break;
  } catch {
    // try the next build path
  }
}

if (!source || !existsSync(source)) {
  console.error("Could not find the pdf.js worker to copy into public/.");
  process.exit(1);
}

const destinationDir = join(root, "public");
mkdirSync(destinationDir, { recursive: true });
copyFileSync(source, join(destinationDir, "pdf.worker.min.mjs"));
console.log(`Copied pdf.js worker to public/pdf.worker.min.mjs`);

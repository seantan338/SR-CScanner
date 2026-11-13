# SR-CScanner

A mobile-first document scanner for Sunrise Recruit. Version 1 runs entirely in the browser: capture, clean up, sign, read, and share a document without an account, a backend, or a paid API.

Documents live in IndexedDB on the device that created them. Clearing the site data deletes the library.

## Setup

Requires Node.js 22.13 or newer (`pdfjs-dist` 6 does not start on older Node).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The camera needs a secure context. Localhost counts. A phone on your LAN needs HTTPS, or use the photo import button.

```bash
npm test          # unit tests
npm run lint
npm run typecheck
npm run build
npm start
```

`postinstall` and `prebuild` copy the pdf.js worker into `public/`. That file is generated and gitignored.

## Architecture

Next.js (App Router) + TypeScript + Tailwind. There is no server database and no API route. Scanner screens are client components. IndexedDB (Dexie) is only opened in the browser.

| Piece | Where | Notes |
| --- | --- | --- |
| Page finding | `src/lib/detect.ts` | Downscale, blur, Otsu, largest region, convex hull, gradient score |
| Perspective warp | `src/lib/warp.ts` | Homography solved in TypeScript, bilinear sampling |
| Filters | `src/lib/filters.ts` | Original, auto, grayscale, adaptive black and white, magic colour |
| Background processing | `src/workers/image.worker.ts` | Warp and filters. If the worker fails to start, the same functions run on the main thread in row chunks that yield |
| OCR | `src/lib/ocr.ts` | `tesseract.js`, loaded only when the user asks |
| PDF export | `src/lib/pdf-assemble.ts` | `pdf-lib`, JPEG pages, optional invisible Latin text |
| PDF tools | `src/lib/pdf-tools.ts`, `src/lib/pdf-render.ts` | `pdf-lib` copies pages; pdf.js draws thumbnails |
| Storage | `src/lib/db.ts` | Dexie database `sr-cscanner` |
| Offline | `public/sw.js` | Registered in production. Network-first HTML, stale-while-revalidate assets and jsDelivr OCR files |

OpenCV.js is not bundled. The wasm build is large, awkward to load inside Next.js, and would block the first scan. `detectDocumentQuad` is the seam to replace with OpenCV or jscanify later. The crop UI does not know which detector produced the corners.

Other seams, if a later version adds a backend:

- `getDb()` in `src/lib/db.ts` is the only storage entry point.
- `recognizeImage()` in `src/lib/ocr.ts` is the only OCR entry point.
- `assemblePdf()` and `assembleVectorPdf()` build files. A sync client can upload those bytes.

Heavy libraries (`tesseract.js`, `pdfjs-dist`) are dynamic imports, so the library screen does not download them.

## Features

| Feature | Status |
| --- | --- |
| Rear-camera capture (`getUserMedia`, `facingMode: environment`), photo import, and multi-page documents | Done |
| Batch import of several photos, with a “Review each page / Quick capture” switch | Done |
| Automatic page finding | Partial. Tuned for a page that contrasts with the background. Unit-tested on a synthetic page. Low-confidence results ask you to drag the corners. |
| Draggable four-corner crop, perspective straighten, 90° rotation | Done |
| Filters: Original, Auto, Grayscale, B&W (adaptive threshold), Magic colour | Done |
| Reorder (drag and buttons), delete, retake, rename | Done |
| Multi-page PDF with A4, Letter, or fit, plus a JPEG quality control | Done |
| JPG per page. Web Share when the browser allows file sharing, otherwise a download. Several JPGs download as one zip | Done |
| OCR in English, Simplified Chinese, and Malay. Copy, or download TXT | Done. Language packs and the WASM engine download on first use |
| Invisible text layer inside the PDF | Partial. Latin text that WinAnsi can encode is embedded with PDF text rendering mode 3 (invisible, still extractable). Simplified Chinese is kept in the TXT export and is not embedded, because the standard PDF font has no CJK glyphs |
| Import PDFs: merge, reorder, extract a selection, save flattened images into the library | Done. Password-protected PDFs are refused. The tools view loads the first 100 pages |
| Draw a signature, reuse it, and place it on a page before export | Done |
| Library with thumbnails, search across title, tags, and OCR text, plus folders and tags | Done |
| PWA manifest, icons, service worker, installable shell | Done. The worker is registered in production builds. Offline use works after the app has been opened online once |

## Deploy on Vercel

1. Import this repository. Framework preset: Next.js.
2. Use Node.js 22.13 or newer (Project Settings → Node.js Version).
3. No environment variables.
4. Deploy. `npm install` copies the pdf.js worker, then `next build` runs.

The camera, the Web Share sheet, and installing the PWA all need the HTTPS URL Vercel provides. They will not work on a plain `http://` IP address.

## Limitations

- **iOS Safari.** `getUserMedia` needs a user gesture and a secure page. A home-screen install sometimes cannot use the camera until the site has been allowed in Safari first. The Photo button uses `<input capture="environment">` as a fallback. The share sheet works in Safari; some in-app browsers block file sharing.
- **iOS storage.** Safari can evict IndexedDB for sites that are not installed and have not been opened for a while. Installing the PWA lowers that risk. There is still no cloud copy.
- **OCR download.** The first recognition fetches the Tesseract WASM core (about 3–4 MB) from jsDelivr, then a language pack: English ~2.9 MB, Malay ~1.2 MB, Simplified Chinese ~1.7 MB (gzipped integer models). After that, the service worker can serve them offline. Recognition is local and slower than a cloud OCR, especially for Chinese on a phone.
- **OCR inside the PDF** does not cover Chinese, and a Malay word is skipped if it contains a character Helvetica cannot encode.
- **Processing size.** Imports and camera frames are capped at 2000 px on the long edge so a phone does not run out of memory.
- **Edge finding** is not CamScanner-grade. Shoot the page against a darker or lighter table, then correct the corners.
- **PDF tools** keep the original vectors for merge, split, and reorder. Saving images to the library flattens pages so filters, OCR, and signatures can run. Form fields and vector text are not preserved on that path.
- **Service worker** is off during `npm run dev` so it does not cache stale dev bundles.

## Roadmap

Left out of v1 on purpose:

- Accounts and cloud sync across the phone and the desktop
- Asking another person to sign
- Translation
- Tamper or authenticity checks
- Fax
- Word, Excel, and PowerPoint conversion

A sync layer should sit behind `src/lib/db.ts` and upload the JPEG pages plus the PDF bytes from `assemblePdf`, not the camera pipeline.

/**
 * The one upload policy both parser domains use.
 *
 * WHY THIS EXISTS. The B-BBEE routes and the ESG routes each declared their own
 * multer instance with a comment promising to keep the two identical by hand.
 * They were identical, and they shared a defect: the fileFilter answered an
 * unsupported file with `cb(new Error(...))`. multer treats that as fatal for
 * the WHOLE multipart request — it stops parsing, the route handler never runs,
 * and the error lands in the generic error middleware as a bare
 * `500 Internal Server Error`. One `.md` note or one `.eml` alongside a
 * perfectly good evidence pack destroyed the entire batch, and the user was
 * told nothing except "500".
 *
 * That contradicted what both routes already promised a few lines further down:
 * per-file isolation, where an unreadable file FLAGS and the rest still get
 * read. The isolation was real — it just sat behind a gate that never let the
 * batch through.
 *
 * WHAT CHANGED. An unsupported file is now SKIPPED (`cb(null, false)`) and
 * recorded on the request, so:
 *   - the batch survives and the readable documents are still processed;
 *   - the skipped names travel to the caller instead of vanishing;
 *   - a batch where NOTHING is supported still fails, but says which files and
 *     why rather than "Internal Server Error".
 *
 * Bytes for an unsupported file are never buffered — `cb(null, false)` drains
 * that part without storing it, so this is not a memory trade.
 *
 * Importing this from `services/` (rather than one route importing the other)
 * keeps `parser.ts` → `esgParser.ts` a one-way mount with no cycle, which is
 * the reason the duplication existed in the first place.
 */
import multer from 'multer';
import type { Request } from 'express';
import { isSupportedUpload } from './fileExtraction.js';

/** A file the upload filter refused, in the shape the routes report outward. */
export interface SkippedUpload {
  file_name: string;
  reason: string;
}

/** Matches the certificates route; a real evidence pack of scans runs to hundreds of MB. */
export const MAX_UPLOAD_BATCH_BYTES = 500 * 1024 * 1024;

/** Files skipped by the filter on this request, in arrival order. */
export function skippedUploads(req: Request): SkippedUpload[] {
  return (req as Request & { skippedUploads?: SkippedUpload[] }).skippedUploads ?? [];
}

/**
 * One sentence naming every skipped file, for the case where the filter left
 * nothing to work with. Callers put this in the 400 so the user can act on it.
 */
export function skippedUploadSummary(req: Request): string {
  const skipped = skippedUploads(req);
  if (skipped.length === 0) return '';
  return skipped.map((s) => `${s.file_name} (${s.reason})`).join(', ');
}

/**
 * The shared multer instance. Limits are the ones both domains already used:
 * 50MB per file, 100 files per request — a full verification evidence pack is
 * ~70 files, and a 25-file cap rejected real client folders with a 413.
 */
export function createUploadPolicy() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 100 },
    fileFilter: (req, file, cb) => {
      // Judge on type OR extension: a correct .xlsm arrives as
      // application/octet-stream often enough that MIME alone rejected real
      // client workbooks.
      if (isSupportedUpload(file.mimetype, file.originalname)) {
        cb(null, true);
        return;
      }
      const carrier = req as Request & { skippedUploads?: SkippedUpload[] };
      carrier.skippedUploads ??= [];
      carrier.skippedUploads.push({
        file_name: file.originalname,
        reason: `unsupported file type ${file.mimetype || 'unknown'}`,
      });
      // Skip this ONE file. Never `cb(new Error(...))` here: that kills the
      // whole multipart request before any route code runs.
      cb(null, false);
    },
  });
}

export const upload = createUploadPolicy();

/**
 * Multipart handling.
 *
 * Files are held in memory, sniffed, and only then handed to a storage driver.
 * Nothing is written to disk by multer itself, so a rejected upload leaves no
 * artefact behind and there is no window where an unvalidated file exists at a
 * servable path.
 */
import multer from 'multer';
import { env } from '../env';
import { ALLOWED_UPLOAD_TYPES } from '../lib/fileType';

const limits = {
  fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
  files: 20,
  fields: 60,
};

/* A first, cheap gate on the declared type. The authoritative check is the
   byte sniff in lib/fileType.ts — this only stops the obvious cases early. */
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if ((ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.mimetype)) return cb(null, true);
  cb(null, false);
};

export const upload = multer({ storage: multer.memoryStorage(), limits, fileFilter });

/* CSV import is a separate instance: the allow-list above is images and PDFs,
   and a spreadsheet is neither. Browsers label .csv inconsistently, so the
   declared type is checked loosely here and the content is parsed strictly. */
const CSV_TYPES = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'];

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const named = file.originalname.toLowerCase().endsWith('.csv');
    cb(null, named || CSV_TYPES.includes(file.mimetype));
  },
});

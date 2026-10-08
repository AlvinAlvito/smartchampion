import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/** Folder file privat (di luar /public, jadi tidak bisa diakses tanpa cek hak akses) */
export const STORAGE_DIR = path.join(process.cwd(), "storage", "materials");
export const MAX_PDF_BYTES = 30 * 1024 * 1024;

export async function savePdf(file: File) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("File harus berformat PDF");
  if (file.size > MAX_PDF_BYTES) throw new Error("Ukuran PDF maksimal 30 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error("Isi file bukan PDF yang valid");
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.pdf`;
  await fs.writeFile(path.join(STORAGE_DIR, name), buf);
  return `/api/files/${name}`;
}

export function storedFileName(url: string | null | undefined) {
  const m = url?.match(/^\/api\/files\/([a-f0-9-]+\.pdf)$/);
  return m ? m[1] : null;
}

export async function removeStoredFile(url: string | null | undefined) {
  const name = storedFileName(url);
  if (name) await fs.rm(path.join(STORAGE_DIR, name), { force: true });
}

/* ---------- Foto tutor (publik) ---------- */

export const TUTOR_PHOTO_DIR = path.join(process.cwd(), "storage", "tutors");
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const TUTOR_PHOTO_URL = /^\/api\/tutor-foto\/([a-f0-9-]+\.(?:jpg|png|webp))$/;

/** Deteksi jenis gambar dari isi file (bukan dari nama/ekstensi). */
function imageExt(buf: Buffer) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
  return null;
}

export async function saveTutorPhoto(file: File) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Ukuran foto maksimal 2 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(buf);
  if (!ext) throw new Error("Foto harus berformat JPG, PNG, atau WebP");
  await fs.mkdir(TUTOR_PHOTO_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(TUTOR_PHOTO_DIR, name), buf);
  return `/api/tutor-foto/${name}`;
}

export async function removeTutorPhoto(url: string | null | undefined) {
  const name = url?.match(TUTOR_PHOTO_URL)?.[1];
  if (name) await fs.rm(path.join(TUTOR_PHOTO_DIR, name), { force: true });
}

/* ---------- Gambar soal worksheet (privat: hanya staf & peserta lunas kelas tsb) ---------- */

export const WORKSHEET_IMG_DIR = path.join(process.cwd(), "storage", "worksheets");
export const MAX_WORKSHEET_IMG_BYTES = 3 * 1024 * 1024;
const WORKSHEET_IMG_URL = /^\/api\/worksheet-img\/([a-f0-9-]+\.(?:jpg|png|webp))$/;

export async function saveWorksheetImage(file: File) {
  if (file.size > MAX_WORKSHEET_IMG_BYTES) throw new Error("Ukuran gambar maksimal 3 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(buf);
  if (!ext) throw new Error("Gambar harus berformat JPG, PNG, atau WebP");
  await fs.mkdir(WORKSHEET_IMG_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(WORKSHEET_IMG_DIR, name), buf);
  return `/api/worksheet-img/${name}`;
}

/** Simpan gambar soal dari buffer (hasil impor Word) */
export async function saveWorksheetImageBuffer(buf: Buffer) {
  if (buf.length > MAX_WORKSHEET_IMG_BYTES) throw new Error("Ukuran gambar maksimal 3 MB");
  const ext = imageExt(buf);
  if (!ext) throw new Error("Gambar harus berformat JPG, PNG, atau WebP");
  await fs.mkdir(WORKSHEET_IMG_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(WORKSHEET_IMG_DIR, name), buf);
  return `/api/worksheet-img/${name}`;
}

export async function removeWorksheetImage(url: string | null | undefined) {
  const name = url?.match(WORKSHEET_IMG_URL)?.[1];
  if (name) await fs.rm(path.join(WORKSHEET_IMG_DIR, name), { force: true });
}

/* ---------- Latar sertifikat (privat; dibaca saat membuat PDF) ---------- */

export const CERT_BG_DIR = path.join(process.cwd(), "storage", "certificates");
export const MAX_CERT_BG_BYTES = 5 * 1024 * 1024;
const CERT_BG_URL = /^\/api\/admin\/sertifikat-bg\/([a-f0-9-]+\.(?:jpg|png))$/;

/** Hanya JPG/PNG (didukung pembuat PDF). Disarankan A4 lanskap, mis. 3508×2480 px. */
export async function saveCertificateBackground(file: File) {
  if (file.size > MAX_CERT_BG_BYTES) throw new Error("Ukuran gambar latar maksimal 5 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(buf);
  if (ext !== "jpg" && ext !== "png") throw new Error("Gambar latar harus JPG atau PNG");
  await fs.mkdir(CERT_BG_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(CERT_BG_DIR, name), buf);
  return `/api/admin/sertifikat-bg/${name}`;
}

export async function readCertificateBackground(url: string | null | undefined) {
  const m = url?.match(CERT_BG_URL);
  if (!m) return null;
  try {
    return { data: await fs.readFile(path.join(CERT_BG_DIR, m[1])), format: (m[1].endsWith(".png") ? "png" : "jpg") as "png" | "jpg" };
  } catch {
    return null;
  }
}

export async function removeCertificateBackground(url: string | null | undefined) {
  const name = url?.match(CERT_BG_URL)?.[1];
  if (name) await fs.rm(path.join(CERT_BG_DIR, name), { force: true });
}

/* ---------- Latar PDF Soal & Pembahasan worksheet (privat; per kelas) ---------- */

export const WS_PDF_BG_DIR = path.join(process.cwd(), "storage", "worksheet-pdf");
const WS_PDF_BG_URL = /^\/api\/admin\/worksheet-pdf-bg\/([a-f0-9-]+\.(?:jpg|png))$/;

/** Hanya JPG/PNG (didukung pembuat PDF). Disarankan A4 potret, mis. 2480×3508 px. */
export async function saveWorksheetPdfBackground(file: File) {
  if (file.size > MAX_CERT_BG_BYTES) throw new Error("Ukuran gambar latar maksimal 5 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(buf);
  if (ext !== "jpg" && ext !== "png") throw new Error("Gambar latar harus JPG atau PNG");
  await fs.mkdir(WS_PDF_BG_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(WS_PDF_BG_DIR, name), buf);
  return `/api/admin/worksheet-pdf-bg/${name}`;
}

export async function readWorksheetPdfBackground(url: string | null | undefined) {
  const m = url?.match(WS_PDF_BG_URL);
  if (!m) return null;
  try {
    return { data: await fs.readFile(path.join(WS_PDF_BG_DIR, m[1])), format: (m[1].endsWith(".png") ? "png" : "jpg") as "png" | "jpg" };
  } catch {
    return null;
  }
}

export async function removeWorksheetPdfBackground(url: string | null | undefined) {
  const name = url?.match(WS_PDF_BG_URL)?.[1];
  if (name) await fs.rm(path.join(WS_PDF_BG_DIR, name), { force: true });
}

/* ---------- Flyer, mading & galeri halaman kelas (publik) ---------- */

export const CLASS_MEDIA_DIR = path.join(process.cwd(), "storage", "class-media");
export const MAX_CLASS_IMAGE_BYTES = 5 * 1024 * 1024;
const CLASS_MEDIA_URL = /^\/api\/kelas-media\/([a-f0-9-]+\.(?:jpg|png|webp|mp4))$/;
export const MAX_CLASS_VIDEO_BYTES = 30 * 1024 * 1024;

export async function saveClassImage(file: File) {
  if (file.size > MAX_CLASS_IMAGE_BYTES) throw new Error("Ukuran gambar maksimal 5 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(buf);
  if (!ext) throw new Error("Gambar harus berformat JPG, PNG, atau WebP");
  await fs.mkdir(CLASS_MEDIA_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(CLASS_MEDIA_DIR, name), buf);
  return `/api/kelas-media/${name}`;
}

/** Video tutorial MP4 (Panduan). Dicek dari isi file: kotak "ftyp" di awal = MP4/MOV. */
export async function saveClassVideo(file: File) {
  if (file.size > MAX_CLASS_VIDEO_BYTES) throw new Error("Ukuran video maksimal 30 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(4, 8).toString() !== "ftyp") throw new Error("Video harus berformat MP4");
  await fs.mkdir(CLASS_MEDIA_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.mp4`;
  await fs.writeFile(path.join(CLASS_MEDIA_DIR, name), buf);
  return `/api/kelas-media/${name}`;
}

/** Hapus file media kelas/panduan (gambar atau video) */
export async function removeClassImage(url: string | null | undefined) {
  const name = url?.match(CLASS_MEDIA_URL)?.[1];
  if (name) await fs.rm(path.join(CLASS_MEDIA_DIR, name), { force: true });
}

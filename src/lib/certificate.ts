/**
 * Pengaturan sertifikat per kelas (disimpan di products.certificateConfig) — dipakai form admin & pembuat PDF.
 * Teks mendukung penanda {nama}, {kelas}, {bidang}, {jenjang}, {periode}, {mulai}, {selesai}, {nilai}, {grade}, {predikat}, {kehadiran}, {nomor}, {tanggal},
 * dan **teks tebal** (dua bintang).
 * Tanpa gambar latar unggahan → desain bawaan mengikuti contoh sertifikat POSI (assets/certificate/latar-sertifikat.jpg):
 * judul, "Diserahkan kepada:", logo, stempel & maskot sudah ada di latar; yang dipakai dari pengaturan: isi, kota/tanggal, nomor, penanda tangan.
 * Bila gambar tanda tangan diunggah, desain bawaan memakai versi polos (assets/certificate/latar-sertifikat-polos.jpg) tanpa stempel & tanda tangan
 * lama, karena keduanya menyatu di gambar dan tidak bisa dipisahkan.
 */

export type CertificateSigner = { name: string; title: string };
export type CertificateConfig = {
  /** judul besar (kosongkan bila sudah ada di gambar latar) */
  title: string;
  subtitle: string;
  intro: string;
  body: string;
  /** posisi vertikal nama peserta, % dari atas halaman */
  nameTop: number;
  nameFont: "script" | "serif" | "sans";
  nameColor: string;
  textColor: string;
  showNumber: boolean;
  /** kota penerbitan, mis. "Medan" → "Medan, 12 Oktober 2026" */
  place: string;
  showDate: boolean;
  /** penanda tangan (0–1), tampil di tengah bawah; kosongkan bila tanda tangan sudah ada di gambar latar */
  signers: CertificateSigner[];
  /** lama: posisi atas blok tanda tangan (desain unggahan); dipakai menurunkan signY untuk template lama */
  signTop: number;
  /** gambar tanda tangan (privat, storage/certificates), PNG transparan disarankan */
  signImageUrl: string | null;
  /** posisi tengah blok tanda tangan, % dari kiri */
  signX: number;
  /** posisi baris nama penanda tangan, % dari atas (null = bawaan: lihat signYOf) */
  signY: number | null;
  /** lebar gambar tanda tangan (pt; halaman A4 lanskap = 842 pt) */
  signWidth: number;
};

/** Posisi baris nama penanda tangan (% dari atas). Bawaan: desain POSI 89.4% (seperti sebelumnya), desain unggahan = blok lama signTop. */
export function signYOf(c: Pick<CertificateConfig, "signY" | "signTop">, sampleDesign: boolean) {
  if (c.signY != null) return c.signY;
  return sampleDesign ? 89.4 : Math.min(95, c.signTop + 10.4);
}
/** tinggi kotak gambar tanda tangan (pt) — gambar dimuat utuh (contain) di dalamnya */
export const signBoxHeight = (signWidth: number) => Math.round(signWidth * 0.5);

/** isi bawaan sesuai contoh sertifikat POSI */
export const DEFAULT_CERTIFICATE_BODY =
  "Atas partisipasinya dalam mengikuti kegiatan pelatihan Champion Online Class bidang **{kelas}** yang dilaksanakan secara daring mulai **tanggal {mulai} sampai tanggal {selesai}.**\n\nKami memberikan apresiasi setinggi-tingginya atas semangat, dedikasi dan keberhasilan dalam menyelesaikan seluruh rangkaian materi pelatihan dengan hasil yang {predikat}.";

export const DEFAULT_CERTIFICATE: CertificateConfig = {
  title: "SERTIFIKAT",
  subtitle: "PENGHARGAAN",
  intro: "Diserahkan kepada:",
  body: DEFAULT_CERTIFICATE_BODY,
  nameTop: 42,
  nameFont: "script",
  nameColor: "#133e57",
  textColor: "#0f2436",
  showNumber: true,
  place: "Medan",
  showDate: true,
  signers: [{ name: "Fahruroji Panjaitan, S.Pd, M.M", title: "" }],
  signTop: 74,
  signImageUrl: null,
  signX: 50,
  signY: null,
  signWidth: 150,
};

export const CERT_PLACEHOLDERS = [
  "{nama}",
  "{kelas}",
  "{bidang}",
  "{jenjang}",
  "{periode}",
  "{mulai}",
  "{selesai}",
  "{nilai}",
  "{grade}",
  "{predikat}",
  "{kehadiran}",
  "{nomor}",
  "{tanggal}",
];

const clampNum = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const color = (v: unknown, def: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : def);
const text = (v: unknown, def: string, max: number) => (typeof v === "string" ? v.slice(0, max) : def);

/** Gabungkan pengaturan tersimpan dengan bawaan (aman terhadap data rusak) */
export function readCertificateConfig(raw: unknown): CertificateConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CERTIFICATE;
  const signers = Array.isArray(r.signers)
    ? (r.signers as unknown[])
        .slice(0, 1)
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return { name: text(o.name, "", 80), title: text(o.title, "", 80) };
        })
        .filter((x) => x.name || x.title)
    : d.signers;
  return {
    title: text(r.title, d.title, 60),
    subtitle: text(r.subtitle, d.subtitle, 120),
    intro: text(r.intro, d.intro, 80),
    body: text(r.body, d.body, 800),
    nameTop: clampNum(r.nameTop, 10, 85, d.nameTop),
    nameFont: r.nameFont === "serif" || r.nameFont === "sans" ? r.nameFont : r.nameFont === "script" ? "script" : d.nameFont,
    nameColor: color(r.nameColor, d.nameColor),
    textColor: color(r.textColor, d.textColor),
    showNumber: typeof r.showNumber === "boolean" ? r.showNumber : d.showNumber,
    place: text(r.place, d.place, 40),
    showDate: typeof r.showDate === "boolean" ? r.showDate : d.showDate,
    signers,
    signTop: clampNum(r.signTop, 40, 92, d.signTop),
    signImageUrl: typeof r.signImageUrl === "string" && /^\/api\/admin\/sertifikat-bg\/[a-f0-9-]+\.(?:jpg|png)$/.test(r.signImageUrl) ? r.signImageUrl : null,
    signX: clampNum(r.signX, 15, 85, d.signX),
    signY: r.signY == null || r.signY === "" ? null : clampNum(r.signY, 40, 96, 89.4),
    signWidth: clampNum(r.signWidth, 60, 260, d.signWidth),
  };
}

export const PREDIKAT: Record<string, string> = { A: "Sangat Baik", B: "Baik", C: "Cukup", D: "Kurang", E: "Perlu Bimbingan" };

export function fillPlaceholders(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
/** Nomor sertifikat sesuai contoh POSI, mis. 723/POSI/OSN/IX/2026 (nomor urut berlanjut lintas semua kelas) */
export function certificateNumber(seq: number, date: Date) {
  const wib = new Date(date.getTime() + 7 * 3600_000);
  return `${seq}/POSI/OSN/${ROMAN[wib.getUTCMonth()]}/${wib.getUTCFullYear()}`;
}

/** "**tebal** biasa" → potongan teks (untuk PDF) */
export function boldSegments(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((t) => (t.startsWith("**") && t.endsWith("**") ? { bold: true, text: t.slice(2, -2) } : { bold: false, text: t }));
}

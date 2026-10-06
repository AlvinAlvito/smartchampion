/** Pengaturan desain PDF Soal & Pembahasan per kelas (aman untuk client & server). */
export type WorksheetPdfConfig = {
  /** margin halaman dalam mm (area di luar "kertas" konten) */
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** tampilkan kertas putih di atas latar agar teks tetap terbaca */
  paper: boolean;
};

export const DEFAULT_WORKSHEET_PDF: WorksheetPdfConfig = { marginTop: 16, marginBottom: 16, marginLeft: 14, marginRight: 14, paper: true };
export const MARGIN_RANGE = { min: 0, max: 45 };

const clamp = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MARGIN_RANGE.max, Math.max(MARGIN_RANGE.min, Math.round(n))) : d;
};

export function readWorksheetPdfConfig(raw: unknown): WorksheetPdfConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_WORKSHEET_PDF;
  return {
    marginTop: clamp(r.marginTop, d.marginTop),
    marginBottom: clamp(r.marginBottom, d.marginBottom),
    marginLeft: clamp(r.marginLeft, d.marginLeft),
    marginRight: clamp(r.marginRight, d.marginRight),
    paper: typeof r.paper === "boolean" ? r.paper : d.paper,
  };
}

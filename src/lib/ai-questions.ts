import "server-only";
import crypto from "node:crypto";
import { groqJson } from "./groq";
import { latexErrors, repairLatex } from "./latex";

export const AI_MAX_QUESTIONS = 25;
export const DIFFICULTIES = {
  mudah: "mudah",
  sedang: "sedang",
  sulit: "sulit (setara seleksi olimpiade)",
  campuran: "campuran (sekitar 30% mudah, 50% sedang, 20% sulit)",
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export type GeneratedQuestion = { text: string; options: string[]; answerIndex: number; explanation: string };

const JENJANG_DESC: Record<string, string> = {
  SD: "siswa SD (kelas 1-6)",
  SMP: "siswa SMP (kelas 7-9)",
  SMA: "siswa SMA (kelas 10-12)",
  UMUM: "peserta umum (pelajar SD sampai SMA)",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "options", "answerIndex", "explanation"],
        properties: {
          text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answerIndex: { type: "integer" },
          explanation: { type: "string" },
        },
      },
    },
  },
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();

/** Acak urutan opsi (AI cenderung menaruh jawaban benar di A/B). */
function shuffle(q: GeneratedQuestion): GeneratedQuestion {
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { ...q, options: idx.map((i) => q.options[i]), answerIndex: idx.indexOf(q.answerIndex) };
}

export async function generateQuestions(input: {
  /** game = kuis cepat berwaktu; worksheet = latihan pertemuan kelas (boleh lebih panjang) */
  kind?: "game" | "worksheet";
  title: string;
  subject: string;
  jenjang: string;
  description: string;
  secondsPerQuestion?: number;
  count: number;
  optionCount: number;
  difficulty: Difficulty;
  instructions: string;
  existing: string[];
}) {
  const english = /inggris|english/i.test(input.subject);
  const worksheet = input.kind === "worksheet";
  const system = [
    "Kamu adalah penyusun soal kuis pilihan ganda yang teliti untuk platform belajar Pelatihan POSI (persiapan olimpiade sains).",
    english
      ? "Tulis soal dan opsi dalam bahasa Inggris (mapelnya Bahasa Inggris); penjelasan boleh berbahasa Indonesia."
      : "Tulis soal dalam bahasa Indonesia yang baku dan jelas.",
    "Aturan wajib:",
    "- Setiap soal punya TEPAT satu jawaban benar; semua fakta dan hitungan harus benar (periksa ulang sebelum menjawab).",
    "- Pengecoh masuk akal (kesalahan umum siswa), tidak ada opsi kembar, jangan pakai opsi 'semua benar' atau 'tidak ada yang benar'.",
    worksheet
      ? "- Ini worksheet latihan pertemuan kelas (tanpa batas waktu per soal): soal boleh berupa hitungan/penalaran bertingkat, maksimal sekitar 400 karakter; opsi maksimal sekitar 120 karakter."
      : `- Soal dijawab dalam ${input.secondsPerQuestion} detik: kalimat soal ringkas (maksimal sekitar 200 karakter), opsi pendek (maksimal sekitar 60 karakter).`,
    "- Tanpa gambar atau tabel.",
    "- SEMUA rumus, angka berpangkat, pecahan, akar, limit, integral, sigma, simbol matematika/kimia/fisika WAJIB ditulis dengan LaTeX di antara tanda dolar, " +
      "mis. $\\frac{3}{4}$, $x^{2}+2x$, $\\sqrt{2}$, $\\lim_{x \\to 0} \\frac{\\sin x}{x}$, $\\int_{0}^{1} x\\,dx$, $\\sum_{k=1}^{n} k$, $H_{2}O$, $30^{\\circ}$. " +
      "Jangan menulis rumus dengan teks biasa seperti a/b, x^2, sqrt(2), lim_{x→0}. Teks biasa di luar tanda dolar. Opsi yang berupa rumus juga pakai $...$.",
    "- Pastikan LaTeX valid (kurung kurawal seimbang) dan jangan memakai tanda $ untuk hal lain (tulis mata uang sebagai 'Rp').",
    "- Jangan menulis huruf opsi (A/B/C) di dalam teks opsi.",
    "- answerIndex = indeks opsi yang benar (mulai dari 0).",
    "- explanation = pembahasan untuk siswa (2-3 kalimat, maksimal sekitar 350 karakter): jelaskan MENGAPA jawaban benar itu benar (konsep/langkah hitung singkat) " +
      "dan sebutkan kesalahan umum yang membuat siswa memilih pengecoh. Jangan menyebut huruf opsi (A/B/C) karena urutan opsi diacak; sebut isi jawabannya. Rumus juga pakai $...$.",
  ].join("\n");

  const user = [
    worksheet ? `Buat ${input.count} soal worksheet pilihan ganda untuk pertemuan kelas berikut:` : `Buat ${input.count} soal untuk game kuis berikut:`,
    `${worksheet ? "Kelas / pertemuan" : "Judul game"}: ${input.title}`,
    `Mata pelajaran: ${input.subject}`,
    `Sasaran: ${JENJANG_DESC[input.jenjang] ?? input.jenjang}`,
    input.description ? `${worksheet ? "Materi / catatan pertemuan" : "Deskripsi game"}: ${input.description}` : "",
    `Tingkat kesulitan: ${DIFFICULTIES[input.difficulty]}`,
    `Jumlah opsi per soal: tepat ${input.optionCount}.`,
    input.instructions ? `Instruksi tambahan dari admin (ikuti selama tidak melanggar aturan di atas): ${input.instructions}` : "",
    input.existing.length ? `Soal yang SUDAH ada (jangan diulang atau dibuat mirip):\n${input.existing.map((t) => `- ${t}`).join("\n")}` : "",
    "Variasikan topik dan bentuk soal agar tidak monoton.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await groqJson<{ questions: GeneratedQuestion[] }>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    "kuis_pilihan_ganda",
    SCHEMA,
  );

  // Validasi ketat hasil AI
  const seen = new Set(input.existing.map(norm));
  const out: GeneratedQuestion[] = [];
  let rejected = 0;
  for (const q of res.questions ?? []) {
    const text = repairLatex(String(q.text ?? "")).trim();
    const options = (q.options ?? []).map((o) => repairLatex(String(o)).trim()).filter(Boolean);
    const unique = new Set(options.map(norm)).size === options.length;
    const ok =
      text.length >= 5 &&
      options.length >= 2 &&
      options.length <= 5 &&
      unique &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 &&
      q.answerIndex < options.length &&
      !seen.has(norm(text)) &&
      // rumus harus bisa dirender (LaTeX valid)
      [text, ...options].every((t) => latexErrors(t).length === 0);
    const explanation = repairLatex(String(q.explanation ?? "")).trim();
    if (!ok) {
      rejected++;
      continue;
    }
    seen.add(norm(text));
    out.push(
      shuffle({
        text: text.slice(0, worksheet ? 1500 : 500),
        options: options.map((o) => o.slice(0, worksheet ? 400 : 200)),
        answerIndex: q.answerIndex,
        // pembahasan dengan rumus rusak dikosongkan (soal tetap dipakai)
        explanation: latexErrors(explanation).length ? "" : explanation.slice(0, 800),
      }),
    );
    if (out.length >= input.count) break;
  }
  return { questions: out, rejected };
}

const EXPLAIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "explanation"],
        properties: { id: { type: "integer" }, explanation: { type: "string" } },
      },
    },
  },
};

/** Pembahasan untuk soal yang sudah ada (kunci jawaban dari admin dianggap benar). Hasil: id soal → pembahasan valid. */
export async function generateExplanations(input: {
  subject: string;
  jenjang: string;
  questions: { id: number; text: string; options: string[]; answerIndex: number }[];
}) {
  const system = [
    "Kamu guru yang menulis pembahasan soal pilihan ganda untuk platform belajar Pelatihan POSI.",
    "Untuk setiap soal: tulis pembahasan 2-3 kalimat (maksimal sekitar 350 karakter) dalam bahasa Indonesia yang ramah untuk siswa:",
    "jelaskan MENGAPA kunci jawaban benar (konsep / langkah hitung singkat) dan kesalahan umum yang membuat siswa memilih pengecoh.",
    "Kunci jawaban yang diberikan dianggap benar. Jangan menyebut huruf opsi (A/B/C) — sebut isi jawabannya.",
    "Rumus, pangkat, pecahan, simbol ditulis LaTeX di antara tanda dolar, mis. $\\frac{1}{2}$, $x^{2}$. Jangan pakai $ untuk hal lain.",
    "Kembalikan id yang sama persis dengan id soal.",
  ].join("\n");
  const user = [
    `Mata pelajaran: ${input.subject} · Sasaran: ${JENJANG_DESC[input.jenjang] ?? input.jenjang}`,
    ...input.questions.map(
      (q) => `[id ${q.id}] ${q.text}\nOpsi: ${q.options.map((o, i) => `(${i + 1}) ${o}`).join(" | ")}\nKunci: ${q.options[q.answerIndex]}`,
    ),
  ].join("\n\n");
  const res = await groqJson<{ items: { id: number; explanation: string }[] }>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    "pembahasan_soal",
    EXPLAIN_SCHEMA,
    { temperature: 0.4 },
  );
  const ids = new Set(input.questions.map((q) => q.id));
  const out = new Map<number, string>();
  for (const it of res.items ?? []) {
    const text = repairLatex(String(it.explanation ?? ""))
      .trim()
      .slice(0, 800);
    if (ids.has(Number(it.id)) && text.length >= 10 && !latexErrors(text).length) out.set(Number(it.id), text);
  }
  return out;
}

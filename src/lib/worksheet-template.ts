import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Math as DocMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSuperScript,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

/** Template Word impor soal worksheet (label sama dengan yang dibaca worksheet-docx.ts) */

const BLUE = "1A6F9F";
const NAVY = "0F2436";
const BOX = { style: BorderStyle.SINGLE, size: 8, space: 4, color: "C9DDEC" };
const FONT = "Calibri";

const label = (text: string) =>
  new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text, bold: true, color: BLUE, size: 21, font: FONT })] });
const box = (children: (TextRun | ImageRun | DocMath)[] = []) =>
  new Paragraph({
    spacing: { after: 60 },
    border: { top: BOX, bottom: BOX, left: BOX, right: BOX },
    children: children.length ? children : [new TextRun({ text: "", size: 22 })],
  });
const t = (text: string, opts: { bold?: boolean; italics?: boolean; color?: string } = {}) => new TextRun({ text, size: 22, font: FONT, ...opts });

function block(no: number, content?: { text: (Paragraph | Table)[]; options: string[]; key: string; points: string; explanation: Paragraph[] }) {
  const head = new Paragraph({
    spacing: { before: 360, after: 120 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "EAF4FB" },
    children: [new TextRun({ text: `SOAL ${no}`, bold: true, color: NAVY, size: 26, font: FONT })],
  });
  return [
    head,
    label("SOAL"),
    ...(content?.text ?? [box()]),
    ...["A", "B", "C", "D", "E"].flatMap((l, i) => [label(`JAWABAN ${l}`), box(content?.options[i] ? [t(content.options[i])] : [])]),
    label("KUNCI JAWABAN"),
    box(content ? [t(content.key, { bold: true })] : []),
    label("POIN"),
    box([t(content?.points ?? "10")]),
    label("PEMBAHASAN"),
    ...(content?.explanation ?? [box()]),
  ];
}

export async function buildWorksheetTemplate(info: { className?: string; meetingTitle?: string; blocks?: number } = {}) {
  const blocks = Math.min(Math.max(info.blocks ?? 10, 1), 50);
  const sample = await fs.readFile(path.join(process.cwd(), "assets", "brand", "champy.png")).catch(() => null);

  const example = {
    text: [
      box([t("Perhatikan gambar, tabel, dan rumus berikut. Ini contoh soal lengkap — hapus/ganti dengan soal Anda.")]),
      ...(sample ? [box([new ImageRun({ type: "png", data: sample, transformation: { width: 120, height: 138 } })])] : []),
      new Table({
        width: { size: 4800, type: WidthType.DXA },
        columnWidths: [2400, 2400],
        rows: [
          ["Benda", "Massa (kg)"],
          ["A", "2"],
          ["B", "5"],
        ].map(
          (r, ri) =>
            new TableRow({
              children: r.map(
                (c) =>
                  new TableCell({
                    width: { size: 2400, type: WidthType.DXA },
                    shading: ri === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "EAF4FB" } : undefined,
                    children: [new Paragraph({ children: [t(c, { bold: ri === 0 })] })],
                  }),
              ),
            }),
        ),
      }),
      box([
        t("Hitung nilai "),
        new DocMath({
          children: [
            new MathRun("x"),
            new MathRun(" = "),
            new MathFraction({
              numerator: [new MathSuperScript({ children: [new MathRun("a")], superScript: [new MathRun("2")] }), new MathRun(" + 12")],
              denominator: [new MathRun("3")],
            }),
          ],
        }),
        t(" jika a = 6."),
      ]),
    ],
    options: ["14", "16", "18", "20", "22"],
    key: "B",
    points: "10",
    explanation: [
      box([t("Substitusikan a = 6:")]),
      box([
        new DocMath({
          children: [
            new MathRun("x = "),
            new MathFraction({ numerator: [new MathRun("36 + 12")], denominator: [new MathRun("3")] }),
            new MathRun(" = 16, "),
            new MathRadical({ children: [new MathRun("16")] }),
            new MathRun(" = 4"),
          ],
        }),
      ]),
      box([t("Jadi jawabannya B.")]),
    ],
  };

  const doc = new Document({
    creator: "Pelatihan POSI",
    title: "Template Import Soal Worksheet",
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "TEMPLATE IMPORT SOAL WORKSHEET", bold: true, size: 32, color: NAVY, font: FONT })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: "Pelatihan POSI · Smart Champion", color: BLUE, size: 22, font: FONT })],
          }),
          ...(info.className || info.meetingTitle
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                  children: [t([info.className, info.meetingTitle].filter(Boolean).join(" — "), { italics: true, color: "5F8BAB" })],
                }),
              ]
            : []),
          ...[
            "Isi hanya di bawah label yang sesuai. Jangan ubah tulisan label (SOAL n, SOAL, JAWABAN A–E, KUNCI JAWABAN, POIN, PEMBAHASAN) atau urutannya.",
            "SOAL dan PEMBAHASAN boleh berisi teks, gambar (PNG/JPG), tabel, dan rumus. Buat rumus dengan Insert › Equation (otomatis diubah ke LaTeX), atau tulis LaTeX langsung di antara tanda $, mis. $\\frac{1}{2}$.",
            "Isi minimal 2 jawaban. JAWABAN E (dan D) boleh dikosongkan. KUNCI JAWABAN diisi satu huruf, mis. B. POIN default 10.",
            'Perlu lebih banyak soal? Salin satu blok "SOAL n" lengkap lalu ubah nomornya. Blok yang dibiarkan kosong otomatis dilewati.',
            "Setelah diunggah, hasil impor tampil sebagai pratinjau dulu — soal yang perlu dicek akan ditandai sebelum disimpan.",
          ].map((s) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [t(s)] })),
          ...block(1, example),
          ...Array.from({ length: blocks - 1 }, (_, i) => block(i + 2)).flat(),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

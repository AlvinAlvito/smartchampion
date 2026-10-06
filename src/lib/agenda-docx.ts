import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import {
  MAIN_CATEGORIES,
  PRACTICAL_TOTAL,
  WEEKDAYS,
  dateToYmd,
  daysText,
  fmtLong,
  fmtShort,
  isoWeekday,
  ldCode,
  lines,
  periodText,
  rangeShort,
  type JobCategoryKey,
} from "./jobdesk-shared";
import type { JobWeekData } from "./jobdesk";

/**
 * Agenda Pekanan (.docx) dengan format persis file contoh AP_week40_IT.docx:
 * templat `assets/agenda/agenda-template.docx` (gaya, header, footer, tema, ukuran halaman asli),
 * isi dokumen dibangun dari lembar pekan + weekly jobdesk + daily jobdesk.
 */

const TEMPLATE = path.join(process.cwd(), "assets", "agenda", "agenda-template.docx");

/* ---------------- XML helpers (meniru potongan XML file contoh) ---------------- */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // karakter kontrol tidak sah di XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

type RunOpt = { b?: boolean; color?: string; sz?: number };
function r(text: string, o: RunOpt = {}) {
  const rpr = `${o.b ? "<w:b/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ""}`;
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

type ParaOpt = { style?: string; jc?: "center" | "left"; before?: number; after?: number; ind?: boolean };
function p(runs: string | string[], o: ParaOpt = {}) {
  const spacing =
    o.before != null || o.after != null
      ? `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ""}${o.after != null ? ` w:after="${o.after}"` : ""}/>`
      : "";
  const ppr = `${o.style ? `<w:pStyle w:val="${o.style}"/>` : ""}${spacing}${o.ind ? `<w:ind w:left="259" w:hanging="202"/>` : ""}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}`;
  return `<w:p><w:pPr>${ppr}<w:rPr><w:rFonts w:hint="eastAsia"/></w:rPr></w:pPr>${Array.isArray(runs) ? runs.join("") : runs}</w:p>`;
}
const h1 = (text: string) => `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${r(text)}</w:p>`;
const pageBreak = () => `<w:p><w:pPr><w:rPr><w:rFonts w:hint="eastAsia"/></w:rPr></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`;
const smallNote = (runs: string | string[], center = false) => p(runs, { style: "SmallNote", jc: center ? "center" : undefined });

const MAR = (v: number, h: number) =>
  `<w:tcMar><w:top w:w="${v}" w:type="dxa"/><w:left w:w="${h}" w:type="dxa"/><w:bottom w:w="${v}" w:type="dxa"/><w:right w:w="${h}" w:type="dxa"/></w:tcMar>`;
function cell(width: number, content: string, o: { fill?: string; margin?: [number, number]; vCenter?: boolean } = {}) {
  const [v, h] = o.margin ?? [80, 90];
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ""}${MAR(v, h)}${o.vCenter === false ? "" : `<w:vAlign w:val="center"/>`}</w:tcPr>${content || p("")}</w:tc>`;
}
const row = (cells: string[], header = false) =>
  `<w:tr><w:trPr><w:cantSplit/>${header ? "<w:tblHeader/>" : ""}<w:jc w:val="center"/></w:trPr>${cells.join("")}</w:tr>`;
function table(grid: number[], rows: string[], o: { style?: boolean; fixed?: boolean } = {}) {
  return `<w:tbl><w:tblPr>${o.style === false ? "" : `<w:tblStyle w:val="TableGrid"/>`}<w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>${o.fixed === false ? "" : `<w:tblLayout w:type="fixed"/>`}<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

/* ---------------- isi dokumen ---------------- */

const LABEL_UPPER: Record<JobCategoryKey, string> = {
  PRIORITAS: "PRIORITAS",
  SISTEM: "PERBAIKAN SISTEM",
  PEOPLE: "PEOPLE & KINERJA",
  OPERASIONAL: "OPERASIONAL",
};
const LABEL_ROW: Record<JobCategoryKey, string> = { PRIORITAS: "Prioritas", SISTEM: "Sistem", PEOPLE: "People & Kinerja", OPERASIONAL: "Operasional" };
const ROW_FILL: Record<JobCategoryKey, string> = { PRIORITAS: "EAF2F8", SISTEM: "EAF4EA", PEOPLE: "EAF4EA", OPERASIONAL: "F3F5F7" };

const ymd = (d: Date | null | undefined) => (d ? dateToYmd(d) : null);
const shortText = (s: string, max = 220) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);
const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : s.trim() + ".");

export type AgendaDocInput = { ownerName: string; year: number; week: number; data: JobWeekData; roleTitle?: string };

export function buildAgendaBody({ ownerName, year, week, data, roleTitle = "Admin Pelatihan" }: AgendaDocInput) {
  const plan = data.plan;
  const agendas = plan?.agendas ?? [];
  const main = MAIN_CATEGORIES.flatMap((c) => agendas.filter((a) => a.category === c));
  const ops = agendas.filter((a) => a.category === "OPERASIONAL");
  const dailies = data.dailies;
  const period = periodText(year, week);
  const out: string[] = [];

  // nomor per kategori: Prioritas 1, Prioritas 2, Sistem 1, ...
  const numberOf = new Map<number, number>();
  for (const c of MAIN_CATEGORIES) agendas.filter((a) => a.category === c).forEach((a, i) => numberOf.set(a.id, i + 1));

  /* ----- sampul ----- */
  out.push(p(r("AGENDA PEKANAN", { b: true, color: "17365D", sz: 52 }), { before: 520, jc: "center" }));
  out.push(p(r(plan?.roleTitle || `${roleTitle} • ${ownerName}`, { b: true, color: "1F6D63", sz: 24 }), { jc: "center" }));
  out.push(p(r(`Pekan ${week}  •  Periode ${period}`, { color: "666666", sz: 22 }), { jc: "center" }));
  const focus = lines(plan?.focus);
  const focusLines = focus.length ? focus : main.map((a) => (a.objective ? `${a.title}: ${a.objective}` : a.title));
  out.push(
    table(
      [10224],
      [
        row([
          cell(
            10224,
            [
              p(r("Fokus pekan ini", { b: true, color: "17365D", sz: 22 }), { after: 80 }),
              ...(focusLines.length ? focusLines : ["Belum ada agenda utama pekan ini."]).map((l) => p(r(`• ${sentence(l)}`), { after: 40 })),
            ].join(""),
            { fill: "EAF2F8", margin: [180, 180], vCenter: false },
          ),
        ]),
      ],
      { style: false },
    ),
  );
  out.push(smallNote(r("Disusun mengikuti kerangka Panduan Agenda Pekanan: Prioritas, Perbaikan Sistem, People & Kinerja, serta uji 3LD."), true));
  out.push(pageBreak());

  let n = 0;
  /* ----- 1. konteks ----- */
  out.push(h1(`${++n}. Konteks Peran dan Prinsip Penyusunan`));
  if (plan?.context) out.push(p([r("Peran utama: ", { b: true }), r(plan.context)]));
  out.push(
    p([
      r("Prinsip 3LD: ", { b: true }),
      r(
        "setiap agenda utama harus (1) langsung dapat dikerjakan, (2) langsung dapat diselesaikan dalam 1 pekan atau memiliki output antara yang jelas, dan (3) langsung dapat dinikmati/dimanfaatkan oleh penerima hasil.",
      ),
    ]),
  );

  /* ----- 2. ringkasan ----- */
  out.push(h1(`${++n}. Ringkasan Agenda Pekanan`));
  const SUM = [1296, 2304, 3672, 1152, 936, 936];
  const head = ["Kategori", "Agenda", "Ukuran selesai", "PIC", "Tenggat", "3LD"].map((t, i) =>
    cell(SUM[i], p(r(t, { b: true, color: "FFFFFF", sz: 17 }), { jc: "center" }), { fill: "17365D" }),
  );
  const sumRows = main.map((a) =>
    row([
      cell(SUM[0], p(r(`${LABEL_ROW[a.category]} ${numberOf.get(a.id)}`, { b: true, sz: 16 })), { fill: ROW_FILL[a.category] }),
      cell(SUM[1], p(r(a.title + (a.done ? " ✓" : ""), { sz: 16 }))),
      cell(SUM[2], p(r(a.doneMeasure ?? "-", { sz: 16 }))),
      cell(SUM[3], p(r(a.pic ?? ownerName, { sz: 16 }))),
      cell(SUM[4], p(r(rangeShort(null, ymd(a.dueDate)) || "-", { sz: 16 }))),
      cell(SUM[5], p(r(ldCode(a), { sz: 16 }))),
    ]),
  );
  if (!sumRows.length) sumRows.push(row(SUM.map((w, i) => cell(w, p(r(i === 1 ? "Belum ada agenda utama." : "", { sz: 16 }))))));
  out.push(table(SUM, [row(head, true), ...sumRows]));
  const count = (c: JobCategoryKey) => agendas.filter((a) => a.category === c).length;
  const total = main.length;
  const inRange = total >= PRACTICAL_TOTAL.min && total <= PRACTICAL_TOTAL.max;
  out.push(
    smallNote(
      r(
        `Catatan: total agenda utama = ${total}, ${inRange ? "masih dalam" : "di luar"} jumlah praktis ${PRACTICAL_TOTAL.min}–${PRACTICAL_TOTAL.max} (${count("PRIORITAS")} prioritas, ${count("SISTEM")} sistem, ${count("PEOPLE")} people/kinerja). Kolom 3LD: K = dikerjakan, S = diselesaikan, N = dinikmati.`,
      ),
      true,
    ),
  );

  /* ----- 3.. detail tiap agenda ----- */
  const DET = [2232, 7488];
  const detRow = (label: string, value: string) =>
    row([
      cell(DET[0], p(r(label, { b: true, color: "17365D", sz: 17 })), { fill: "F3F5F7" }),
      cell(
        DET[1],
        (value || "-")
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((l) => p(r(l, { sz: 17 })))
          .join("") || p(r("-", { sz: 17 })),
      ),
    ]);
  for (const a of main) {
    out.push(h1(`${++n}. ${a.title}`));
    out.push(
      p([r(`${LABEL_UPPER[a.category]} ${numberOf.get(a.id)}`, { b: true, color: "1F6D63" }), ...(a.objective ? [r(`  |  ${a.objective}`)] : [])], {
        after: 120,
      }),
    );
    const due = ymd(a.dueDate);
    const linked = dailies.filter((d) => d.weeklyId === a.id);
    const rows = [
      detRow("Ukuran selesai", a.doneMeasure ?? ""),
      detRow("Lead measure", a.leadMeasure ?? ""),
      detRow("PIC / Tenggat", `${a.pic ?? ownerName} / ${due ? fmtLong(due) : "-"}`),
      detRow("LD-1 • Dikerjakan", a.ld1 ?? (a.ld1Ok ? "Ya" : "Belum lolos")),
      detRow("LD-2 • Diselesaikan", a.ld2 ?? (a.ld2Ok ? "Ya" : "Belum lolos")),
      detRow("LD-3 • Dinikmati", a.ld3 ?? (a.ld3Ok ? "Ya" : "Belum lolos")),
      detRow(
        "Status",
        `${a.done ? `Selesai${a.doneAt ? ` (${fmtLong(dateToYmd(new Date(a.doneAt.getTime() + 7 * 3600_000)))})` : ""}` : "Belum selesai"}${linked.length ? ` • jobdesk harian terkait ${linked.filter((d) => d.done).length}/${linked.length} selesai` : ""}`,
      ),
    ];
    if (a.rootNote) rows.push(detRow("Catatan evaluasi", `${a.rootNote}${a.rootNoteBy ? ` — ${a.rootNoteBy}` : ""}`));
    out.push(table(DET, rows));
    const steps = lines(a.steps);
    if (steps.length || linked.length) {
      out.push(p(r("Langkah kerja pekan ini", { b: true, color: "17365D" }), { before: 100, after: 40 }));
      for (const s of steps) out.push(p(r(`• ${sentence(s)}`), { after: 30, ind: true }));
      for (const d of linked) out.push(p(r(`${d.done ? "☑" : "☐"} ${fmtShort(dateToYmd(d.date))} — ${sentence(d.title)}`), { after: 30, ind: true }));
    }
    if (a.beneficiaries) out.push(smallNote([r("Penerima manfaat: ", { b: true }), r(sentence(a.beneficiaries))]));
  }

  /* ----- operasional (BAU) + rutin harian ----- */
  const routines = data.routines.filter((rt) => rt.isActive);
  if (ops.length || routines.length) {
    out.push(h1(`${++n}. Pekerjaan Operasional yang Tidak Dijadikan Agenda 3LD Utama`));
    out.push(
      p(
        r(
          "Pekerjaan berikut tetap berjalan, tetapi sifatnya rutin, kondisional, atau belum memiliki tenggat/ukuran selesai yang cukup sempit. Karena itu, pekerjaan ini ditempatkan sebagai BAU/standby atau NEXT, bukan menambah daftar prioritas utama pekan ini.",
        ),
      ),
    );
    const OPS = [2556, 2556, 2556, 2556];
    const opsHead = ["Pekerjaan", "Status", "Alasan", "Cara menangani pekan ini"].map((t, i) =>
      cell(OPS[i], p(r(t, { b: true, color: "FFFFFF", sz: 17 })), { fill: "1F6D63" }),
    );
    const opsRows = ops.map((a) =>
      row([
        cell(OPS[0], p(r(a.title, { b: true, sz: 16 }))),
        cell(OPS[1], p(r(a.opsStatus ?? "BAU", { sz: 16 }))),
        cell(OPS[2], p(r(a.opsReason ?? "-", { sz: 16 }))),
        cell(OPS[3], p(r(a.opsHandling ?? a.steps ?? "-", { sz: 16 }))),
      ]),
    );
    for (const rt of routines) {
      const days = rt.weekdays.split(",").map(Number);
      const inst = dailies.filter((d) => d.routineId === rt.id);
      const dayText = daysText(days);
      opsRows.push(
        row([
          cell(OPS[0], p(r(rt.title, { b: true, sz: 16 }))),
          cell(OPS[1], p(r("BAU / rutin harian", { sz: 16 }))),
          cell(
            OPS[2],
            p(
              r(
                `Pekerjaan rutin (${dayText}${rt.dueTime ? `, maks. ${rt.dueTime}` : ""}); ${inst.filter((d) => d.done).length}/${inst.length} terlaksana pekan ini.`,
                { sz: 16 },
              ),
            ),
          ),
          cell(OPS[3], p(r(rt.notes ?? "Dikerjakan sesuai jadwal rutin dan dicentang di checklist harian.", { sz: 16 }))),
        ]),
      );
    }
    out.push(table(OPS, [row(opsHead, true), ...opsRows], { fixed: false }));
  }

  /* ----- urutan eksekusi ----- */
  type Exec = { sort: string; label: string; title: string; desc: string };
  const exec: Exec[] = [];
  for (const a of main) {
    const start = ymd(a.startDate);
    const due = ymd(a.dueDate);
    if (!start && !due) continue;
    const linked = dailies.filter((d) => d.weeklyId === a.id).map((d) => d.title);
    const desc = linked.length ? linked.join(", ") : lines(a.steps).join(", ") || a.doneMeasure || "";
    exec.push({ sort: start ?? due!, label: rangeShort(start, due), title: a.title, desc: shortText(desc) });
  }
  const loose = new Map<string, string[]>();
  for (const d of dailies) {
    if (d.weeklyId || d.routineId) continue;
    const key = dateToYmd(d.date);
    loose.set(key, [...(loose.get(key) ?? []), d.title + (d.done ? " ✓" : "")]);
  }
  for (const [day, titles] of loose)
    exec.push({ sort: day, label: fmtShort(day), title: `Jobdesk harian ${WEEKDAYS[isoWeekday(day) - 1].long}`, desc: shortText(titles.join(", "), 300) });
  exec.sort((a, b) => a.sort.localeCompare(b.sort));
  if (exec.length) {
    out.push(h1(`${++n}. Urutan Eksekusi Berdasarkan Tenggat`));
    for (const e of exec)
      out.push(p([r(`${e.label} — `, { b: true, color: "17365D" }), r(`${e.title}: `, { b: true }), r(sentence(e.desc || "-"))], { after: 60 }));
  }

  /* ----- checklist review ----- */
  out.push(h1(`${++n}. Checklist Review Akhir Pekan`));
  for (const a of main) {
    const m = a.doneMeasure ? ` (${shortText(a.doneMeasure.replace(/\s+/g, " "), 140).replace(/[.]$/, "")})` : "";
    out.push(
      p(r(`${a.done ? "☑" : "☐"} Apakah agenda “${a.title}” sudah selesai sesuai ukuran selesai${m}, bukan hanya “hampir selesai”?`), { after: 40, ind: true }),
    );
  }
  const doneDaily = dailies.filter((d) => d.done).length;
  if (dailies.length) {
    const pct = Math.round((doneDaily / dailies.length) * 100);
    out.push(p(r(`${pct === 100 ? "☑" : "☐"} Jobdesk harian pekan ini: ${doneDaily} dari ${dailies.length} terlaksana (${pct}%).`), { after: 40, ind: true }));
  }
  out.push(
    p(r("☐ Hambatan dan manfaat yang sudah dinikmati tercatat, serta tindak lanjut untuk pekan berikutnya sudah ditentukan?"), { after: 40, ind: true }),
  );

  /* ----- catatan evaluasi root ----- */
  if (plan?.reviewNote) {
    out.push(h1(`${++n}. Catatan Evaluasi`));
    for (const l of plan.reviewNote.split(/\r?\n/).filter((x) => x.trim())) out.push(p(r(l)));
    if (plan.reviewNoteBy)
      out.push(
        smallNote(r(`— ${plan.reviewNoteBy}${plan.reviewNoteAt ? `, ${fmtLong(dateToYmd(new Date(plan.reviewNoteAt.getTime() + 7 * 3600_000)))}` : ""}`)),
      );
  }

  /* ----- kesimpulan ----- */
  const prio = agendas.filter((a) => a.category === "PRIORITAS").map((a) => a.title);
  const conclusion = plan?.conclusion || (prio.length ? `fokus utama pekan ini adalah ${prio.join("; ")}.` : "");
  if (conclusion) out.push(p([r("Kesimpulan agenda pekan ini: ", { b: true }), r(conclusion)], { before: 160 }));

  return out.join("");
}

export async function buildAgendaDocx(input: AgendaDocInput) {
  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE));
  const period = periodText(input.year, input.week);
  const doc = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", doc.replace("{{BODY}}", buildAgendaBody(input)));
  const footer = await zip.file("word/footer1.xml")!.async("string");
  zip.file("word/footer1.xml", footer.replace("{{FOOTER}}", esc(`Agenda Pekanan ${input.ownerName} • ${period}`)));
  const core = await zip.file("docProps/core.xml")!.async("string");
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file(
    "docProps/core.xml",
    core
      .replace("{{TITLE}}", esc(`Agenda Pekanan ${input.ownerName} – Pekan ${input.week}`))
      .replace("{{AUTHOR}}", esc(`YP POSI - ${input.ownerName}`))
      .replaceAll("{{NOW}}", now),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** "AP_week40_Devia.docx" */
export const agendaFileName = (week: number, ownerName: string) =>
  `AP_week${String(week).padStart(2, "0")}_${
    ownerName
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_") || "Admin"
  }.docx`;

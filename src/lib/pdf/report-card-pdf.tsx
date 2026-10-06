import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { StudentReport } from "@/lib/class-report";
import { SANS, registerFonts } from "./fonts";

/**
 * Rapor format Champion's Online Class (mengikuti contoh rapor POSI):
 * latar desain asli (kucing, judul, pita RAPORT, Grading System) + isian otomatis:
 * Nama, Kelas, tabel LEARNING | QUARTERLY GRADE (Work Sheet 1..n + Try Out), dan huruf GRADING.
 * Koordinat dalam pt untuk A4 tegak (595 × 842), diukur dari gambar latar 1414 × 2000 px.
 */

const BG_FILE = path.join(process.cwd(), "assets", "report", "latar-rapor.jpg");
let bgCache: Buffer | null | undefined;
function background() {
  if (bgCache === undefined) bgCache = fs.existsSync(BG_FILE) ? fs.readFileSync(BG_FILE) : null;
  return bgCache;
}

const W = 595;
const H = 841;
const INK = "#1f1f1f";
const ROW_LINE = "#efe2b4";
// area tabel (di bawah kepala LEARNING / QUARTERLY GRADE) & kolom-kolomnya
const TABLE = { top: 305, bottom: 590, leftX: 60, leftW: 284, rightX: 354, rightW: 187 };

const fmt = (v: number | null) => (v == null ? "-" : Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));

function ReportCard({ r }: { r: StudentReport }) {
  const bg = background();
  const rows = [...r.meetings.map((m) => ({ label: `Work Sheet ${m.number}`, value: m.score })), { label: "Try Out", value: r.summary.tryout }];
  const gap = 1.6;
  const rowH = Math.min(32, (TABLE.bottom - TABLE.top) / rows.length) - gap;
  const fontSize = rowH >= 24 ? 10.5 : rowH >= 18 ? 9 : 7.5;
  const nameSize = r.student.name.length > 34 ? 10 : 11.5;
  const kelas = r.product.name.toUpperCase();
  return (
    <Document title={`Rapor ${r.student.name} — ${r.product.name}`} author="Pelatihan POSI" creator="Pelatihan POSI">
      <Page size="A4" style={{ fontFamily: SANS, color: INK, position: "relative", backgroundColor: "#f6f2e3" }}>
        {bg && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={{ data: bg, format: "jpg" }} style={{ position: "absolute", top: 0, left: 0, width: W, height: H }} />
        )}

        {/* Nama & Kelas (di atas garis isian) */}
        <Text style={{ position: "absolute", top: 184, left: 116, width: 300, fontSize: nameSize, fontWeight: 700 }}>{r.student.name}</Text>
        <Text style={{ position: "absolute", top: 219, left: 116, width: 305, fontSize: kelas.length > 52 ? 8 : 9.5 }}>{kelas}</Text>

        {/* Tabel nilai */}
        {rows.map((row, i) => {
          const top = TABLE.top + i * (rowH + gap);
          const cell = {
            position: "absolute" as const,
            top,
            height: rowH,
            backgroundColor: "#ffffff",
            borderRadius: 6,
            borderBottomWidth: 1.2,
            borderBottomColor: ROW_LINE,
            justifyContent: "center" as const,
          };
          return (
            <View key={i}>
              <View style={{ ...cell, left: TABLE.leftX, width: TABLE.leftW }}>
                <Text style={{ textAlign: "center", fontSize }}>{row.label}</Text>
              </View>
              <View style={{ ...cell, left: TABLE.rightX, width: TABLE.rightW }}>
                <Text style={{ textAlign: "center", fontSize: fontSize + 0.5 }}>{fmt(row.value)}</Text>
              </View>
            </View>
          );
        })}

        {/* GRADING */}
        <Text style={{ position: "absolute", top: 766, left: 60, width: 329, textAlign: "center", fontSize: 30, fontWeight: 800 }}>
          {r.summary.grade ?? "-"}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderReportCardPdf(r: StudentReport) {
  registerFonts();
  return renderToBuffer(<ReportCard r={r} />);
}

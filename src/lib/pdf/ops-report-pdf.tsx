import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Kpi, OpsReport } from "@/lib/ops-performance";
import { GROUP_COLOR, GROUP_LABEL } from "@/lib/activity-shared";
import { formatDate } from "@/lib/utils";

/* Laporan performa Admin SmartChampion (PDF) — gaya sama dengan laporan performa Admin Pelatihan */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const hasFont = fs.existsSync(path.join(FONT_DIR, "PlusJakartaSans-400.ttf"));
const FAMILY = hasFont ? "Jakarta" : "Helvetica";
if (hasFont) {
  Font.register({
    family: "Jakarta",
    fonts: [400, 600, 700, 800].map((w) => ({ src: path.join(FONT_DIR, `PlusJakartaSans-${w}.ttf`), fontWeight: w })),
  });
}
Font.registerHyphenationCallback((word) => [word]);

const C = { navy: "#0f2436", navy2: "#183349", text: "#22445f", muted: "#5f8bab", line: "#dfeaf2", soft: "#f4f8fb", brand: "#1a6f9f", emerald: "#10b981", amber: "#f59e0b", rose: "#e11d48" };
const GROUPS = Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[];
const ST: Record<Kpi["status"], { label: string; color: string }> = {
  baik: { label: "Tercapai", color: C.emerald },
  cukup: { label: "Hampir", color: C.amber },
  kurang: { label: "Perlu perhatian", color: C.rose },
  na: { label: "Belum ada data", color: C.muted },
};

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 8.5, color: C.text, paddingTop: 42, paddingBottom: 46, paddingHorizontal: 34 },
  runningHead: { position: "absolute", top: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted },
  footer: { position: "absolute", bottom: 20, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted, borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 6 },
  hero: { backgroundColor: C.navy, borderRadius: 14, padding: 20, marginTop: -16, marginBottom: 16, color: "#fff" },
  heroEyebrow: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1.5, color: "#84c3e5" },
  heroTitle: { fontSize: 20, fontWeight: 800, marginTop: 4 },
  heroSub: { fontSize: 10, color: "#cfe3f0", marginTop: 2 },
  heroMeta: { flexDirection: "row", marginTop: 14, gap: 8 },
  heroChip: { backgroundColor: C.navy2, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9, flexGrow: 1 },
  chipLabel: { fontSize: 6.5, color: "#a5c3d6" },
  chipValue: { fontSize: 11, fontWeight: 800, color: "#fff", marginTop: 1 },
  h2: { flexDirection: "row", alignItems: "center", marginBottom: 8, marginTop: 6 },
  h2Num: { width: 18, height: 18, borderRadius: 6, backgroundColor: C.brand, color: "#fff", fontSize: 8.5, fontWeight: 800, textAlign: "center", paddingTop: 3.5, marginRight: 7 },
  h2Text: { fontSize: 13, fontWeight: 800, color: C.navy },
  card: { borderWidth: 0.7, borderColor: C.line, borderRadius: 10, padding: 11, marginBottom: 10 },
  th: { fontSize: 6.8, fontWeight: 700, color: C.muted, paddingVertical: 4 },
  td: { fontSize: 8, paddingVertical: 3.5 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line },
  empty: { fontSize: 8, color: C.muted, paddingVertical: 12, textAlign: "center" },
});

const num = (n: number) => n.toLocaleString("id-ID");

function H2({ n, title }: { n: number; title: string }) {
  return (
    <View style={s.h2} wrap={false}>
      <Text style={s.h2Num}>{n}</Text>
      <Text style={s.h2Text}>{title}</Text>
    </View>
  );
}

function Table<T>({ cols, rows, empty }: { cols: { h: string; w: string; v: (r: T) => string | number; right?: boolean }[]; rows: T[]; empty: string }) {
  if (!rows.length) return <Text style={s.empty}>{empty}</Text>;
  return (
    <View>
      <View style={[s.tr, { borderBottomColor: C.muted }]} fixed>
        {cols.map((c) => (
          <Text key={c.h} style={[s.th, { width: c.w, textAlign: c.right ? "right" : "left" }]}>
            {c.h.toUpperCase()}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.tr} wrap={false}>
          {cols.map((c) => (
            <Text key={c.h} style={[s.td, { width: c.w, textAlign: c.right ? "right" : "left" }]}>
              {String(c.v(r))}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Batang bertumpuk per hari/pekan (warna per kelompok menu) */
function StackChart({ data }: { data: OpsReport["trend"] }) {
  const totals = data.map((d) => GROUPS.reduce((n, g) => n + Number(d[g]), 0));
  const max = Math.max(1, ...totals);
  if (!totals.some(Boolean)) return <Text style={s.empty}>Belum ada aktivitas di periode ini.</Text>;
  const H = 110;
  const step = Math.ceil(data.length / 14);
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
        {GROUPS.map((g) => (
          <View key={g} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: GROUP_COLOR[g], marginRight: 3 }} />
            <Text style={{ fontSize: 7, color: C.muted }}>{GROUP_LABEL[g]}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H, borderBottomWidth: 0.7, borderBottomColor: C.line }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: H }}>
            {data.length <= 20 && totals[i] > 0 && <Text style={{ fontSize: 5.5, color: C.muted, marginBottom: 1 }}>{totals[i]}</Text>}
            <View style={{ width: "62%", flexDirection: "column-reverse" }}>
              {GROUPS.map((g) => {
                const h = (Number(d[g]) / max) * (H - 12);
                return h > 0 ? <View key={g} style={{ height: h, backgroundColor: GROUP_COLOR[g] }} /> : null;
              })}
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 3 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ flex: 1, fontSize: 5.5, color: C.muted, textAlign: "center" }}>
            {i % step === 0 ? String(d.label).replace("Pekan ", "") : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ReportDoc({ r, author }: { r: OpsReport; author: string }) {
  let n = 0;
  const head = (
    <View style={s.runningHead} fixed>
      <Text>Pelatihan POSI · Laporan Performa Admin SmartChampion</Text>
      <Text>{r.scope.ownerName}</Text>
    </View>
  );
  const foot = (
    <View style={s.footer} fixed>
      <Text>
        Dibuat {formatDate(r.generatedAt, true)} oleh {author}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} / ${totalPages}`} />
    </View>
  );
  return (
    <Document title={`Laporan Performa ${r.scope.ownerName}`} author="Pelatihan POSI">
      <Page size="A4" style={s.page}>
        {head}
        <View style={s.hero}>
          <Text style={s.heroEyebrow}>LAPORAN PERFORMA · OPERASIONAL PELATIHAN</Text>
          <Text style={s.heroTitle}>{r.scope.ownerName}</Text>
          <Text style={s.heroSub}>Periode {r.range.label}</Text>
          <View style={s.heroMeta}>
            {[
              ["Skor KPI", `${r.score}/100`],
              ["Total aktivitas", num(r.total)],
              ["Hari aktif", `${r.activeDays}/${r.workdays}`],
              ["Rata-rata / hari", String(r.perDay)],
            ].map(([l, v]) => (
              <View key={l} style={s.heroChip}>
                <Text style={s.chipLabel}>{l}</Text>
                <Text style={s.chipValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <H2 n={++n} title="Volume kerja" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {r.counts.map((c) => (
            <View key={c.key} style={{ width: "23.6%", backgroundColor: C.soft, borderRadius: 9, padding: 8, paddingLeft: 10 }}>
              <View style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 2.5, borderRadius: 2, backgroundColor: GROUP_COLOR[c.group] }} />
              <Text style={{ fontSize: 6.3, fontWeight: 700, color: C.muted }}>{c.label.toUpperCase()}</Text>
              <Text style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginTop: 2 }}>{num(c.value)}</Text>
              {c.hint ? <Text style={{ fontSize: 6.3, color: C.muted, marginTop: 1 }}>{c.hint}</Text> : null}
            </View>
          ))}
        </View>

        <H2 n={++n} title="KPI operasional" />
        <View style={s.card}>
          {r.kpis.map((k) => (
            <View key={k.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line }} wrap={false}>
              <View style={{ width: "38%" }}>
                <Text style={{ fontSize: 8.3, fontWeight: 700, color: C.navy }}>
                  {k.label}
                  {k.team ? "  (tim)" : ""}
                </Text>
                <Text style={{ fontSize: 6.3, color: C.muted }}>{k.basis.replace(/≥/g, "min.")}</Text>
              </View>
              <View style={{ width: "30%", paddingHorizontal: 6 }}>
                <View style={{ height: 6, backgroundColor: C.soft, borderRadius: 3 }}>
                  <View style={{ height: 6, width: `${Math.min(100, k.pct)}%`, backgroundColor: ST[k.status].color, borderRadius: 3 }} />
                </View>
              </View>
              <Text style={{ width: "12%", textAlign: "right", fontSize: 9, fontWeight: 800 }}>{k.status === "na" ? "–" : `${k.pct}%`}</Text>
              <Text style={{ width: "10%", textAlign: "right", fontSize: 7, color: C.muted }}>min. {k.target}%</Text>
              <Text style={{ width: "10%", textAlign: "right", fontSize: 6.8, color: ST[k.status].color, fontWeight: 700 }}>{ST[k.status].label}</Text>
            </View>
          ))}
        </View>

        <View wrap={false}>
          <H2 n={++n} title={r.weekly ? "Aktivitas per pekan" : "Aktivitas per hari"} />
          <View style={s.card}>
            <StackChart data={r.trend} />
          </View>
        </View>

        <H2 n={++n} title="Rincian per jenis data" />
        <View style={s.card}>
          <Table
            empty="Belum ada aktivitas."
            rows={r.byEntity}
            cols={[
              { h: "Data", w: "46%", v: (e) => e.label },
              { h: "Tambah", w: "18%", v: (e) => e.create, right: true },
              { h: "Ubah", w: "18%", v: (e) => e.update, right: true },
              { h: "Hapus", w: "18%", v: (e) => e.del, right: true },
            ]}
          />
        </View>

        {r.perAdmin.length > 0 && (
          <>
            <H2 n={++n} title="Per Admin SmartChampion" />
            <View style={s.card}>
              <Table
                empty="-"
                rows={r.perAdmin}
                cols={[
                  { h: "Admin", w: "34%", v: (a) => a.name },
                  { h: "Aktivitas", w: "14%", v: (a) => a.total, right: true },
                  { h: "Hari aktif", w: "14%", v: (a) => a.activeDays, right: true },
                  { h: "Kelas", w: "10%", v: (a) => a.kelas, right: true },
                  { h: "Games", w: "10%", v: (a) => a.games, right: true },
                  { h: "Terakhir", w: "18%", v: (a) => (a.last ? formatDate(a.last, true) : "-"), right: true },
                ]}
              />
            </View>
          </>
        )}

        <H2 n={++n} title="Kelas yang dikelola" />
        <View style={s.card}>
          <Table
            empty="Belum ada kelas yang dikelola di periode ini."
            rows={r.perKelas.slice(0, 40)}
            cols={[
              { h: "Kelas", w: "34%", v: (k) => k.name },
              { h: "Kelas/paket", w: "11%", v: (k) => k.kelas, right: true },
              { h: "Materi", w: "9%", v: (k) => k.materi, right: true },
              { h: "Pertemuan", w: "11%", v: (k) => k.pertemuan, right: true },
              { h: "Worksheet", w: "11%", v: (k) => k.worksheet, right: true },
              { h: "Absen/nilai", w: "12%", v: (k) => k.absensiNilai, right: true },
              { h: "Kelulusan", w: "12%", v: (k) => k.kelulusan, right: true },
            ]}
          />
        </View>

        <H2 n={++n} title="Games yang dikelola" />
        <View style={s.card}>
          <Table
            empty="Belum ada games yang dikelola di periode ini."
            rows={r.perGame.slice(0, 30)}
            cols={[
              { h: "Game", w: "54%", v: (g) => g.name },
              { h: "Total aksi", w: "16%", v: (g) => g.total, right: true },
              { h: "Soal", w: "12%", v: (g) => g.soal, right: true },
              { h: "Terakhir", w: "18%", v: (g) => formatDate(g.last, true), right: true },
            ]}
          />
        </View>

        <H2 n={++n} title={`Log aktivitas terbaru (${Math.min(150, r.logs.length)} dari ${num(r.logTotal)})`} />
        <View style={s.card}>
          <Table
            empty="Belum ada aktivitas tercatat."
            rows={r.logs.slice(0, 150)}
            cols={[
              { h: "Waktu", w: "18%", v: (l) => formatDate(l.at, true) },
              ...(r.perAdmin.length ? [{ h: "Admin", w: "14%", v: (l: OpsReport["logs"][number]) => l.user }] : []),
              { h: "Aktivitas", w: r.perAdmin.length ? "68%" : "82%", v: (l) => l.text },
            ]}
          />
        </View>
        {foot}
      </Page>
    </Document>
  );
}

export async function renderOpsPdf(r: OpsReport, author: string) {
  return renderToBuffer(<ReportDoc r={r} author={author} />);
}

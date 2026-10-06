import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Bucket, PerformanceReport } from "@/lib/performance-report";
import { formatDate, formatRupiah } from "@/lib/utils";

/* ================= Font & warna ================= */

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

const C = {
  navy: "#0f2436",
  navy2: "#183349",
  text: "#22445f",
  muted: "#5f8bab",
  line: "#dfeaf2",
  soft: "#f4f8fb",
  brand: "#1a6f9f",
  brandSoft: "#d8eef9",
  fuchsia: "#d9b300",
  sky: "#0ea5e9",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#e11d48",
};
const SERIES = { leads: { label: "Lead masuk", color: C.brand }, paid: { label: "Paid", color: C.emerald }, blast: { label: "Data blast", color: C.sky } } as const;

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 8.5, color: C.text, paddingTop: 42, paddingBottom: 46, paddingHorizontal: 34 },
  runningHead: { position: "absolute", top: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted },
  footer: { position: "absolute", bottom: 20, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted, borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 6 },
  hero: { backgroundColor: C.navy, borderRadius: 14, padding: 20, marginTop: -16, marginBottom: 16, color: "#fff" },
  heroEyebrow: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1.5, color: "#84c3e5" },
  heroTitle: { fontSize: 22, fontWeight: 800, marginTop: 4 },
  heroSub: { fontSize: 10, color: "#cfe3f0", marginTop: 2 },
  heroMeta: { flexDirection: "row", marginTop: 14, gap: 8 },
  heroChip: { backgroundColor: C.navy2, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9, flexGrow: 1 },
  heroChipLabel: { fontSize: 6.5, color: "#a5a9d6" },
  heroChipValue: { fontSize: 9, fontWeight: 700, color: "#fff", marginTop: 1 },
  h2: { flexDirection: "row", alignItems: "center", marginBottom: 8, marginTop: 4 },
  h2Num: { width: 18, height: 18, borderRadius: 6, backgroundColor: C.brand, color: "#fff", fontSize: 8.5, fontWeight: 800, textAlign: "center", paddingTop: 3.5, marginRight: 7 },
  h2Text: { fontSize: 13, fontWeight: 800, color: C.navy },
  h2Sub: { fontSize: 7.5, color: C.muted, marginTop: -5, marginBottom: 9, marginLeft: 25 },
  h3: { fontSize: 9.5, fontWeight: 700, color: C.navy, marginBottom: 6 },
  card: { borderWidth: 0.7, borderColor: C.line, borderRadius: 10, padding: 11, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  small: { fontSize: 7, color: C.muted },
  empty: { fontSize: 8, color: C.muted, paddingVertical: 14, textAlign: "center" },
});

/* ================= Komponen kecil ================= */

const num = (n: number) => n.toLocaleString("id-ID");
const pctText = (v: number) => `${v.toLocaleString("id-ID")}%`;
const share = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function niceMax(v: number) {
  if (v <= 4) return Math.max(1, v);
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function H2({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <View wrap={false}>
      <View style={s.h2}>
        <Text style={s.h2Num}>{n}</Text>
        <Text style={s.h2Text}>{title}</Text>
      </View>
      {sub ? <Text style={s.h2Sub}>{sub}</Text> : null}
    </View>
  );
}

function Kpi({ label, value, hint, color = C.brand }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <View style={{ width: "23.5%", backgroundColor: C.soft, borderRadius: 9, padding: 8, paddingLeft: 10, marginBottom: 7, position: "relative" }}>
      <View style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 2.5, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 6.3, fontWeight: 700, color: C.muted, letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 14, fontWeight: 800, color: C.navy, marginTop: 2 }}>{value}</Text>
      {hint ? <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 1 }}>{hint}</Text> : null}
    </View>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: i.color, marginRight: 3 }} />
          <Text style={{ fontSize: 7, color: C.muted }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Grafik batang vertikal (dikelompokkan per seri) */
function VBarChart({ data, keys, height = 110, maxLabels = 14 }: { data: Bucket[]; keys: (keyof typeof SERIES)[]; height?: number; maxLabels?: number }) {
  const max = niceMax(Math.max(0, ...data.flatMap((d) => keys.map((k) => d[k]))));
  const total = data.reduce((sum, d) => sum + keys.reduce((a, k) => a + d[k], 0), 0);
  if (!data.length || !total) return <Text style={s.empty}>Belum ada data di periode ini.</Text>;
  const step = Math.ceil(data.length / maxLabels);
  const showValues = data.length <= 16;
  const barW = `${Math.min(34, 72 / keys.length)}%`;
  return (
    <View>
      <Legend items={keys.map((k) => SERIES[k])} />
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 24, height, justifyContent: "space-between", alignItems: "flex-end", paddingRight: 4, paddingTop: 8 }}>
          {[max, max / 2, 0].map((v, i) => (
            <Text key={i} style={{ fontSize: 6, color: C.muted, marginTop: i === 0 ? -3 : 0, marginBottom: i === 2 ? -3 : 0 }}>
              {Number.isInteger(v) ? num(v) : v.toFixed(1)}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1, height, borderLeftWidth: 0.6, borderBottomWidth: 0.6, borderColor: "#c9c6e6", position: "relative", paddingTop: 8 }}>
          <View style={{ position: "absolute", left: 0, right: 0, top: 8, borderTopWidth: 0.4, borderColor: C.line, borderStyle: "dashed" }} />
          <View style={{ position: "absolute", left: 0, right: 0, top: 8 + (height - 8) / 2, borderTopWidth: 0.4, borderColor: C.line, borderStyle: "dashed" }} />
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: "100%", paddingHorizontal: 2 }}>
            {data.map((d) => (
              <View key={d.key} style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", height: "100%" }}>
                {keys.map((k) => (
                  <View key={k} style={{ width: barW, height: "100%", justifyContent: "flex-end", alignItems: "center" }}>
                    {showValues && d[k] > 0 ? <Text style={{ fontSize: 5.5, color: C.text, marginBottom: 1 }}>{d[k]}</Text> : null}
                    <View style={{ width: "100%", height: `${(d[k] / max) * 100}%`, backgroundColor: SERIES[k].color, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 }} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", marginLeft: 26, marginTop: 3 }}>
        {data.map((d, i) => (
          <Text key={d.key} style={{ flex: 1, fontSize: 5.5, color: C.muted, textAlign: "center" }}>
            {i % step === 0 ? d.label : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Daftar batang horizontal */
function HBars({ items, color = C.brand, suffix, max: maxIn, labelWidth = "36%" }: { items: { name: string; value: number; note?: string }[]; color?: string; suffix?: string; max?: number; labelWidth?: string }) {
  if (!items.length || items.every((i) => !i.value)) return <Text style={s.empty}>Belum ada data di periode ini.</Text>;
  const max = maxIn ?? Math.max(...items.map((i) => i.value));
  return (
    <View>
      {items.map((i) => (
        <View key={i.name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }} wrap={false}>
          <Text style={{ width: labelWidth, fontSize: 7.5, paddingRight: 6 }}>{i.name}</Text>
          <View style={{ flex: 1, height: 8, backgroundColor: C.soft, borderRadius: 4 }}>
            <View style={{ width: `${max ? Math.max(1.5, (i.value / max) * 100) : 0}%`, height: 8, backgroundColor: color, borderRadius: 4 }} />
          </View>
          <Text style={{ width: 62, fontSize: 7.5, fontWeight: 700, textAlign: "right" }}>
            {num(i.value)}
            {suffix ?? ""}
            {i.note ? <Text style={{ fontWeight: 400, color: C.muted }}> {i.note}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

type Col<T> = { label: string; width: string; align?: "left" | "right" | "center"; render: (r: T) => string | number };
function Table<T>({ cols, rows, empty = "Tidak ada data." }: { cols: Col<T>[]; rows: T[]; empty?: string }) {
  return (
    <View>
      <View style={{ flexDirection: "row", backgroundColor: C.navy, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} fixed>
        {cols.map((c) => (
          <Text key={c.label} style={{ width: c.width, padding: 5, fontSize: 6.8, fontWeight: 700, color: "#fff", textAlign: c.align ?? "left" }}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.length ? (
        rows.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", backgroundColor: i % 2 ? C.soft : "#fff", borderBottomWidth: 0.5, borderBottomColor: C.line }} wrap={false}>
            {cols.map((c) => (
              <Text key={c.label} style={{ width: c.width, padding: 4.5, fontSize: 7.3, textAlign: c.align ?? "left" }}>
                {String(c.render(r))}
              </Text>
            ))}
          </View>
        ))
      ) : (
        <Text style={s.empty}>{empty}</Text>
      )}
    </View>
  );
}

function Funnel({ steps }: { steps: { name: string; value: number }[] }) {
  const first = steps[0]?.value ?? 0;
  const colors = ["#133e57", "#14577d", "#1a6f9f", "#2e89bc", "#2e89bc", C.emerald];
  if (!first) return <Text style={s.empty}>Belum ada lead yang masuk di periode ini.</Text>;
  return (
    <View>
      {steps.map((st, i) => {
        const w = Math.max(8, (st.value / first) * 100);
        const prev = i ? steps[i - 1].value : st.value;
        return (
          <View key={st.name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }} wrap={false}>
            <Text style={{ width: "30%", fontSize: 7.5, fontWeight: 600 }}>{st.name}</Text>
            <View style={{ flex: 1, alignItems: "center" }}>
              <View style={{ width: `${w}%`, backgroundColor: colors[i % colors.length], borderRadius: 5, paddingVertical: 3.5 }}>
                <Text style={{ fontSize: 8, fontWeight: 800, color: "#fff", textAlign: "center" }}>{num(st.value)}</Text>
              </View>
            </View>
            <Text style={{ width: "22%", fontSize: 6.8, color: C.muted, textAlign: "right" }}>
              {i === 0 ? "100%" : `${pctText(share(st.value, first))} total · ${pctText(share(st.value, prev))} tahap`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function StackBar({ parts }: { parts: { name: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <Text style={s.empty}>Belum ada data blast di periode ini.</Text>;
  return (
    <View>
      <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden" }}>
        {parts
          .filter((p) => p.value)
          .map((p) => (
            <View key={p.name} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />
          ))}
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 5 }}>
        {parts.map((p) => (
          <View key={p.name} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: p.color, marginRight: 4 }} />
            <Text style={{ fontSize: 7.5 }}>
              {p.name}: <Text style={{ fontWeight: 700 }}>{num(p.value)}</Text> ({pctText(share(p.value, total))})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ================= Insight otomatis ================= */

function insights(r: PerformanceReport) {
  const k = r.kpi;
  const out: string[] = [];
  if (k.leads) out.push(`${num(k.leads)} lead masuk (${num(k.valid)} valid). ${num(k.paid)} di antaranya sudah Paid, konversi ${pctText(k.conversion)} dari lead valid.`);
  else out.push("Belum ada lead yang masuk pada periode ini.");
  if (k.sold) out.push(`${num(k.sold)} produk terjual dari ${num(k.transactions)} transaksi dengan total pendapatan ${formatRupiah(k.revenue)} (rata-rata ${formatRupiah(k.avgTicket)} per transaksi).`);
  const bestSrc = [...r.bySource].filter((x) => x.paid > 0).sort((a, b) => b.paid - a.paid || b.conversion - a.conversion)[0];
  if (bestSrc) out.push(`Sumber lead paling menghasilkan: ${bestSrc.name} (${num(bestSrc.paid)} paid dari ${num(bestSrc.leads)} lead, konversi ${pctText(bestSrc.conversion)}).`);
  else if (r.bySource[0]) out.push(`Sumber lead terbanyak: ${r.bySource[0].name} (${num(r.bySource[0].leads)} lead).`);
  const busyDay = [...r.daily].sort((a, b) => b.leads - a.leads)[0];
  if (busyDay?.leads) out.push(`Hari dengan lead terbanyak: ${formatDate(new Date(`${busyDay.key}T00:00:00+07:00`))} (${num(busyDay.leads)} lead).`);
  if (k.avgCloseDays != null) out.push(`Rata-rata waktu closing ${k.avgCloseDays.toLocaleString("id-ID")} hari sejak lead masuk (median ${k.medianCloseDays} hari).`);
  if (k.blast) out.push(`${num(k.blast)} kontak di-blast (WhatsApp ${num(k.blastWa)}, Email ${num(k.blastEmail)}); ${num(k.blastToLead)} sudah tercatat sebagai lead (${pctText(k.blastLeadRate)}) dan ${num(k.blastToPaid)} menjadi Paid.`);
  if (k.overdue) out.push(`Perhatian: ${num(k.overdue)} lead melewati jadwal follow-up dan belum Paid/Lost. Daftarnya ada di bagian Tindak Lanjut.`);
  const missing = r.sales.products.reduce((a, p) => a + p.missingNominal, 0);
  if (missing) out.push(`${num(missing)} penjualan belum diisi nominalnya, sehingga pendapatan tercatat lebih kecil dari sebenarnya.`);
  return out;
}

/* ================= Dokumen ================= */

function ReportDocument({ r }: { r: PerformanceReport }) {
  const k = r.kpi;
  const m = r.meta;
  const period = m.periodStart || m.periodEnd ? `${m.periodStart ? formatDate(m.periodStart) : "awal"} – ${m.periodEnd ? formatDate(m.periodEnd) : "sekarang"}` : "Semua waktu";
  const coc = r.sales.products.find((p) => p.key === "COC")!;
  const vip = r.sales.products.find((p) => p.key === "VIP Privat")!;
  const mimpi = r.sales.products.find((p) => p.key === "Mimpi.mu")!;
  const lain = r.sales.products.find((p) => p.key === "Lainnya")!;
  let n = 0;

  return (
    <Document title={`Laporan Performa ${m.ownerName} - ${m.periodLabel}`} author="Pelatihan POSI" creator="Pelatihan POSI" subject="Laporan performa admin">
      <Page size="A4" style={s.page}>
        <View style={s.runningHead} fixed render={({ pageNumber }) => (pageNumber > 1 ? <Text>Laporan Performa · {m.ownerName} · {m.periodLabel}</Text> : null)} />
        <View style={s.footer} fixed>
          <Text>Pelatihan POSI · dibuat {formatDate(m.generatedAt, true)} WIB oleh {m.generatedBy}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>

        {/* ---------- SAMPUL & RINGKASAN ---------- */}
        <View style={s.hero}>
          <Text style={s.heroEyebrow}>PELATIHAN POSI · LAPORAN PERFORMA</Text>
          <Text style={s.heroTitle}>{m.allAdmins ? "Performa Tim Admin" : `Performa ${m.ownerName}`}</Text>
          <Text style={s.heroSub}>Lead, konversi, penjualan, dan data blast · {m.periodLabel}</Text>
          <View style={s.heroMeta}>
            {[
              ["Admin", m.ownerName],
              ["Periode", period],
              ["Dibuat", `${formatDate(m.generatedAt, true)} WIB`],
            ].map(([a, b]) => (
              <View key={a} style={s.heroChip}>
                <Text style={s.heroChipLabel}>{a}</Text>
                <Text style={s.heroChipValue}>{b}</Text>
              </View>
            ))}
          </View>
        </View>

        <H2 n={++n} title="Ringkasan utama" sub="Angka kunci pada periode laporan." />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          <Kpi label="Lead masuk" value={num(k.leads)} hint={`${num(k.valid)} valid · ${num(k.bukanLead)} bukan lead`} />
          <Kpi label="Lead paid" value={num(k.paid)} hint={k.paidDetected ? `termasuk ${num(k.paidDetected)} terdeteksi lintas data` : "dari lead yang masuk di periode"} color={C.emerald} />
          <Kpi label="Konversi" value={pctText(k.conversion)} hint="paid ÷ lead valid" color={C.emerald} />
          <Kpi label="Lost" value={num(k.lost)} hint={`${pctText(share(k.lost, k.leads))} dari lead masuk`} color={C.rose} />
          <Kpi label="Produk terjual" value={num(k.sold)} hint={`${num(k.transactions)} transaksi (tgl bayar)`} color={C.fuchsia} />
          <Kpi label="Pendapatan" value={formatRupiah(k.revenue)} hint={`rata-rata ${formatRupiah(k.avgTicket)}`} color={C.fuchsia} />
          <Kpi label="Waktu closing" value={k.avgCloseDays != null ? `${k.avgCloseDays.toLocaleString("id-ID")} hari` : "-"} hint={k.medianCloseDays != null ? `median ${k.medianCloseDays} hari` : "belum ada penjualan"} color={C.amber} />
          <Kpi label="Dihubungi" value={num(k.contacted)} hint="lead dengan kontak terakhir di periode" color={C.amber} />
          <Kpi label="Data blast" value={num(k.blast)} hint={`WA ${num(k.blastWa)} · Email ${num(k.blastEmail)}`} color={C.sky} />
          <Kpi label="Blast jadi lead" value={num(k.blastToLead)} hint={`${pctText(k.blastLeadRate)} · ${num(k.blastToPaid)} paid`} color={C.sky} />
          <Kpi label="Pendaftar web" value={num(k.webRegistrations)} hint={`${num(k.webPaid)} lunas`} color={C.navy2} />
          <Kpi label="Follow-up terlambat" value={num(k.overdue)} hint="kondisi saat laporan dibuat" color={k.overdue ? C.rose : C.emerald} />
        </View>

        <View style={[s.card, { backgroundColor: "#fbfdff", marginTop: 3 }]} wrap={false}>
          <Text style={s.h3}>Insight</Text>
          {insights(r).map((t, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={{ width: 9, color: C.brand, fontWeight: 800 }}>•</Text>
              <Text style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}
        </View>

        <View style={s.card} wrap={false}>
          <Text style={s.h3}>Funnel konversi: dari lead masuk sampai paid</Text>
          <Funnel steps={r.funnel} />
          <Text style={[s.small, { marginTop: 4 }]}>Persentase “total” dihitung dari lead masuk; “tahap” dihitung dari tahap sebelumnya. Status diambil dari posisi terakhir tiap lead.</Text>
        </View>

        {/* ---------- TREN ---------- */}
        <View break>
          <H2 n={++n} title="Tren waktu" sub="Lead masuk (tgl masuk), penjualan (tgl bayar), dan data blast (tgl blast)." />
        </View>
        <View style={s.card} wrap={false}>
          <Text style={s.h3}>Per hari</Text>
          <VBarChart data={r.daily} keys={["leads", "paid", "blast"]} height={100} maxLabels={16} />
          {m.trendNote ? <Text style={[s.small, { marginTop: 3 }]}>{m.trendNote}</Text> : null}
        </View>
        <View style={s.card} wrap={false}>
          <Text style={s.h3}>Per minggu (Senin – Minggu)</Text>
          <VBarChart data={r.weekly} keys={["leads", "paid", "blast"]} height={95} />
        </View>
        <View style={s.card} wrap={false}>
          <Text style={s.h3}>Per bulan</Text>
          <VBarChart data={r.monthly} keys={["leads", "paid", "blast"]} height={90} />
        </View>
        <View wrap={false}>
          <Table
            cols={[
              { label: "Bulan", width: "28%", render: (b: Bucket) => b.label },
              { label: "Lead masuk", width: "18%", align: "right", render: (b) => num(b.leads) },
              { label: "Paid (tgl bayar)", width: "18%", align: "right", render: (b) => num(b.paid) },
              { label: "Data blast", width: "18%", align: "right", render: (b) => num(b.blast) },
              { label: "Paid ÷ lead", width: "18%", align: "right", render: (b) => (b.leads ? pctText(share(b.paid, b.leads)) : "-") },
            ]}
            rows={r.monthly}
          />
        </View>

        {/* ---------- RINCIAN LEAD ---------- */}
        <View break>
          <H2 n={++n} title="Rincian lead" sub="Berdasarkan lead yang masuk di periode laporan." />
        </View>
        <View style={s.row}>
          <View style={[s.card, s.col]} wrap={false}>
            <Text style={s.h3}>Distribusi status funnel</Text>
            <HBars items={r.statuses} color={C.brand} labelWidth="30%" />
          </View>
          <View style={[s.card, s.col]} wrap={false}>
            <Text style={s.h3}>Kategori customer</Text>
            <HBars items={r.byCategory} color={C.navy2} labelWidth="40%" />
          </View>
        </View>
        <View style={s.card} wrap={false}>
          <Text style={s.h3}>Sumber lead</Text>
          <HBars items={r.bySource.map((x) => ({ name: x.name, value: x.leads, note: x.paid ? `(${x.paid} paid)` : undefined }))} color={C.brand} labelWidth="26%" />
        </View>
        <View wrap={false} style={{ marginBottom: 10 }}>
          <Table
            cols={[
              { label: "Sumber lead", width: "34%", render: (x: PerformanceReport["bySource"][number]) => x.name },
              { label: "Lead", width: "14%", align: "right", render: (x) => num(x.leads) },
              { label: "Valid", width: "14%", align: "right", render: (x) => num(x.valid) },
              { label: "Paid", width: "14%", align: "right", render: (x) => num(x.paid) },
              { label: "Konversi", width: "24%", align: "right", render: (x) => pctText(x.conversion) },
            ]}
            rows={r.bySource}
          />
        </View>
        <View wrap={false}>
          <Text style={s.h3}>Produk yang diminati</Text>
          <Table
            cols={[
              { label: "Produk", width: "34%", render: (x: PerformanceReport["byProduct"][number]) => x.name },
              { label: "Lead", width: "14%", align: "right", render: (x) => num(x.leads) },
              { label: "Valid", width: "14%", align: "right", render: (x) => num(x.valid) },
              { label: "Paid", width: "14%", align: "right", render: (x) => num(x.paid) },
              { label: "Konversi", width: "24%", align: "right", render: (x) => pctText(x.conversion) },
            ]}
            rows={r.byProduct}
          />
        </View>

        {/* ---------- PENJUALAN ---------- */}
        <View break>
          <H2 n={++n} title="Penjualan" sub="Lead berstatus Paid dengan tanggal bayar di periode laporan (termasuk pendaftaran COC dari web)." />
        </View>
        <View style={s.row} wrap={false}>
          {[
            { t: "Champion Online Class (COC)", p: coc, c: C.brand },
            { t: "VIP Privat", p: vip, c: C.amber },
            { t: "Mimpi.mu", p: mimpi, c: C.sky },
            { t: "Lainnya", p: lain, c: C.muted },
          ].map(({ t, p, c }) => (
            <View key={t} style={[s.card, s.col, { borderLeftWidth: 3, borderLeftColor: c }]}>
              <Text style={{ fontSize: 7, fontWeight: 700, color: C.muted }}>{t.toUpperCase()}</Text>
              <Text style={{ fontSize: 16, fontWeight: 800, color: C.navy, marginTop: 2 }}>
                {num(p.units)} <Text style={{ fontSize: 8, fontWeight: 400, color: C.muted }}>terjual</Text>
              </Text>
              <Text style={{ fontSize: 9, fontWeight: 700, color: c }}>{formatRupiah(p.revenue)}</Text>
              {p.missingNominal ? <Text style={[s.small, { color: C.amber }]}>{p.missingNominal} tanpa nominal</Text> : null}
            </View>
          ))}
        </View>
        {r.sales.bundleCount ? <Text style={[s.small, { marginTop: -4, marginBottom: 8 }]}>{r.sales.bundleCount} transaksi “Mimpi.mu & COC” dihitung di kedua produk; nominalnya hanya masuk ke total pendapatan.</Text> : null}
        <View style={s.row}>
          <View style={[s.card, s.col]} wrap={false}>
            <Text style={s.h3}>Kelas / paket COC terlaris</Text>
            <HBars items={coc.byPaket.map((x) => ({ name: x.name, value: x.value }))} color={C.brand} labelWidth="58%" />
          </View>
          <View style={[s.card, s.col]} wrap={false}>
            <Text style={s.h3}>Paket Mimpi.mu terlaris</Text>
            <HBars items={mimpi.byPaket.map((x) => ({ name: x.name, value: x.value }))} color={C.sky} labelWidth="58%" />
          </View>
        </View>
        {vip.byPaket.length ? (
          <View style={s.card} wrap={false}>
            <Text style={s.h3}>Paket VIP Privat terlaris</Text>
            <HBars items={vip.byPaket.map((x) => ({ name: x.name, value: x.value }))} color={C.amber} labelWidth="58%" />
          </View>
        ) : null}
        <Text style={s.h3}>
          Daftar penjualan{r.counts.salesTotal > r.salesList.length ? ` (30 terbaru dari ${num(r.counts.salesTotal)})` : ""}
        </Text>
        <Table
          cols={[
            { label: "Tgl bayar", width: "13%", render: (x: PerformanceReport["salesList"][number]) => formatDate(x.tanggalBayar) },
            { label: "Nama", width: "22%", render: (x) => x.nama },
            { label: "Produk", width: "14%", render: (x) => x.produk },
            { label: "Paket / kelas", width: "24%", render: (x) => x.paket },
            ...(m.allAdmins ? [{ label: "Admin", width: "11%", render: (x: PerformanceReport["salesList"][number]) => x.owner }] : []),
            { label: "Nominal", width: m.allAdmins ? "16%" : "27%", align: "right" as const, render: (x) => (x.nominal != null ? formatRupiah(x.nominal) : "-") },
          ]}
          rows={r.salesList}
          empty="Belum ada penjualan di periode ini."
        />

        {/* ---------- DATA BLAST ---------- */}
        <View break>
          <H2 n={++n} title="Data blast" sub="Kontak yang di-blast lewat WhatsApp & Email pada periode laporan." />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          <Kpi label="Total blast" value={num(k.blast)} color={C.sky} />
          <Kpi label="WhatsApp" value={num(k.blastWa)} hint={pctText(share(k.blastWa, k.blast))} color={C.emerald} />
          <Kpi label="Email" value={num(k.blastEmail)} hint={pctText(share(k.blastEmail, k.blast))} color={C.sky} />
          <Kpi label="Jadi lead / paid" value={`${num(k.blastToLead)} / ${num(k.blastToPaid)}`} hint={`${pctText(k.blastLeadRate)} blast menjadi lead`} color={C.brand} />
        </View>
        <View style={s.card} wrap={false}>
          <Text style={s.h3}>Kanal blast</Text>
          <StackBar
            parts={[
              { name: "WhatsApp", value: k.blastWa, color: C.emerald },
              { name: "Email", value: k.blastEmail, color: C.sky },
            ]}
          />
        </View>
        <View style={s.card} wrap={false}>
          <Text style={s.h3}>Blast per minggu</Text>
          <VBarChart data={r.weekly} keys={["blast", "leads"]} height={100} />
        </View>
        <View style={s.row}>
          <View style={[s.card, s.col]} wrap={false}>
            <Text style={s.h3}>Per jenjang</Text>
            <HBars items={r.blast.byJenjang} color={C.sky} labelWidth="34%" />
          </View>
          <View style={[s.card, s.col]} wrap={false}>
            <Text style={s.h3}>10 provinsi teratas</Text>
            <HBars items={r.blast.byProvinsi} color={C.sky} labelWidth="46%" />
          </View>
        </View>
        {m.allAdmins ? (
          <View style={s.card} wrap={false}>
            <Text style={s.h3}>Blast per admin</Text>
            <HBars items={r.blast.byOwner} color={C.sky} labelWidth="30%" />
          </View>
        ) : null}

        {/* ---------- PERBANDINGAN ADMIN ---------- */}
        {m.allAdmins && r.admins.length ? (
          <>
            <View minPresenceAhead={180} style={{ marginTop: 8 }}>
              <H2 n={++n} title="Perbandingan admin" sub="Lead & status dari lead yang masuk; terjual & pendapatan dari tanggal bayar." />
            </View>
            <View style={s.row}>
              <View style={[s.card, s.col]} wrap={false}>
                <Text style={s.h3}>Produk terjual</Text>
                <HBars items={r.admins.map((a) => ({ name: a.name, value: a.sold }))} color={C.fuchsia} labelWidth="34%" />
              </View>
              <View style={[s.card, s.col]} wrap={false}>
                <Text style={s.h3}>Lead masuk</Text>
                <HBars items={r.admins.map((a) => ({ name: a.name, value: a.leads }))} color={C.brand} labelWidth="34%" />
              </View>
            </View>
            <Table
              cols={[
                { label: "Admin", width: "16%", render: (a: PerformanceReport["admins"][number]) => a.name },
                { label: "Lead", width: "9%", align: "right", render: (a) => num(a.leads) },
                { label: "Valid", width: "9%", align: "right", render: (a) => num(a.valid) },
                { label: "Paid", width: "9%", align: "right", render: (a) => num(a.paid) },
                { label: "Konversi", width: "11%", align: "right", render: (a) => pctText(a.conversion) },
                { label: "Terjual", width: "10%", align: "right", render: (a) => num(a.sold) },
                { label: "Pendapatan", width: "16%", align: "right", render: (a) => formatRupiah(a.revenue) },
                { label: "Blast", width: "9%", align: "right", render: (a) => num(a.blast) },
                { label: "Terlambat", width: "11%", align: "right", render: (a) => num(a.overdue) },
              ]}
              rows={r.admins}
            />
          </>
        ) : null}

        {/* ---------- TINDAK LANJUT ---------- */}
        <View minPresenceAhead={160} style={{ marginTop: 14 }}>
          <H2 n={++n} title="Tindak lanjut" sub="Lead yang melewati jadwal follow-up dan belum Paid/Lost (kondisi saat laporan dibuat)." />
        </View>
        <Table
          cols={[
            { label: "Nama", width: "28%", render: (x: PerformanceReport["overdueList"][number]) => x.nama },
            { label: "No. WA", width: "20%", render: (x) => x.noWa ?? "-" },
            { label: "Status", width: "13%", render: (x) => x.status },
            { label: "Jadwal follow-up", width: "16%", render: (x) => formatDate(x.nextFollowUp) },
            { label: "Terlambat", width: "10%", align: "right", render: (x) => `${x.daysLate} hari` },
            { label: "Admin", width: "13%", render: (x) => x.owner },
          ]}
          rows={r.overdueList}
          empty="Tidak ada follow-up yang terlambat. Mantap!"
        />
        {r.counts.overdueTotal > r.overdueList.length ? (
          <Text style={[s.small, { marginTop: 4 }]}>Menampilkan 30 dari {num(r.counts.overdueTotal)} lead. Daftar lengkap: menu Master Lead, filter “jatuh tempo follow-up”.</Text>
        ) : null}

        <View style={[s.card, { marginTop: 14, backgroundColor: "#fbfdff" }]} wrap={false}>
          <Text style={s.h3}>Definisi</Text>
          {[
            "Lead masuk: lead dengan tanggal masuk di periode. Lead valid: selain kategori “Bukan Lead”.",
            "Konversi: lead masuk di periode yang sudah Paid ÷ lead valid yang masuk di periode. Lead yang statusnya belum Paid tetapi orangnya sudah membayar (terdeteksi dari no. WA, email, atau nama mirip di data lain) ikut dihitung Paid.",
            "Penjualan tanpa owner (mis. pendaftaran web) dikreditkan ke admin pemilik lead lain orang yang sama (cocok no. WA / email / nama mirip).",
            "Produk terjual & pendapatan: lead Paid dengan tanggal bayar di periode. Lead “Mimpi.mu & COC” dihitung di kedua produk.",
            "Waktu closing: selisih hari dari tanggal masuk ke tanggal bayar untuk penjualan di periode.",
            "Blast jadi lead: kontak blast (No. HP / email) yang juga tercatat di Master Lead, oleh admin mana pun.",
            "Follow-up terlambat: jadwal follow-up sebelum hari ini dan status belum Paid/Lost, dihitung saat laporan dibuat.",
          ].map((t) => (
            <Text key={t} style={{ fontSize: 7.3, marginBottom: 2 }}>
              • {t}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function renderPerformancePdf(report: PerformanceReport) {
  return renderToBuffer(<ReportDocument r={report} />);
}

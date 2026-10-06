import { PrismaClient, type Jenjang, type ProductStatus, type RegistrationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();
const DAY = 86_400_000;

// PRNG deterministik supaya data demo sama setiap seed
let seedState = 20260925;
const rand = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function normalizePhone(raw: unknown) {
  if (raw == null) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

function slugify(t: string) {
  return t.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-");
}

/* ------------------------------------------------------------------ */
/* Kelas COC (sesuai opsi COC di Google Form pendaftaran)              */
/* ------------------------------------------------------------------ */
type P = { name: string; bidang: string; jenjang: Jenjang; grade?: string; focus: string };
const PRODUCTS: P[] = [
  { name: "Matematika Advance SD", bidang: "Matematika", jenjang: "SD", grade: "Kelas 4–6", focus: "OSN Matematika SD" },
  { name: "IPA Advance SD", bidang: "IPA", jenjang: "SD", grade: "Kelas 4–6", focus: "OSN IPA SD" },
  { name: "Bahasa Inggris Advance SD", bidang: "Bahasa Inggris", jenjang: "SD", grade: "Kelas 4–6", focus: "kompetisi Bahasa Inggris SD" },
  { name: "Bahasa Indonesia Advance SD", bidang: "Bahasa Indonesia", jenjang: "SD", grade: "Kelas 4–6", focus: "kompetisi Bahasa Indonesia SD" },
  { name: "Matematika SMP Advance (Persiapan Olimpiade)", bidang: "Matematika", jenjang: "SMP", focus: "OSN Matematika SMP" },
  { name: "IPA SMP Advance", bidang: "IPA", jenjang: "SMP", focus: "OSN IPA SMP" },
  { name: "IPS SMP Advance", bidang: "IPS", jenjang: "SMP", focus: "OSN IPS SMP" },
  { name: "Bahasa Inggris SMP Advance", bidang: "Bahasa Inggris", jenjang: "SMP", focus: "kompetisi Bahasa Inggris SMP" },
  { name: "Matematika SMA Advance (Persiapan Olimpiade)", bidang: "Matematika", jenjang: "SMA", focus: "OSN Matematika SMA" },
  { name: "Fisika SMA Advance", bidang: "Fisika", jenjang: "SMA", focus: "OSN Fisika SMA" },
  { name: "Biologi SMA Advance", bidang: "Biologi", jenjang: "SMA", focus: "OSN Biologi SMA" },
  { name: "Kimia SMA Advance", bidang: "Kimia", jenjang: "SMA", focus: "OSN Kimia SMA" },
  { name: "Astronomi Advance", bidang: "Astronomi", jenjang: "SMA", focus: "OSN Astronomi" },
  { name: "Geografi Advance", bidang: "Geografi", jenjang: "SMA", focus: "OSN Geografi" },
  { name: "Ekonomi Advance", bidang: "Ekonomi", jenjang: "SMA", focus: "OSN Ekonomi" },
  { name: "Kebumian Advance", bidang: "Kebumian", jenjang: "SMA", focus: "OSN Kebumian" },
  { name: "Komputer Advance", bidang: "Informatika", jenjang: "SMA", focus: "OSN Informatika/Komputer" },
  { name: "AI Advance", bidang: "Kecerdasan Artifisial", jenjang: "UMUM", focus: "kompetisi AI & pemrograman" },
];

/** Target peserta lunas & pending (data demo) */
const DEMO_REGS: Record<string, [paid: number, pending: number, other: number]> = {
  "Matematika SMP Advance (Persiapan Olimpiade)": [16, 2, 1],
  "Matematika SMA Advance (Persiapan Olimpiade)": [15, 1, 0],
  "Matematika Advance SD": [12, 2, 1],
  "Fisika SMA Advance": [11, 1, 1],
  "IPA SMP Advance": [9, 2, 0],
  "Astronomi Advance": [7, 1, 0],
  "Komputer Advance": [6, 2, 1],
  "IPA Advance SD": [5, 1, 0],
  "Kimia SMA Advance": [4, 0, 1],
  "Bahasa Inggris SMP Advance": [4, 1, 0],
  "Biologi SMA Advance": [3, 1, 0],
  "AI Advance": [2, 1, 0],
  "Kebumian Advance": [1, 0, 0],
};

const FIRST = ["Aditya", "Bunga", "Citra", "Dimas", "Eka", "Fajar", "Gita", "Hana", "Ilham", "Jihan", "Kevin", "Laras", "Minh", "Nabila", "Oka", "Putri", "Qori", "Raka", "Salsa", "Tegar", "Umar", "Vania", "Wulan", "Yoga", "Zahra", "Bagas", "Dewi", "Farhan", "Intan", "Rizky"];
const LAST = ["Pratama", "Saputra", "Wijaya", "Lestari", "Nugroho", "Kusuma", "Hidayat", "Siregar", "Rahmawati", "Santoso", "Harahap", "Putri", "Maharani", "Gunawan", "Simanjuntak"];
const SCHOOLS = ["SMPN 1 Medan", "SMAN 3 Bandung", "SDN 05 Jakarta", "SMP Al-Azhar Surabaya", "SMAN 1 Yogyakarta", "SD Santo Yosef", "SMPN 8 Semarang", "SMA Sutomo 1 Medan", "SDIT Nurul Fikri", "SMAN 2 Makassar", "SMPN 2 Denpasar", "SMA Taruna Nusantara"];
const REG_SOURCES = ["Iklan Web POSI", "Iklan Web POSI", "Iklan Web POSI", "Blast Email", "Blast WA / Telepon", "WhatsApp Admin", "Instagram", "Tiktok SC", "Bundling Paket Lengkap"];

function leadSource(src: string) {
  if (src === "Blast WA / Telepon") return "Blast WA (RFM)";
  if (src === "Bundling Paket Lengkap") return "Bundling POSI";
  if (["WhatsApp Admin", "Instagram", "Tiktok SC", "Telegram"].includes(src)) return "Organic";
  return src;
}

/* ------------------------------------------------------------------ */
/* Games                                                               */
/* ------------------------------------------------------------------ */
type Q = [text: string, options: string[], answer: number];
const GAMES: { title: string; emoji: string; subject: string; jenjang: Jenjang; seconds: number; desc: string; published: boolean; questions: Q[] }[] = [
  {
    title: "Matematika Kilat",
    emoji: "⚡",
    subject: "Matematika",
    jenjang: "SMP",
    seconds: 25,
    published: true,
    desc: "10 soal hitung cepat tingkat SMP: persen, KPK/FPB, persamaan linear, geometri, dan pola bilangan.",
    questions: [
      ["15% dari 240 adalah…", ["32", "36", "38", "40"], 1],
      ["KPK dari 12 dan 18 adalah…", ["24", "36", "48", "72"], 1],
      ["Jika 3x + 7 = 25, maka x = …", ["5", "6", "7", "8"], 1],
      ["Jumlah besar sudut dalam segi lima adalah…", ["360°", "450°", "540°", "720°"], 2],
      ["√196 = …", ["12", "13", "14", "16"], 2],
      ["FPB dari 84 dan 126 adalah…", ["14", "21", "42", "63"], 2],
      ["2¹⁰ = …", ["512", "1000", "1024", "2048"], 2],
      ["Luas lingkaran berjari-jari 7 cm (π = 22/7) adalah… cm²", ["44", "154", "144", "308"], 1],
      ["Rata-rata dari 4, 8, 10, dan 14 adalah…", ["8", "9", "10", "12"], 1],
      ["Suku berikutnya dari barisan 2, 5, 10, 17, 26, … adalah", ["35", "36", "37", "38"], 2],
    ],
  },
  {
    title: "Sains Seru",
    emoji: "🔬",
    subject: "IPA",
    jenjang: "SD",
    seconds: 20,
    published: true,
    desc: "Uji pengetahuan IPA dasar: tubuh manusia, tumbuhan, wujud zat, dan gaya.",
    questions: [
      ["Planet terbesar di tata surya adalah…", ["Saturnus", "Jupiter", "Neptunus", "Bumi"], 1],
      ["Proses tumbuhan membuat makanan sendiri disebut…", ["Respirasi", "Fotosintesis", "Transpirasi", "Evaporasi"], 1],
      ["Satuan SI untuk gaya adalah…", ["Joule", "Watt", "Newton", "Pascal"], 2],
      ["Pada tekanan 1 atm, air murni mendidih pada suhu…", ["90 °C", "100 °C", "110 °C", "120 °C"], 1],
      ["Organ yang memompa darah ke seluruh tubuh adalah…", ["Paru-paru", "Hati", "Jantung", "Ginjal"], 2],
      ["Rumus kimia air adalah…", ["CO₂", "H₂O", "O₂", "NaCl"], 1],
      ["Perubahan wujud dari padat langsung menjadi gas disebut…", ["Mencair", "Menguap", "Menyublim", "Mengembun"], 2],
      ["Hewan pemakan tumbuhan disebut…", ["Karnivora", "Herbivora", "Omnivora", "Insektivora"], 1],
      ["Cahaya merambat paling cepat melalui…", ["Air", "Kaca", "Ruang hampa", "Udara"], 2],
      ["Bagian sel yang mengatur seluruh kegiatan sel adalah…", ["Membran sel", "Sitoplasma", "Inti sel", "Dinding sel"], 2],
    ],
  },
  {
    title: "Astronomi Explorer",
    emoji: "🪐",
    subject: "Astronomi",
    jenjang: "UMUM",
    seconds: 20,
    published: true,
    desc: "Jelajahi tata surya dan galaksi. Cocok untuk pemanasan sebelum kelas Astronomi.",
    questions: [
      ["Planet yang paling dekat dengan Matahari adalah…", ["Venus", "Merkurius", "Mars", "Bumi"], 1],
      ["Satelit alami Bumi adalah…", ["Phobos", "Titan", "Bulan", "Europa"], 2],
      ["Bintang yang paling dekat dengan Bumi adalah…", ["Proxima Centauri", "Sirius", "Matahari", "Betelgeuse"], 2],
      ["Tata surya kita berada di galaksi…", ["Andromeda", "Bima Sakti", "Awan Magellan Besar", "Triangulum"], 1],
      ["Tahun cahaya adalah satuan…", ["Waktu", "Jarak", "Kecepatan", "Massa"], 1],
      ["Planet yang dijuluki 'Planet Merah' adalah…", ["Mars", "Jupiter", "Venus", "Merkurius"], 0],
      ["Gerhana Matahari terjadi ketika…", ["Bumi berada di antara Matahari dan Bulan", "Bulan berada di antara Matahari dan Bumi", "Matahari berada di antara Bumi dan Bulan", "Bulan berada di belakang Bumi"], 1],
      ["Planet dengan sistem cincin paling mencolok adalah…", ["Uranus", "Neptunus", "Saturnus", "Mars"], 2],
      ["Bumi berotasi satu kali dalam waktu sekitar…", ["12 jam", "24 jam", "7 hari", "365 hari"], 1],
      ["Fase Bulan ketika seluruh sisi yang menghadap Bumi terlihat terang disebut…", ["Bulan baru", "Bulan sabit", "Bulan purnama", "Kuartal pertama"], 2],
    ],
  },
  {
    title: "English Vocab Challenge",
    emoji: "📚",
    subject: "Bahasa Inggris",
    jenjang: "SMP",
    seconds: 15,
    published: true,
    desc: "Sinonim, antonim, tenses, dan kosakata sehari-hari. Seberapa cepat kamu menjawab?",
    questions: [
      ["Synonym of \"happy\" is…", ["Sad", "Joyful", "Angry", "Tired"], 1],
      ["Antonym of \"ancient\" is…", ["Old", "Modern", "Historic", "Classic"], 1],
      ["She ___ to school every day.", ["go", "goes", "going", "gone"], 1],
      ["Past tense of \"buy\" is…", ["buyed", "bought", "buied", "brought"], 1],
      ["\"Diligent\" dalam Bahasa Indonesia berarti…", ["Malas", "Rajin", "Pintar", "Ramah"], 1],
      ["I have lived here ___ 2020.", ["for", "since", "from", "at"], 1],
      ["Plural of \"child\" is…", ["childs", "childrens", "children", "childes"], 2],
      ["Which word is an adjective?", ["quickly", "beautiful", "run", "happiness"], 1],
    ],
  },
  {
    title: "Logika & Algoritma",
    emoji: "🧩",
    subject: "Informatika",
    jenjang: "SMA",
    seconds: 30,
    published: false,
    desc: "(Draft) Soal logika dan algoritma dasar untuk persiapan OSN Informatika.",
    questions: [
      ["s = 0; untuk i = 1 sampai 4: s = s + i. Nilai akhir s adalah…", ["4", "8", "10", "12"], 2],
      ["Bilangan biner 1011 sama dengan desimal…", ["9", "10", "11", "13"], 2],
      ["Struktur data dengan prinsip LIFO (Last In First Out) adalah…", ["Queue", "Stack", "Array", "Tree"], 1],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Helper PDF sederhana (untuk contoh materi PDF)                       */
/* ------------------------------------------------------------------ */
function makePdf(title: string, lines: string[]) {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const text = [
    "BT /F1 20 Tf 60 780 Td (" + esc(title) + ") Tj ET",
    ...lines.map((l, i) => `BT /F1 12 Tf 60 ${740 - i * 20} Td (${esc(l)}) Tj ET`),
  ].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/* ------------------------------------------------------------------ */
/* Impor Data Master Lead.xlsx                                          */
/* ------------------------------------------------------------------ */
function parseSheetDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  // SheetJS kadang meleset beberapa detik (mis. 23:59:56 WIB) → bulatkan ke tengah malam WIB terdekat
  if (v instanceof Date) return new Date(Math.round((v.getTime() + 7 * 3600_000) / DAY) * DAY - 7 * 3600_000);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * DAY) - 7 * 3600_000);
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00+07:00`);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

const SOURCE_MAP: Record<string, string> = {
  "Blast WA (FRM)": "Blast WA (RFM)",
  "Blast Telepon (FRM)": "Telepon (RFM)",
  "RFM/Telepon": "Telepon (RFM)",
  "Bundling POSI Pemesanan": "Bundling POSI",
};

function readLeadsFromExcel(ownerByName: Record<string, number>) {
  const file = path.resolve(process.cwd(), "..", "Data Master Lead.xlsx");
  if (!fs.existsSync(file)) {
    console.warn(`  ! ${file} tidak ditemukan, impor lead dilewati`);
    return [];
  }
  const wb = XLSX.read(fs.readFileSync(file), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const str = (v: unknown) => (v == null || String(v).trim() === "" || String(v).trim() === "-" ? null : String(v).trim());

  return rows
    .slice(1)
    .filter((r) => str(r[2]) || str(r[3]))
    .filter((r) => !String(r[4] ?? "").endsWith("@email.com")) // 3 baris contoh di Excel
    .map((r) => {
      const admin = str(r[10]);
      const nominal = str(r[15]);
      const catatan = [str(r[20]), admin && !ownerByName[admin] ? `Admin di Excel: ${admin}` : null].filter(Boolean).join(" · ");
      return {
        tanggalMasuk: parseSheetDate(r[1]) ?? new Date(),
        nama: str(r[2]) ?? "(tanpa nama)",
        noWa: normalizePhone(r[3]),
        email: str(r[4])?.toLowerCase() ?? null,
        sumberLead: SOURCE_MAP[str(r[5]) ?? ""] ?? str(r[5]) ?? "Lainnya",
        campaign: str(r[6]),
        kategori: str(r[7]) ?? "Calon Customer",
        produk: str(r[8]),
        paket: str(r[9]),
        ownerId: admin ? (ownerByName[admin] ?? null) : null,
        statusFunnel: str(r[11]) ?? "Baru",
        trialMimpimu: str(r[12]),
        invoiceId: str(r[13]),
        statusBayar: str(r[14]),
        nominal: nominal ? Number(nominal.replace(/\D/g, "")) || null : null,
        // Excel tidak punya kolom tanggal bayar → perkiraan: last contact / tanggal masuk (mana yang lebih akhir)
        tanggalBayar:
          (str(r[11]) ?? "") === "Paid"
            ? new Date(Math.max((parseSheetDate(r[1]) ?? new Date()).getTime(), parseSheetDate(r[16])?.getTime() ?? 0))
            : null,
        lastContact: parseSheetDate(r[16]),
        nextFollowUp: parseSheetDate(r[17]),
        objection: str(r[18]),
        nextAction: str(r[19]),
        catatan: catatan || null,
      };
    });
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log("🧹 Mengosongkan tabel…");
  await prisma.gameScore.deleteMany();
  await prisma.gameQuestion.deleteMany();
  await prisma.game.deleteMany();
  await prisma.material.deleteMany();
  await prisma.classSession.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash("password123", 10);

  console.log("👥 Akun tim & peserta demo…");
  await prisma.user.create({ data: { name: "Root POSI", email: "root@posi.local", role: "ROOT", password } });
  const leader = await prisma.user.create({ data: { name: "Team Leader POSI", email: "superadmin@posi.local", role: "SUPERADMIN", password } });
  const devia = await prisma.user.create({ data: { name: "Devia", email: "admin1@posi.local", role: "ADMIN", password, phone: "6282276994359" } });
  const junhi = await prisma.user.create({ data: { name: "Junhi", email: "admin2@posi.local", role: "ADMIN", password, phone: "6282276994359" } });
  const admins = [devia, junhi];

  const demoPeserta = await prisma.user.create({
    data: { name: "Peserta Demo", email: "peserta@posi.local", role: "PESERTA", password, phone: "6281200000000", school: "SMPN 1 Medan", jenjang: "SMP" },
  });

  console.log("📚 Kelas COC…");
  const now = Date.now();
  const products = [];
  for (const p of PRODUCTS) {
    const [paid] = DEMO_REGS[p.name] ?? [0, 0, 0];
    const status: ProductStatus = paid >= 15 ? "RUNNING" : "OPEN";
    products.push(
      await prisma.product.create({
        data: {
          name: p.name,
          slug: slugify(p.name),
          bidang: p.bidang,
          jenjang: p.jenjang,
          level: "Advance",
          gradeLabel: p.grade ?? (p.jenjang === "UMUM" ? "SMP–SMA" : null),
          shortDesc: `Kelas pendampingan intensif untuk ${p.focus}, bersama tutor medalis.`,
          description: [
            `Champion Online Class ${p.bidang} dirancang untuk peserta yang menargetkan ${p.focus}.`,
            "",
            "Yang kamu dapatkan:",
            "• Sesi live bersama tutor expert medalis (online)",
            "• Metode realistis-eksploratif: konsep → latihan terarah → pembahasan",
            "• Materi PDF, video, dan artikel yang bisa diakses kapan saja di dashboard",
            "• Latihan soal bertahap dan games edukasi dengan leaderboard",
            "",
            "Kelas dimulai setelah minimal 15 peserta terdaftar & lunas di bidang ini.",
          ].join("\n"),
          price: 299000,
          priceUnit: "bulan",
          minQuota: 15,
          scheduleInfo: p.jenjang === "SD" ? "Setiap Sabtu, 09.00–10.30 WIB (Zoom)" : "Setiap Sabtu & Minggu, 19.00–20.30 WIB (Zoom)",
          startDate: status === "RUNNING" ? new Date(now - 10 * DAY) : new Date(now + 21 * DAY),
          status,
        },
      }),
    );
  }
  const byName = new Map(products.map((p) => [p.name, p]));

  console.log("🧾 Pendaftar demo (+ lead otomatis)…");
  let counter = 0;
  const demoUsers: { id: number; name: string; school: string }[] = [];
  let adminTurn = 0;
  for (const [productName, [paid, pending, other]] of Object.entries(DEMO_REGS)) {
    const product = byName.get(productName)!;
    const statuses: RegistrationStatus[] = [
      ...Array(paid).fill("PAID"),
      ...Array(pending).fill("PENDING"),
      ...Array.from({ length: other }, () => pick(["EXPIRED", "CANCELLED"] as const)),
    ];
    for (const status of statuses) {
      counter++;
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const school = pick(SCHOOLS);
      const phone = `628${randInt(11, 99)}${String(randInt(1000000, 9999999))}`;
      const user = await prisma.user.create({
        data: {
          name,
          email: `demo${counter}@demo.posi.local`,
          role: "PESERTA",
          password,
          phone,
          school,
          jenjang: product.jenjang === "UMUM" ? "SMA" : product.jenjang,
          createdAt: new Date(now - randInt(1, 35) * DAY),
        },
      });
      demoUsers.push({ id: user.id, name, school });
      const createdAt = new Date(now - randInt(0, 29) * DAY - randInt(0, 20) * 3600_000);
      const admin = admins[adminTurn++ % admins.length];
      const source = pick(REG_SOURCES);
      const code = `COC-DEMO-${String(counter).padStart(4, "0")}`;
      const paidAt = status === "PAID" ? new Date(createdAt.getTime() + randInt(1, 30) * 3600_000) : null;
      await prisma.registration.create({
        data: {
          code,
          userId: user.id,
          productId: product.id,
          fullName: name,
          school,
          phone,
          email: user.email,
          source,
          adminId: admin.id,
          amount: product.price,
          status,
          paymentType: status === "PAID" ? pick(["bank_transfer", "qris", "gopay", "echannel"]) : null,
          paidAt,
          createdAt,
        },
      });
      await prisma.lead.create({
        data: {
          tanggalMasuk: createdAt,
          nama: name,
          noWa: phone,
          email: user.email,
          sumberLead: leadSource(source),
          campaign: `Web pendaftaran (${source})`,
          kategori: status === "PAID" ? "Customer Baru" : "Calon Customer",
          produk: "COC",
          paket: product.name,
          ownerId: admin.id,
          statusFunnel: status === "PAID" ? "Paid" : status === "PENDING" ? "Pending" : "Lost",
          invoiceId: code,
          statusBayar: status === "PAID" ? "Paid" : status === "PENDING" ? "Pending" : "Belum Ada",
          nominal: product.price,
          tanggalBayar: status === "PAID" ? paidAt : null,
          lastContact: createdAt,
          nextFollowUp: status === "PENDING" ? new Date(createdAt.getTime() + DAY) : null,
          nextAction: status === "PAID" ? "Kirim info grup kelas & jadwal" : status === "PENDING" ? "Follow-up pembayaran" : null,
          catatan: "Data demo (seed)",
        },
      });
    }
  }

  // Peserta demo utama: lunas di 2 kelas, pending di 1 kelas
  const demoRegs: [string, RegistrationStatus][] = [
    ["Matematika SMP Advance (Persiapan Olimpiade)", "PAID"],
    ["IPA SMP Advance", "PAID"],
    ["Astronomi Advance", "PENDING"],
  ];
  for (const [i, [pn, status]] of demoRegs.entries()) {
    const product = byName.get(pn)!;
    await prisma.registration.create({
      data: {
        code: `COC-DEMO-P${i + 1}`,
        userId: demoPeserta.id,
        productId: product.id,
        fullName: demoPeserta.name,
        school: demoPeserta.school!,
        phone: demoPeserta.phone!,
        email: demoPeserta.email,
        source: "Iklan Web POSI",
        adminId: admins[i % 2].id,
        amount: product.price,
        status,
        paymentType: status === "PAID" ? "qris" : null,
        paidAt: status === "PAID" ? new Date(now - 5 * DAY) : null,
        createdAt: new Date(now - 6 * DAY),
      },
    });
  }

  console.log("🗓️  Jadwal kelas…");
  for (const p of products.filter((x) => x.status === "RUNNING")) {
    const base = new Date(now - 7 * DAY);
    base.setUTCHours(12, 0, 0, 0); // 19.00 WIB
    const topics = p.bidang === "Matematika" ? ["Aljabar & Persamaan", "Teori Bilangan", "Geometri", "Kombinatorika", "Try Out & Pembahasan", "Strategi OSN"] : ["Konsep Dasar", "Latihan Terarah", "Pembahasan Soal", "Try Out"];
    for (const [i, t] of topics.entries()) {
      // Sabtu & Minggu tiap pekan, 19.00 WIB
      const startAt = new Date(base.getTime() + (Math.floor(i / 2) * 7 + (i % 2)) * DAY);
      await prisma.classSession.create({
        data: { productId: p.id, title: `Pertemuan ${i + 1}: ${t}`, startAt, endAt: new Date(startAt.getTime() + 90 * 60_000), meetingUrl: "https://zoom.us/j/0000000000", notes: i === 0 ? "Siapkan buku catatan & kalkulator." : null },
      });
    }
  }

  console.log("📄 Materi contoh…");
  const storageDir = path.join(process.cwd(), "storage", "materials");
  fs.rmSync(storageDir, { recursive: true, force: true }); // file materi lama ikut dibersihkan
  fs.mkdirSync(storageDir, { recursive: true });
  const matSmp = byName.get("Matematika SMP Advance (Persiapan Olimpiade)")!;
  const ipaSmp = byName.get("IPA SMP Advance")!;
  const matSma = byName.get("Matematika SMA Advance (Persiapan Olimpiade)")!;

  const pdfName = `${crypto.randomUUID()}.pdf`;
  fs.writeFileSync(
    path.join(storageDir, pdfName),
    makePdf("Modul 1 - Teori Bilangan (OSN SMP)", [
      "1. Keterbagian: a membagi b jika b = a.k untuk suatu bilangan bulat k.",
      "2. FPB dan KPK: FPB(a,b) x KPK(a,b) = a x b.",
      "3. Bilangan prima: hanya punya dua faktor, 1 dan dirinya sendiri.",
      "4. Kongruensi: a = b (mod n) jika n membagi (a - b).",
      "",
      "Latihan:",
      "a) Tentukan FPB(84, 126).",
      "b) Berapa sisa pembagian 2^10 oleh 7?",
      "c) Buktikan bahwa n^3 - n selalu habis dibagi 6.",
    ]),
  );

  await prisma.material.createMany({
    data: [
      {
        productId: matSmp.id,
        authorId: devia.id,
        type: "ARTICLE",
        title: "Selamat datang di COC Matematika SMP!",
        summary: "Panduan memulai kelas: jadwal, aturan main, dan cara belajar efektif.",
        content: [
          "## Halo, calon juara! 👋",
          "Terima kasih sudah bergabung di **Champion Online Class Matematika SMP**. Kelas ini disusun untuk membantumu bersiap menghadapi OSN.",
          "## Cara belajar di kelas ini",
          "1. Ikuti sesi live setiap Sabtu & Minggu pukul 19.00 WIB.\n2. Kerjakan latihan di modul PDF sebelum sesi berikutnya.\n3. Tonton ulang video pembahasan jika ada materi yang terlewat.\n4. Main games **Matematika Kilat** untuk melatih kecepatan berhitung.",
          "## Tips dari tutor",
          "- Jangan langsung melihat pembahasan, coba dulu minimal 10 menit.\n- Tulis ide penyelesaianmu, walau belum lengkap.\n- Tanyakan di grup jika ragu. Tidak ada pertanyaan yang bodoh!",
          "Sampai jumpa di kelas! 🚀",
        ].join("\n\n"),
      },
      {
        productId: matSmp.id,
        authorId: devia.id,
        type: "PDF",
        title: "Modul 1 – Teori Bilangan",
        summary: "Keterbagian, FPB/KPK, bilangan prima, dan kongruensi + latihan.",
        url: `/api/files/${pdfName}`,
      },
      {
        productId: matSma.id,
        authorId: junhi.id,
        type: "VIDEO",
        title: "Pengantar Vektor (video referensi)",
        summary: "Video referensi konsep vektor sebagai bekal geometri analitik.",
        url: "https://www.youtube.com/watch?v=fNk_zzaMoSs",
        content: "Tonton video ini sebelum Pertemuan 3. Catat 3 hal baru yang kamu pelajari.",
      },
      {
        productId: ipaSmp.id,
        authorId: junhi.id,
        type: "ARTICLE",
        title: "Rangkuman: Gerak Lurus",
        summary: "GLB dan GLBB dalam satu halaman.",
        content: [
          "## Gerak Lurus Beraturan (GLB)",
          "Benda bergerak dengan **kecepatan tetap**. Rumus: *s = v × t*.",
          "## Gerak Lurus Berubah Beraturan (GLBB)",
          "Benda bergerak dengan **percepatan tetap**.",
          "- v = v₀ + a·t\n- s = v₀·t + ½·a·t²\n- v² = v₀² + 2·a·s",
          "### Contoh",
          "Sebuah mobil mulai dari diam dengan percepatan 2 m/s². Setelah 5 detik, kecepatannya adalah v = 0 + 2 × 5 = **10 m/s**.",
        ].join("\n\n"),
      },
    ],
  });

  console.log("📇 Impor Data Master Lead.xlsx…");
  const leads = readLeadsFromExcel({ Devia: devia.id, Junhi: junhi.id });
  if (leads.length) await prisma.lead.createMany({ data: leads });
  console.log(`   ${leads.length} lead diimpor`);

  console.log("🎮 Games & skor…");
  for (const g of GAMES) {
    const game = await prisma.game.create({
      data: {
        title: g.title,
        slug: slugify(g.title),
        emoji: g.emoji,
        subject: g.subject,
        jenjang: g.jenjang,
        description: g.desc,
        secondsPerQuestion: g.seconds,
        isPublished: g.published,
        launchedAt: g.published ? new Date(now - randInt(3, 30) * DAY) : null,
        questions: { create: g.questions.map(([text, options, answerIndex], i) => ({ text, options, answerIndex, order: i + 1, points: 100 })) },
      },
    });
    // Skor tidak di-seed: leaderboard hanya berisi skor asli dari peserta yang benar-benar bermain.
  }

  const counts = {
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    registrations: await prisma.registration.count(),
    leads: await prisma.lead.count(),
    games: await prisma.game.count(),
    scores: await prisma.gameScore.count(),
  };
  console.log("✅ Selesai:", counts);
  console.log(`   Superadmin: ${leader.email} | Admin: ${devia.email}, ${junhi.email} | Peserta: ${demoPeserta.email} — password: password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

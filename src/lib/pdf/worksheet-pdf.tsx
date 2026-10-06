import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { Circle, Defs, Document, G, Image, Line, LinearGradient, Page, RadialGradient, Rect, Stop, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { parseRich, richImageUrls, WORKSHEET_IMG_SRC, type RichBlock } from "@/lib/rich-text";
import { splitMath } from "@/lib/latex";
import { LETTERS } from "@/lib/worksheet-shared";
import { WORKSHEET_IMG_DIR } from "@/lib/storage";
import type { WorksheetPdfConfig } from "@/lib/worksheet-pdf-config";
import { SANS, registerFonts } from "./fonts";
import { MathPdf, texToSvg } from "./math-svg";

/** A4 potret (pt) */
const W = 595.28;
const H = 841.89;
const MM = 2.8346;
const INK = "#0f2436";
const MUTED = "#5f8bab";
const BLUE = "#1a6f9f";
const SUN = "#f9d014";
const FS = 10.5;

type Img = { data: Buffer; format: "png" | "jpg" };
export type WorksheetPdfQuestion = {
  text: string;
  imageUrl: string | null;
  options: string[];
  answerIndex: number;
  points: number;
  explanation: string | null;
};
export type WorksheetPdfData = {
  className: string;
  meetingNumber: number;
  meetingTitle: string;
  dateText: string;
  questions: WorksheetPdfQuestion[];
};

/* ---------------- latar bawaan: biru + jaring kotak ala hero landing ---------------- */

function DefaultBackground() {
  const minor = 22;
  const major = minor * 4;
  const lines = [];
  for (let x = 0; x <= W; x += minor)
    lines.push(
      <Line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={H}
        stroke={x % major === 0 ? SUN : "#ffffff"}
        strokeOpacity={x % major === 0 ? 0.16 : 0.07}
        strokeWidth={0.6}
      />,
    );
  for (let y = 0; y <= H; y += minor)
    lines.push(
      <Line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={W}
        y2={y}
        stroke={y % major === 0 ? SUN : "#ffffff"}
        strokeOpacity={y % major === 0 ? 0.16 : 0.07}
        strokeWidth={0.6}
      />,
    );
  return (
    <Svg fixed style={{ position: "absolute", top: 0, left: 0 }} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0b2638" />
          <Stop offset="0.5" stopColor="#14577d" />
          <Stop offset="1" stopColor="#1a6f9f" />
        </LinearGradient>
        <RadialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={SUN} stopOpacity={0.35} />
          <Stop offset="1" stopColor={SUN} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="sky" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#6ab7e1" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#6ab7e1" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#bg)" />
      <Circle cx={W * 0.88} cy={H * 0.06} r={260} fill="url(#sun)" />
      <Circle cx={W * 0.08} cy={H * 0.95} r={240} fill="url(#sky)" />
      <G>{lines}</G>
    </Svg>
  );
}

/* ---------------- teks kaya → react-pdf ---------------- */

function Inline({ text, size = FS, color = INK, bold = false }: { text: string; size?: number; color?: string; bold?: boolean }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        const parts = splitMath(line);
        const style = { fontFamily: SANS, fontSize: size, color, fontWeight: bold ? 700 : 400, lineHeight: 1.45 } as const;
        if (!parts.some((p) => p.type === "math"))
          return line.trim() ? (
            <Text key={li} style={style}>
              {line}
            </Text>
          ) : (
            <View key={li} style={{ height: size * 0.6 }} />
          );
        // baris dengan rumus: kata & rumus sebagai potongan yang bisa dibungkus
        const pieces: React.ReactNode[] = [];
        parts.forEach((p, pi) => {
          if (p.type === "text") {
            p.value.split(/(\s+)/).forEach((w, wi) => {
              if (w && !/^\s+$/.test(w))
                pieces.push(
                  <Text key={`${pi}-${wi}`} style={style}>
                    {w}
                  </Text>,
                );
              else if (w)
                pieces.push(
                  <Text key={`${pi}-${wi}`} style={style}>
                    {" "}
                  </Text>,
                );
            });
          } else {
            const svg = texToSvg(p.value, p.display);
            if (!svg)
              pieces.push(
                <Text key={pi} style={{ ...style, fontStyle: "italic" }}>
                  {p.value}
                </Text>,
              );
            else if (p.display)
              pieces.push(
                <View key={pi} style={{ width: "100%", alignItems: "center", marginVertical: 3 }}>
                  <MathPdf svg={svg} fontSize={size} color={color} />
                </View>,
              );
            else pieces.push(<MathPdf key={pi} svg={svg} fontSize={size} color={color} />);
          }
        });
        return (
          <View key={li} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
            {pieces}
          </View>
        );
      })}
    </>
  );
}

function Rich({ blocks, images, size = FS, color = INK }: { blocks: RichBlock[]; images: Map<string, Img | null>; size?: number; color?: string }) {
  return (
    <View style={{ gap: 4 }}>
      {blocks.map((b, i) => {
        if (b.type === "p") return <Inline key={i} text={b.text} size={size} color={color} />;
        if (b.type === "img") {
          const img = images.get(b.src);
          return img ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya atribut alt
            <Image key={i} src={img} style={{ maxWidth: "100%", maxHeight: 230, objectFit: "contain", alignSelf: "flex-start", marginVertical: 3 }} />
          ) : (
            <Text key={i} style={{ fontFamily: SANS, fontSize: size - 1.5, color: MUTED }}>
              [gambar tidak dapat ditampilkan di PDF]
            </Text>
          );
        }
        return (
          <View key={i} style={{ borderWidth: 0.7, borderColor: "#bfd3e3", borderRadius: 4, marginVertical: 3, alignSelf: "flex-start", maxWidth: "100%" }}>
            {b.rows.map((r, ri) => (
              <View
                key={ri}
                style={{
                  flexDirection: "row",
                  backgroundColor: b.header && ri === 0 ? "#eaf4fb" : undefined,
                  borderTopWidth: ri ? 0.7 : 0,
                  borderColor: "#bfd3e3",
                }}
              >
                {r.map((c, ci) => (
                  <View
                    key={ci}
                    style={{ paddingVertical: 3, paddingHorizontal: 6, minWidth: 60, maxWidth: 220, borderLeftWidth: ci ? 0.7 : 0, borderColor: "#bfd3e3" }}
                  >
                    <Inline text={c} size={size - 1} bold={b.header && ri === 0} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/* ---------------- dokumen ---------------- */

function questionBlocks(q: WorksheetPdfQuestion) {
  const blocks = parseRich(q.text);
  if (q.imageUrl && WORKSHEET_IMG_SRC.test(q.imageUrl)) blocks.push({ type: "img", src: q.imageUrl, alt: "gambar soal" });
  return blocks;
}

function WorksheetDoc({
  data,
  config,
  background,
  images,
}: {
  data: WorksheetPdfData;
  config: WorksheetPdfConfig;
  background: Img | null;
  images: Map<string, Img | null>;
}) {
  const m = { top: config.marginTop * MM, bottom: config.marginBottom * MM, left: config.marginLeft * MM, right: config.marginRight * MM };
  const inner = config.paper ? 22 : 0;
  const headerH = 22;
  const footerH = 20;
  const totalPoints = data.questions.reduce((s, q) => s + q.points, 0);
  return (
    <Document title={`Soal & Pembahasan — ${data.meetingTitle}`} author="Pelatihan POSI" subject={data.className}>
      <Page
        size="A4"
        style={{
          paddingTop: m.top + inner + headerH,
          paddingBottom: m.bottom + inner + footerH,
          paddingLeft: m.left + inner,
          paddingRight: m.right + inner,
          fontFamily: SANS,
          color: INK,
          backgroundColor: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya atribut alt */}
        {background ? <Image fixed src={background} style={{ position: "absolute", top: 0, left: 0, width: W, height: H }} /> : <DefaultBackground />}
        {config.paper && (
          <View
            fixed
            style={{ position: "absolute", top: m.top, left: m.left, right: m.right, bottom: m.bottom, backgroundColor: "#ffffff", borderRadius: 14 }}
          />
        )}
        {/* header berjalan */}
        <View
          fixed
          style={{
            position: "absolute",
            top: m.top + (config.paper ? 12 : 0),
            left: m.left + inner,
            right: m.right + inner,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 7.5, color: config.paper || !background ? MUTED : INK }}>{data.className}</Text>
          <Text style={{ fontSize: 7.5, color: config.paper || !background ? MUTED : INK }}>Pertemuan {data.meetingNumber} · Soal & Pembahasan</Text>
        </View>
        <Text
          fixed
          style={{
            position: "absolute",
            bottom: m.bottom + (config.paper ? 10 : 0),
            left: m.left + inner,
            right: m.right + inner,
            fontSize: 7.5,
            color: MUTED,
            textAlign: "center",
          }}
          render={({ pageNumber, totalPages }) => `Pelatihan POSI · halaman ${pageNumber} dari ${totalPages}`}
        />

        {/* judul */}
        <View style={{ marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1.5, borderColor: SUN }}>
          <Text style={{ fontSize: 8.5, fontWeight: 700, color: BLUE, letterSpacing: 1.5 }}>SOAL & PEMBAHASAN WORKSHEET</Text>
          <Text style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 3 }}>
            Pertemuan {data.meetingNumber}: {data.meetingTitle}
          </Text>
          <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>
            {data.className} · {data.dateText} · {data.questions.length} soal · {totalPoints} poin
          </Text>
        </View>

        {data.questions.map((q, i) => (
          <View key={i} style={{ marginBottom: 14 }} minPresenceAhead={80}>
            <View wrap={false} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5, gap: 6 }}>
              <View style={{ backgroundColor: BLUE, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 }}>
                <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: 700 }}>Soal {i + 1}</Text>
              </View>
              <Text style={{ fontSize: 8, color: MUTED }}>{q.points} poin</Text>
            </View>
            <Rich blocks={questionBlocks(q)} images={images} />
            <View style={{ marginTop: 6, gap: 3 }}>
              {q.options.map((o, oi) => (
                <View
                  key={oi}
                  wrap={false}
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                    borderRadius: 5,
                    backgroundColor: oi === q.answerIndex ? "#e8f7ef" : undefined,
                  }}
                >
                  <Text style={{ fontSize: FS, fontWeight: 700, color: oi === q.answerIndex ? "#047857" : BLUE, width: 17, flexShrink: 0 }} wrap={false}>{LETTERS[oi]}.</Text>
                  <View style={{ flex: 1 }}>
                    <Rich blocks={parseRich(o)} images={images} />
                  </View>
                </View>
              ))}
            </View>
            <View style={{ marginTop: 7, borderRadius: 8, backgroundColor: "#f2f8fc", borderLeftWidth: 3, borderColor: SUN, padding: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: BLUE }}>
                Kunci jawaban: <Text style={{ color: "#047857" }}>{LETTERS[q.answerIndex] ?? "-"}</Text>
              </Text>
              {q.explanation ? (
                <View style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 8.5, fontWeight: 700, color: MUTED, marginBottom: 2 }}>PEMBAHASAN</Text>
                  <Rich blocks={parseRich(q.explanation)} images={images} size={FS - 0.5} />
                </View>
              ) : null}
            </View>
          </View>
        ))}
        {!data.questions.length && <Text style={{ fontSize: 11, color: MUTED }}>Belum ada soal pada worksheet ini.</Text>}
      </Page>
    </Document>
  );
}

async function loadImage(url: string): Promise<Img | null> {
  const name = url.match(/\/api\/worksheet-img\/([a-f0-9-]+\.(jpg|png|webp))$/);
  if (!name || name[2] === "webp") return null; // WebP belum didukung pembuat PDF
  try {
    return { data: await fs.readFile(path.join(WORKSHEET_IMG_DIR, name[1])), format: name[2] === "jpg" ? "jpg" : "png" };
  } catch {
    return null;
  }
}

export async function renderWorksheetPdf(data: WorksheetPdfData, config: WorksheetPdfConfig, background: Img | null) {
  registerFonts();
  const urls = new Set<string>();
  for (const q of data.questions) {
    if (q.imageUrl) urls.add(q.imageUrl);
    for (const t of [q.text, q.explanation, ...q.options]) richImageUrls(t).forEach((u) => urls.add(u));
  }
  const images = new Map<string, Img | null>();
  await Promise.all([...urls].map(async (u) => images.set(u, await loadImage(u))));
  return renderToBuffer(<WorksheetDoc data={data} config={config} background={background} images={images} />);
}

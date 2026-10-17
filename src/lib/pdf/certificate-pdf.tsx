import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Image,
  Page,
  Path,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import {
  boldSegments,
  signBoxHeight,
  signYOf,
  type CertificateConfig,
} from "@/lib/certificate";
import { SANS, SCRIPT, SERIF, registerFonts } from "./fonts";

/** Latar bawaan sesuai contoh sertifikat POSI (judul, logo, stempel & maskot sudah ada di gambar) */
const SAMPLE_BG = path.join(
  process.cwd(),
  "assets",
  "certificate",
  "latar-sertifikat.jpg",
);
/** versi polos (tanpa stempel & tanda tangan lama) — dipakai bila admin mengunggah gambar tanda tangan */
const SAMPLE_BG_PLAIN = path.join(
  process.cwd(),
  "assets",
  "certificate",
  "latar-sertifikat-polos.jpg",
);
const sampleCache = new Map<string, Buffer | null>();
function sampleBackground(plain: boolean) {
  const file =
    plain && fs.existsSync(SAMPLE_BG_PLAIN) ? SAMPLE_BG_PLAIN : SAMPLE_BG;
  if (!sampleCache.has(file))
    sampleCache.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
  return sampleCache.get(file)!;
}

/** A4 lanskap (pt) */
const W = 842;
const H = 595;
const pct = (v: number) => (v / 100) * H;

/**
 * Bingkai tetap satu halaman A4 lanskap. Semua isi sertifikat diposisikan absolut di dalamnya.
 * JANGAN memakai `wrap={false}` di <Page>: react-pdf lalu menghitung tinggi halaman dari isi yang mengalir —
 * karena semuanya absolut, tinggi halaman menjadi 0 (PDF kosong). Tanpa bingkai ini, teks yang kepanjangan memecah ke halaman baru.
 */
function Sheet({
  children,
  backgroundColor,
}: {
  children: React.ReactNode;
  backgroundColor?: string;
}) {
  return (
    <View
      wrap={false}
      style={{
        position: "relative",
        width: 841.89,
        height: 595,
        overflow: "hidden",
        backgroundColor,
      }}
    >
      {children}
    </View>
  );
}

export type CertificateData = {
  name: string;
  body: string;
  number: string | null;
  dateLine: string | null;
  /** gambar tanda tangan (opsional) */
  signImage?: { data: Buffer; format: "png" | "jpg" } | null;
};

/**
 * Blok penanda tangan: gambar tanda tangan tepat di atas nama, lalu jabatan di bawahnya.
 * Diposisikan dengan tengah = signX% dari kiri dan baris nama = signY% dari atas.
 */
function SignerBlock({
  c,
  data,
  sample,
  color,
  mutedColor,
}: {
  c: CertificateConfig;
  data: CertificateData;
  sample: boolean;
  color: string;
  mutedColor: string;
}) {
  const signer = c.signers[0];
  if (!signer && !data.signImage) return null;
  const nameTop = (signYOf(c, sample) / 100) * H;
  const boxH = signBoxHeight(c.signWidth);
  const cx = (c.signX / 100) * W;
  const blockW = Math.max(240, c.signWidth + 40);
  return (
    <>
      {data.signImage ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image
          src={data.signImage}
          style={{
            position: "absolute",
            top: nameTop - boxH - 2,
            left: cx - c.signWidth / 2,
            width: c.signWidth,
            height: boxH,
            objectFit: "contain",
          }}
        />
      ) : null}
      {signer ? (
        <View
          style={{
            position: "absolute",
            top: nameTop,
            left: cx - blockW / 2,
            width: blockW,
            alignItems: "center",
          }}
        >
          {signer.name ? (
            <Text
              style={{
                fontSize: 11,
                fontWeight: 700,
                color,
                textDecoration: "underline",
              }}
            >
              {signer.name}
            </Text>
          ) : null}
          {signer.title ? (
            <Text style={{ fontSize: 9.5, color: mutedColor, marginTop: 2 }}>
              {signer.title}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/** Bingkai bawaan bila admin belum mengunggah gambar latar */
function DefaultFrame() {
  return (
    <>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          backgroundColor: "#fdfcff",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          right: 14,
          bottom: 14,
          borderWidth: 6,
          borderColor: "#0f2436",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 26,
          left: 26,
          right: 26,
          bottom: 26,
          borderWidth: 1,
          borderColor: "#c9a227",
        }}
      />
      <Svg
        style={{ position: "absolute", top: 0, left: 0 }}
        width={180}
        height={180}
        viewBox="0 0 180 180"
      >
        <Path d="M0 0 L180 0 L0 180 Z" fill="#133e57" opacity={0.95} />
        <Path d="M0 0 L130 0 L0 130 Z" fill="#1a6f9f" />
        <Path d="M0 150 L150 0 L162 0 L0 162 Z" fill="#c9a227" />
      </Svg>
      <Svg
        style={{ position: "absolute", bottom: 0, right: 0 }}
        width={180}
        height={180}
        viewBox="0 0 180 180"
      >
        <Path d="M180 180 L0 180 L180 0 Z" fill="#133e57" opacity={0.95} />
        <Path d="M180 180 L50 180 L180 50 Z" fill="#1a6f9f" />
        <Path d="M180 30 L30 180 L18 180 L180 18 Z" fill="#c9a227" />
      </Svg>
    </>
  );
}

function CertificateDoc({
  config: c,
  data,
  background,
}: {
  config: CertificateConfig;
  data: CertificateData;
  background: { data: Buffer; format: "png" | "jpg" } | null;
}) {
  const nameFont =
    c.nameFont === "script"
      ? { fontFamily: SCRIPT, fontSize: 50 }
      : c.nameFont === "serif"
        ? { fontFamily: SERIF, fontSize: 38 }
        : { fontFamily: SANS, fontSize: 32, fontWeight: 800 };
  const center = {
    position: "absolute" as const,
    left: 90,
    right: 90,
    textAlign: "center" as const,
  };
  const titleTop = Math.max(6, c.nameTop - 27);
  return (
    <Document
      title={`Sertifikat ${data.name}`}
      author="Pelatihan POSI"
      creator="Pelatihan POSI"
    >
      <Page
        size="A4"
        orientation="landscape"
        style={{ fontFamily: SANS, color: c.textColor }}
      >
        <Sheet>
          {background ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              src={background}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: W,
                height: H,
                objectFit: "cover",
              }}
            />
          ) : (
            <DefaultFrame />
          )}
          {c.title ? (
            <Text
              style={{
                ...center,
                top: pct(titleTop),
                fontFamily: SERIF,
                fontSize: 42,
                letterSpacing: 6,
                color: c.textColor,
              }}
            >
              {c.title}
            </Text>
          ) : null}
          {c.subtitle ? (
            <Text
              style={{
                ...center,
                top: pct(titleTop) + (c.title ? 52 : 0),
                fontSize: 11,
                letterSpacing: 1.5,
                color: c.textColor,
                opacity: 0.8,
              }}
            >
              {c.subtitle}
            </Text>
          ) : null}
          {c.showNumber && data.number ? (
            <Text
              style={{
                ...center,
                top: pct(titleTop) + (c.title ? 70 : 18),
                fontSize: 9,
                color: c.textColor,
                opacity: 0.7,
              }}
            >
              No. {data.number}
            </Text>
          ) : null}
          {c.intro ? (
            <Text
              style={{
                ...center,
                top: pct(c.nameTop) - 30,
                fontSize: 12,
                color: c.textColor,
              }}
            >
              {c.intro}
            </Text>
          ) : null}
          <Text
            style={{
              ...center,
              top: pct(c.nameTop) - 6,
              color: c.nameColor,
              ...nameFont,
            }}
          >
            {data.name}
          </Text>
          <View
            style={{
              position: "absolute",
              top: pct(c.nameTop) + (c.nameFont === "script" ? 58 : 46),
              left: W / 2 - 150,
              width: 300,
              borderBottomWidth: 1,
              borderBottomColor: c.nameColor,
              opacity: 0.5,
            }}
          />
          {data.body ? (
            <RichBody
              text={data.body}
              color={c.textColor}
              boldColor={c.textColor}
              fontSize={12}
              style={{
                position: "absolute",
                top: pct(c.nameTop) + (c.nameFont === "script" ? 70 : 58),
                left: 130,
                right: 130,
              }}
            />
          ) : null}
          {data.dateLine ? (
            <Text
              style={{
                position: "absolute",
                top:
                  pct(signYOf(c, false)) -
                  (data.signImage ? signBoxHeight(c.signWidth) : 46) -
                  20,
                left: (c.signX / 100) * W - 150,
                width: 300,
                textAlign: "center",
                fontSize: 10.5,
                color: c.textColor,
              }}
            >
              {data.dateLine}
            </Text>
          ) : null}
          <SignerBlock
            c={c}
            data={data}
            sample={false}
            color={c.textColor}
            mutedColor={c.textColor}
          />
        </Sheet>
      </Page>
    </Document>
  );
}

/** Isi paragraf dengan **teks tebal** */
function RichBody({
  text,
  color,
  boldColor,
  fontSize,
  style,
}: {
  text: string;
  color: string;
  boldColor: string;
  fontSize: number;
  style?: Style;
}) {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <View style={style}>
      {paras.map((p, i) => (
        <Text
          key={i}
          style={{
            textAlign: "center",
            fontSize,
            lineHeight: 1.65,
            color,
            marginBottom: i < paras.length - 1 ? 14 : 0,
          }}
        >
          {boldSegments(p.replace(/\n/g, " ")).map((seg, j) =>
            seg.bold ? (
              <Text key={j} style={{ fontWeight: 700, color: boldColor }}>
                {seg.text}
              </Text>
            ) : (
              seg.text
            ),
          )}
        </Text>
      ))}
    </View>
  );
}

/**
 * Desain bawaan = contoh sertifikat POSI (A4 lanskap). Koordinat diukur dari latar 1920×1080 yang direntang ke 842×595 pt.
 * Teks dinamis: nomor, nama (huruf sambung di atas garis), isi, kota & tanggal, nama penanda tangan.
 */
function SampleCertificate({
  config: c,
  data,
  bg,
}: {
  config: CertificateConfig;
  data: CertificateData;
  bg: Buffer;
}) {
  const TEXT = "#5b5048";
  const DARK = "#3b2f27";
  const nameSize = data.name.length > 34 ? 32 : data.name.length > 26 ? 38 : 44;
  return (
    <Document
      title={`Sertifikat ${data.name}`}
      author="Pelatihan POSI"
      creator="Pelatihan POSI"
    >
      <Page
        size="A4"
        orientation="landscape"
        style={{ fontFamily: SANS, backgroundColor: "#fde58a" }}
      >
        <Sheet backgroundColor="#fde58a">
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            src={{ data: bg, format: "jpg" }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: W,
              height: H,
            }}
          />
          {c.showNumber && data.number ? (
            <Text
              style={{
                position: "absolute",
                top: 113,
                left: 0,
                width: W,
                textAlign: "center",
                fontSize: 11,
                color: "#6b6158",
              }}
            >
              {data.number}
            </Text>
          ) : null}
          <Text
            style={{
              position: "absolute",
              top: 249 - nameSize * 1.15,
              left: 60,
              width: W - 120,
              textAlign: "center",
              fontFamily: SCRIPT,
              fontSize: nameSize,
              color: "#111111",
            }}
          >
            {data.name}
          </Text>
          {data.body ? (
            <RichBody
              text={data.body}
              color={TEXT}
              boldColor={DARK}
              fontSize={10.5}
              style={{
                position: "absolute",
                top: 283,
                left: 140,
                width: W - 280,
              }}
            />
          ) : null}
          {data.dateLine ? (
            <Text
              style={{
                position: "absolute",
                // ikut blok tanda tangan: tanpa gambar tanda tangan tetap 404 pt (128 pt di atas nama, stempel di antaranya);
                // dengan gambar: tepat di atas gambar tanda tangan
                top: (signYOf(c, true) / 100) * H - (data.signImage ? signBoxHeight(c.signWidth) + 24 : 128),
                left: (c.signX / 100) * W - 200,
                width: 400,
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                color: DARK,
              }}
            >
              {data.dateLine}
            </Text>
          ) : null}
          <SignerBlock
            c={c}
            data={data}
            sample
            color={DARK}
            mutedColor={TEXT}
          />
        </Sheet>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(
  config: CertificateConfig,
  data: CertificateData,
  background: { data: Buffer; format: "png" | "jpg" } | null,
) {
  registerFonts();
  // tanpa latar unggahan → desain bawaan sesuai contoh sertifikat POSI
  const sample = !background ? sampleBackground(!!data.signImage) : null;
  if (sample)
    return renderToBuffer(
      <SampleCertificate config={config} data={data} bg={sample} />,
    );
  return renderToBuffer(
    <CertificateDoc config={config} data={data} background={background} />,
  );
}

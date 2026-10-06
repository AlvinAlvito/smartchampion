import "server-only";
import { prisma } from "./prisma";
import { fillPlaceholders, readCertificateConfig, PREDIKAT } from "./certificate";
import { getStudentReport, longDate, periodText } from "./class-report";
import { JENJANG_LABEL } from "./constants";
import { readCertificateBackground } from "./storage";
import type { CertificateData } from "./pdf/certificate-pdf";

/**
 * Isi sertifikat satu peserta (atau contoh untuk pratinjau admin bila `preview`).
 * `null` bila kelas tidak ada / sertifikat peserta belum diterbitkan.
 */
export async function certificateContent(productId: number, userId: number, preview = false) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, bidang: true, jenjang: true, startDate: true, certificateBgUrl: true, certificateConfig: true },
  });
  if (!product) return null;
  const [background, tutors, sessions] = await Promise.all([
    readCertificateBackground(product.certificateBgUrl),
    prisma.tutor.findMany({
      where: { isPublished: true, classes: { some: { id: productId } } },
      orderBy: [{ urutan: "asc" }, { id: "asc" }],
      select: { nama: true },
    }),
    prisma.classSession.findMany({ where: { productId }, orderBy: { startAt: "asc" }, select: { startAt: true, endAt: true } }),
  ]);
  // tanggal pelaksanaan (pertemuan pertama s.d. terakhir) untuk {mulai} & {selesai}
  const first = sessions[0]?.startAt ?? product.startDate;
  const last = sessions[sessions.length - 1]?.endAt ?? first;
  const dates = { mulai: first ? longDate(first) : "-", selesai: last ? longDate(last) : "-" };
  const base = readCertificateConfig(product.certificateConfig);
  // penanda tangan "Tutor" tanpa nama → otomatis nama tutor kelas
  const config = { ...base, signers: base.signers.map((sg) => (!sg.name && /tutor/i.test(sg.title) && tutors[0] ? { ...sg, name: tutors[0].nama } : sg)) };

  let values: Record<string, string>;
  let name: string;
  let number: string | null;
  let issuedAt: Date;
  if (preview) {
    issuedAt = new Date();
    name = "Nama Peserta Contoh";
    number = "000/POSI/OSN/CONTOH";
    values = {
      periode: periodText(sessions[0]?.startAt ?? product.startDate, sessions[sessions.length - 1]?.startAt ?? null),
      nilai: "88",
      grade: "A",
      predikat: PREDIKAT.A,
      kehadiran: "100%",
    };
  } else {
    const report = await getStudentReport(productId, userId);
    if (!report?.certificate) return null;
    issuedAt = report.certificate.issuedAt;
    name = report.certificate.name;
    number = report.certificate.number;
    values = {
      periode: report.period,
      nilai: report.summary.average != null ? String(report.summary.average) : "-",
      grade: report.summary.grade ?? "-",
      predikat: report.summary.predikat ?? "-",
      kehadiran: report.summary.attendanceRate != null ? `${report.summary.attendanceRate}%` : "-",
    };
  }
  const all = {
    ...values,
    ...dates,
    nama: name,
    kelas: product.name,
    bidang: product.bidang,
    jenjang: JENJANG_LABEL[product.jenjang] ?? product.jenjang,
    nomor: number ?? "",
    tanggal: longDate(issuedAt),
  };
  const data: CertificateData = {
    name,
    body: fillPlaceholders(config.body, all),
    number,
    dateLine: config.showDate ? `${config.place ? `${config.place}, ` : ""}${longDate(issuedAt)}` : null,
  };
  return { config: { ...config, intro: fillPlaceholders(config.intro, all), subtitle: fillPlaceholders(config.subtitle, all) }, data, background, product };
}

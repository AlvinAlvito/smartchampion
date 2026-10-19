"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Download, Eye, FileText, ImagePlus, NotebookPen, PenLine, Save, Send, Undo2, X } from "lucide-react";
import {
  issueCertificatesAction,
  revokeCertificateAction,
  saveCertificateTemplateAction,
  saveResultAction,
  setReportPublishedAction,
} from "@/app/actions/graduation";
import { CERT_PLACEHOLDERS, signBoxHeight, signYOf, type CertificateConfig } from "@/lib/certificate";
import { ATTENDANCE_LABEL, gradeTone } from "@/lib/worksheet-shared";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, Spinner, useFormAction } from "@/components/form-buttons";
import { Badge, Field } from "@/components/ui";
import { useToast } from "@/components/toast";

/* ======================= Template sertifikat ======================= */

export function CertificateTemplate({ productId, config, bgUrl }: { productId: number; config: CertificateConfig; bgUrl: string | null }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveCertificateTemplateAction);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [nameTop, setNameTop] = useState(config.nameTop);
  // tanda tangan: gambar (unggah), posisi tengah (kiri→kanan), posisi baris nama (atas→bawah), lebar
  const [signPreview, setSignPreview] = useState<string | null>(null);
  const [removeSign, setRemoveSign] = useState(false);
  const [signX, setSignX] = useState(config.signX);
  const [signY, setSignY] = useState(() => Math.round(signYOf(config, !bgUrl) * 2) / 2);
  const [signWidth, setSignWidth] = useState(config.signWidth);
  const [signerName, setSignerName] = useState(config.signers[0]?.name ?? "");
  const [signerTitle, setSignerTitle] = useState(config.signers[0]?.title ?? "");
  const bg = preview ?? (removeBg ? null : bgUrl);
  const signImg = signPreview ?? (removeSign ? null : config.signImageUrl);
  // ukuran pratinjau mengikuti halaman A4 lanskap 842×595 pt
  const boxW = (signWidth / 842) * 100;
  const boxH = (signBoxHeight(signWidth) / 595) * 100;
  return (
    <form {...formProps} encType="multipart/form-data" className="card space-y-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="removeBackground" value={removeBg ? "1" : "0"} />
      <input type="hidden" name="removeSignImage" value={removeSign ? "1" : "0"} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-navy-900">
          <Award className="h-5 w-5 text-brand-600" /> Template sertifikat
        </h2>
        <a href={`/api/sertifikat/${productId}/0?preview=1`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
          <Eye className="h-3.5 w-3.5" /> Pratinjau PDF
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        {/* gambar latar + posisi */}
        <div className="space-y-3">
          <span className="label">Gambar latar (A4 lanskap)</span>
          <div className="relative aspect-[297/210] overflow-hidden rounded-2xl bg-navy-50 ring-1 ring-navy-100 [container-type:inline-size]">
            {bg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bg} alt="Latar sertifikat" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              // desain bawaan; bila ada gambar tanda tangan dipakai versi polos (stempel & tanda tangan lama menyatu di gambar)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signImg ? "/brand/sertifikat-bawaan-polos.jpg" : "/brand/sertifikat-bawaan.jpg"}
                alt="Desain sertifikat bawaan POSI"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {/* penanda posisi nama peserta (hanya untuk gambar latar unggahan) */}
            {bg && (
              <span className="absolute inset-x-6 border-t-2 border-dashed border-brand-500" style={{ top: `${nameTop}%` }}>
                <span className="absolute -top-5 left-0 rounded bg-brand-600 px-1.5 text-[10px] font-bold text-white">Nama</span>
              </span>
            )}
            {/* pratinjau tanda tangan: gambar tepat di atas nama penanda tangan */}
            <div
              className={cn("absolute flex items-end justify-center", !signImg && "rounded border-2 border-dashed border-amber-500 bg-amber-200/30")}
              style={{ left: `${signX - boxW / 2}%`, top: `${signY - boxH}%`, width: `${boxW}%`, height: `${boxH}%` }}
            >
              {signImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signImg} alt="Tanda tangan" className="h-full w-full object-contain" />
              ) : (
                <span className="m-auto text-center text-[length:1.3cqw] font-bold text-amber-700">tanda tangan</span>
              )}
            </div>
            {/* kota & tanggal ikut blok tanda tangan (desain bawaan) */}
            {!bg && config.showDate && (
              <span
                className="absolute w-[40%] -translate-x-1/2 text-center text-[length:1.3cqw] font-bold text-[#3b2f27]"
                style={{ left: `${signX}%`, top: `${signY - (signImg ? ((signBoxHeight(signWidth) + 24) / 595) * 100 : (128 / 595) * 100)}%` }}
              >
                {config.place ? `${config.place}, ` : ""}tanggal terbit
              </span>
            )}
            <div className="absolute flex w-[40%] -translate-x-1/2 flex-col items-center leading-tight" style={{ left: `${signX}%`, top: `${signY}%` }}>
              {signerName && <span className="text-[length:1.35cqw] font-bold text-[#3b2f27] underline">{signerName}</span>}
              {signerTitle && <span className="text-[length:1.15cqw] text-[#5b5048]">{signerTitle}</span>}
            </div>
          </div>
          {!bg && (
            <p className="rounded-2xl bg-sun-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-sun-200">
              Memakai <b>desain bawaan POSI</b> (sesuai contoh sertifikat): judul, &ldquo;Diserahkan kepada:&rdquo;, logo, stempel & maskot sudah ada di desain.
              Yang dipakai dari pengaturan: <b>isi keterangan, kota terbit & tanggal, nomor, dan penanda tangan</b> (nama, jabatan, gambar tanda tangan &
              posisinya). Bila gambar tanda tangan diunggah, stempel & tanda tangan lama di desain disembunyikan — unggah gambar tanda tangan (boleh
              sekaligus stempel) sebagai penggantinya. Judul, posisi nama, warna & font hanya berlaku bila Anda mengunggah gambar latar sendiri.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-secondary btn-sm cursor-pointer">
              <ImagePlus className="h-3.5 w-3.5" /> {bg ? "Ganti gambar" : "Unggah gambar"}
              <input
                name="background"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPreview(f ? URL.createObjectURL(f) : null);
                  if (f) setRemoveBg(false);
                }}
              />
            </label>
            {bg && (
              <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => (setPreview(null), setRemoveBg(true))}>
                <X className="h-3.5 w-3.5" /> Pakai desain bawaan POSI
              </button>
            )}
            <span className="text-xs text-navy-400">JPG/PNG maks 5 MB, disarankan 3508×2480 px.</span>
          </div>
          {fe?.background && <p className="text-xs font-medium text-rose-600">{fe.background[0]}</p>}
          <Field label={`Posisi nama: ${nameTop}% dari atas`} htmlFor="nameTop">
            <input
              id="nameTop"
              name="nameTop"
              type="range"
              min={10}
              max={85}
              value={nameTop}
              onChange={(e) => setNameTop(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
          </Field>
          <div className="space-y-3 rounded-2xl bg-amber-50/60 p-3 ring-1 ring-amber-100">
            <p className="flex items-center gap-1.5 text-sm font-bold text-navy-800">
              <PenLine className="h-4 w-4 text-amber-600" /> Posisi tanda tangan
            </p>
            <Field label={`Kiri ↔ kanan: ${signX}% (50% = tengah)`} htmlFor="signX">
              <input id="signX" name="signX" type="range" min={15} max={85} value={signX} onChange={(e) => setSignX(Number(e.target.value))} className="w-full accent-amber-500" />
            </Field>
            <Field label={`Atas ↕ bawah: ${signY}% dari atas (baris nama penanda tangan)`} htmlFor="signY">
              <input
                id="signY"
                name="signY"
                type="range"
                min={40}
                max={96}
                step={0.5}
                value={signY}
                onChange={(e) => setSignY(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </Field>
            <Field label={`Ukuran gambar tanda tangan: ${signWidth} pt`} htmlFor="signWidth">
              <input
                id="signWidth"
                name="signWidth"
                type="range"
                min={60}
                max={260}
                step={5}
                value={signWidth}
                onChange={(e) => setSignWidth(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </Field>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setSignX(50);
                setSignY(Math.round(signYOf({ signY: null, signTop: config.signTop }, !bg) * 2) / 2);
                setSignWidth(150);
              }}
            >
              <Undo2 className="h-3.5 w-3.5" /> Kembalikan ke tengah bawah
            </button>
          </div>
        </div>

        {/* teks */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Judul" htmlFor="title" hint="Kosongkan bila judul sudah ada di gambar.">
            <input id="title" name="title" defaultValue={config.title} className="input" />
          </Field>
          <Field label="Sub-judul" htmlFor="subtitle">
            <input id="subtitle" name="subtitle" defaultValue={config.subtitle} className="input" />
          </Field>
          <Field label="Kalimat pembuka" htmlFor="intro">
            <input id="intro" name="intro" defaultValue={config.intro} className="input" />
          </Field>
          <Field label="Font nama" htmlFor="nameFont">
            <select id="nameFont" name="nameFont" defaultValue={config.nameFont} className="input">
              <option value="script">Tulisan indah (script)</option>
              <option value="serif">Serif elegan</option>
              <option value="sans">Tegas (sans)</option>
            </select>
          </Field>
          <Field label="Isi keterangan" htmlFor="body" className="sm:col-span-2" hint={`Penanda: ${CERT_PLACEHOLDERS.join(" ")}`}>
            <textarea id="body" name="body" rows={3} defaultValue={config.body} className="input" />
          </Field>
          <Field label="Warna nama" htmlFor="nameColor">
            <input id="nameColor" name="nameColor" type="color" defaultValue={config.nameColor} className="h-10 w-full cursor-pointer rounded-xl" />
          </Field>
          <Field label="Warna teks" htmlFor="textColor">
            <input id="textColor" name="textColor" type="color" defaultValue={config.textColor} className="h-10 w-full cursor-pointer rounded-xl" />
          </Field>
          <Field
            label="Nomor sertifikat"
            htmlFor="number"
            className="sm:col-span-2"
            hint={
              config.number == null && config.showNumber
                ? "Saat ini masih nomor otomatis per peserta (format lama). Isi nomor kelas di sini untuk menggantinya. Kosongkan = tanpa nomor."
                : "Sama untuk semua peserta kelas ini. Kosongkan bila tidak dicetak. Nomor khusus per peserta: tombol catatan (✎) di tabel peserta."
            }
          >
            <input id="number" name="number" defaultValue={config.number ?? ""} maxLength={80} className="input font-mono" placeholder="mis. 723/POSI/OSN/IX/2026" />
          </Field>
          <Field label="Kota terbit" htmlFor="place">
            <input id="place" name="place" defaultValue={config.place} className="input" placeholder="mis. Medan" />
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1 text-sm text-navy-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showDate" value="1" defaultChecked={config.showDate} className="h-4 w-4 accent-brand-600" /> Tampilkan kota & tanggal
            </label>

          </div>
          <div className="grid gap-2 rounded-2xl p-3 ring-1 ring-navy-100 sm:col-span-2 sm:grid-cols-2">
            <p className="text-sm font-bold text-navy-800 sm:col-span-2">Penanda tangan</p>
            <Field label="Nama" htmlFor="signerName0" hint="Tampil bergaris bawah di bawah tanda tangan">
              <input id="signerName0" name="signerName0" value={signerName} onChange={(e) => setSignerName(e.target.value)} maxLength={80} className="input" />
            </Field>
            <Field label="Jabatan" htmlFor="signerTitle0" hint="Opsional, mis. Direktur POSI">
              <input
                id="signerTitle0"
                name="signerTitle0"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                maxLength={80}
                className="input"
                placeholder="opsional"
              />
            </Field>
            <div className="sm:col-span-2">
              <span className="label">Gambar tanda tangan</span>
              <div className="flex flex-wrap items-center gap-2">
                {signImg && (
                  <span className="grid h-14 w-28 place-items-center rounded-xl bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px] ring-1 ring-navy-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signImg} alt="Tanda tangan" className="max-h-12 max-w-26 object-contain" />
                  </span>
                )}
                <label className="btn-secondary btn-sm cursor-pointer">
                  <PenLine className="h-3.5 w-3.5" /> {signImg ? "Ganti tanda tangan" : "Unggah tanda tangan"}
                  <input
                    name="signImage"
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setSignPreview(f ? URL.createObjectURL(f) : null);
                      if (f) setRemoveSign(false);
                    }}
                  />
                </label>
                {signImg && (
                  <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => (setSignPreview(null), setRemoveSign(true))}>
                    <X className="h-3.5 w-3.5" /> Hapus
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-navy-400">PNG berlatar transparan paling bagus (JPG berlatar putih akan menutupi desain). Maks 5 MB.</p>
              {fe?.signImage && <p className="mt-1 text-xs font-medium text-rose-600">{fe.signImage[0]}</p>}
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>
          <Save className="h-4 w-4" /> Simpan template
        </SubmitButton>
      </div>
    </form>
  );
}

/* ======================= Rapor terbit ======================= */

export function ReportPublishToggle({ productId, published }: { productId: number; published: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      className={published ? "btn-outline-light" : "btn-light"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (toast.fromResult(await setReportPublishedAction(productId, !published))) router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : published ? <Undo2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}{" "}
      {published ? "Tarik rapor dari peserta" : "Terbitkan rapor ke peserta"}
    </button>
  );
}

/* ======================= Peserta ======================= */

export type GradRow = {
  userId: number;
  name: string;
  school: string;
  average: number | null;
  grade: string | null;
  worksheetsDone: number;
  present: number;
  attendanceRate: number | null;
  note: string | null;
  /** nomor sertifikat khusus peserta ini (null = ikut nomor kelas) */
  customNumber: string | null;
  /** number = nomor yang dicetak ("" = tanpa nomor) */
  certificate: { number: string; name: string; issuedAt: Date } | null;
};

function ResultDialog({ productId, row, classNumber, onClose }: { productId: number; row: GradRow; classNumber: string; onClose: () => void }) {
  const { formProps, pending } = useFormAction(saveResultAction, { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      icon={NotebookPen}
      title={`Catatan untuk ${row.name}`}
      description="Catatan tutor tampil di rapor. Nama & nomor di sertifikat bisa dikoreksi khusus peserta ini."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="result-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="result-form" className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="userId" value={row.userId} />
        <Field label="Catatan tutor (rapor)" htmlFor="note">
          <textarea
            id="note"
            name="note"
            rows={5}
            defaultValue={row.note ?? ""}
            className="input"
            placeholder="mis. Pemahaman konsep sangat baik; perbanyak latihan soal cerita."
          />
        </Field>
        <Field label="Nama di sertifikat" htmlFor="certificateName" hint="Kosongkan untuk memakai nama pendaftaran.">
          <input id="certificateName" name="certificateName" defaultValue={row.certificate?.name ?? ""} placeholder={row.name} className="input" />
        </Field>
        <Field
          label="Nomor sertifikat khusus peserta ini"
          htmlFor="certificateNoCustom"
          hint={classNumber ? `Kosongkan untuk memakai nomor kelas: ${classNumber}` : "Kosongkan untuk memakai nomor kelas dari template sertifikat."}
        >
          <input
            id="certificateNoCustom"
            name="certificateNoCustom"
            defaultValue={row.customNumber ?? ""}
            maxLength={80}
            placeholder={classNumber || "mis. 724/POSI/OSN/IX/2026"}
            className="input font-mono"
          />
        </Field>
      </form>
    </Modal>
  );
}

export function GraduationTable({ productId, rows, startedCount, classNumber }: { productId: number; rows: GradRow[]; startedCount: number; classNumber: string }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<GradRow | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const without = rows.filter((r) => !r.certificate);
  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const issue = (ids: number[]) =>
    start(async () => {
      if (toast.fromResult(await issueCertificatesAction(productId, ids))) {
        setPicked(new Set());
        router.refresh();
      }
    });

  return (
    <section className="card p-0!">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-50 p-4">
        <p className="text-sm text-navy-500">
          <b className="text-navy-900">{rows.length - without.length}</b>/{rows.length} peserta sudah punya sertifikat
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" disabled={pending || !picked.size} onClick={() => issue([...picked])}>
            <Award className="h-3.5 w-3.5" /> Terbitkan untuk terpilih ({picked.size})
          </button>
          <button className="btn-primary btn-sm" disabled={pending || !without.length} onClick={() => issue(without.map((r) => r.userId))}>
            {pending ? <Spinner className="h-3.5 w-3.5" /> : <Award className="h-3.5 w-3.5" />} Terbitkan untuk semua ({without.length})
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[900px]">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  aria-label="Pilih semua yang belum punya sertifikat"
                  className="h-4 w-4 accent-brand-600"
                  checked={!!without.length && without.every((r) => picked.has(r.userId))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(without.map((r) => r.userId)) : new Set())}
                />
              </th>
              <th>Peserta</th>
              <th className="text-right">Nilai akhir</th>
              <th>Grade</th>
              <th className="text-right">Kehadiran</th>
              <th>Sertifikat</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td>
                  <input
                    type="checkbox"
                    disabled={!!r.certificate}
                    checked={picked.has(r.userId)}
                    onChange={() => toggle(r.userId)}
                    className="h-4 w-4 accent-brand-600"
                    aria-label={`Pilih ${r.name}`}
                  />
                </td>
                <td>
                  <p className="font-semibold text-navy-900">{r.name}</p>
                  <p className="text-xs text-navy-400">{r.school}</p>
                  {r.note && <p className="mt-0.5 max-w-xs truncate text-xs italic text-navy-500">“{r.note}”</p>}
                </td>
                <td className="text-right text-lg font-extrabold text-navy-900">{r.average ?? "-"}</td>
                <td>{r.grade ? <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge> : <span className="text-xs text-navy-400">-</span>}</td>
                <td className="text-right text-sm text-navy-600">
                  {r.present}/{startedCount} {ATTENDANCE_LABEL.HADIR.toLowerCase()}
                  {r.attendanceRate != null && <span className="block text-xs text-navy-400">{r.attendanceRate}%</span>}
                </td>
                <td className="text-xs">
                  {r.certificate ? (
                    <>
                      <p className="font-mono font-semibold text-emerald-700">
                        {r.certificate.number || <span className="font-sans font-normal italic text-navy-400">tanpa nomor</span>}
                        {r.customNumber && (
                          <span className="ml-1 rounded bg-amber-100 px-1 font-sans text-[10px] font-bold text-amber-700" title="Nomor khusus peserta ini">
                            khusus
                          </span>
                        )}
                      </p>
                      <p className="text-navy-400">terbit {formatDate(r.certificate.issuedAt)}</p>
                    </>
                  ) : (
                    <span className="text-navy-400">Belum terbit</span>
                  )}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <a
                      href={`/api/rapor/${productId}/${r.userId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-icon h-8 w-8"
                      title="Rapor PDF"
                      aria-label={`Rapor ${r.name}`}
                    >
                      <FileText className="h-4 w-4" />
                    </a>
                    <button className="btn-icon h-8 w-8" onClick={() => setEditing(r)} title="Catatan tutor & nama sertifikat" aria-label={`Catatan ${r.name}`}>
                      <NotebookPen className="h-4 w-4" />
                    </button>
                    {r.certificate && (
                      <>
                        <a
                          href={`/api/sertifikat/${productId}/${r.userId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-icon h-8 w-8 text-emerald-600"
                          title="Sertifikat PDF"
                          aria-label={`Sertifikat ${r.name}`}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <ConfirmButton
                          className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50"
                          title="Cabut sertifikat?"
                          message={
                            <>
                              Sertifikat <b>{r.certificate.number || "(tanpa nomor)"}</b> milik {r.name} akan dicabut dan tidak bisa diunduh peserta.
                            </>
                          }
                          confirmText="Ya, cabut"
                          action={() => revokeCertificateAction(productId, r.userId)}
                          ariaLabel={`Cabut sertifikat ${r.name}`}
                        >
                          <Undo2 className="h-4 w-4" />
                        </ConfirmButton>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className={cn("py-10 text-center text-navy-400")}>
                  Belum ada peserta lunas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <ResultDialog productId={productId} row={editing} classNumber={classNumber} onClose={() => setEditing(null)} />}
    </section>
  );
}

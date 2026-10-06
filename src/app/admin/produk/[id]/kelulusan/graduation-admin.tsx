"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, Download, Eye, FileText, ImagePlus, NotebookPen, Save, Send, Undo2, X } from "lucide-react";
import {
  issueCertificatesAction,
  revokeCertificateAction,
  saveCertificateTemplateAction,
  saveResultAction,
  setReportPublishedAction,
} from "@/app/actions/graduation";
import { CERT_PLACEHOLDERS, type CertificateConfig } from "@/lib/certificate";
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
  const [signTop, setSignTop] = useState(config.signTop);
  const bg = preview ?? (removeBg ? null : bgUrl);
  return (
    <form {...formProps} encType="multipart/form-data" className="card space-y-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="removeBackground" value={removeBg ? "1" : "0"} />
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
          <div className="relative aspect-[297/210] overflow-hidden rounded-2xl bg-navy-50 ring-1 ring-navy-100">
            {bg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bg} alt="Latar sertifikat" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/sertifikat-bawaan.jpg" alt="Desain sertifikat bawaan POSI" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {/* penanda posisi nama & tanda tangan (hanya untuk gambar latar unggahan) */}
            {bg && (
              <>
                <span className="absolute inset-x-6 border-t-2 border-dashed border-brand-500" style={{ top: `${nameTop}%` }}>
                  <span className="absolute -top-5 left-0 rounded bg-brand-600 px-1.5 text-[10px] font-bold text-white">Nama</span>
                </span>
                <span className="absolute inset-x-6 border-t-2 border-dashed border-amber-500" style={{ top: `${signTop}%` }}>
                  <span className="absolute -top-5 right-0 rounded bg-amber-500 px-1.5 text-[10px] font-bold text-white">Tanda tangan</span>
                </span>
              </>
            )}
          </div>
          {!bg && (
            <p className="rounded-2xl bg-sun-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-sun-200">
              Memakai <b>desain bawaan POSI</b> (sesuai contoh sertifikat): judul, &ldquo;Diserahkan kepada:&rdquo;, logo, stempel & maskot sudah ada di desain.
              Yang dipakai dari pengaturan: <b>isi keterangan, kota terbit & tanggal, nomor, dan nama penanda tangan 1</b>. Judul, posisi, warna & font hanya
              berlaku bila Anda mengunggah gambar latar sendiri.
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
          <Field label={`Posisi tanda tangan: ${signTop}% dari atas`} htmlFor="signTop">
            <input
              id="signTop"
              name="signTop"
              type="range"
              min={40}
              max={92}
              value={signTop}
              onChange={(e) => setSignTop(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
          </Field>
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
          <Field label="Kota terbit" htmlFor="place">
            <input id="place" name="place" defaultValue={config.place} className="input" placeholder="mis. Medan" />
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1 text-sm text-navy-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showDate" value="1" defaultChecked={config.showDate} className="h-4 w-4 accent-brand-600" /> Tampilkan kota & tanggal
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showNumber" value="1" defaultChecked={config.showNumber} className="h-4 w-4 accent-brand-600" /> Tampilkan nomor
              sertifikat
            </label>
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:col-span-2">
              <Field label={`Penanda tangan ${i + 1} — jabatan`} htmlFor={`signerTitle${i}`}>
                <input
                  id={`signerTitle${i}`}
                  name={`signerTitle${i}`}
                  defaultValue={config.signers[i]?.title ?? ""}
                  className="input"
                  placeholder={i === 0 ? "Tutor" : "Direktur (opsional)"}
                />
              </Field>
              <Field label="Nama" htmlFor={`signerName${i}`}>
                <input id={`signerName${i}`} name={`signerName${i}`} defaultValue={config.signers[i]?.name ?? ""} className="input" />
              </Field>
            </div>
          ))}
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
  certificate: { number: string; name: string; issuedAt: Date } | null;
};

function ResultDialog({ productId, row, onClose }: { productId: number; row: GradRow; onClose: () => void }) {
  const { formProps, pending } = useFormAction(saveResultAction, { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      icon={NotebookPen}
      title={`Catatan untuk ${row.name}`}
      description="Catatan tutor tampil di rapor. Nama di sertifikat bisa dikoreksi (mis. salah ketik)."
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
      </form>
    </Modal>
  );
}

export function GraduationTable({ productId, rows, startedCount }: { productId: number; rows: GradRow[]; startedCount: number }) {
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
                      <p className="font-mono font-semibold text-emerald-700">{r.certificate.number}</p>
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
                              Sertifikat <b>{r.certificate.number}</b> milik {r.name} akan dicabut dan tidak bisa diunduh peserta.
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
      {editing && <ResultDialog productId={productId} row={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

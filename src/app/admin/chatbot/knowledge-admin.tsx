"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, CheckCheck, Eye, EyeOff, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { deleteKnowledgeAction, resolveUnansweredAction, saveKnowledgeAction, toggleKnowledgeAction } from "@/app/actions/chatbot";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner, SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";

export type KnowledgeRow = { id: number; judul: string; kategori: string; isi: string; isActive: boolean; urutan: number; updatedAt: Date };
type Prefill = { judul?: string; isi?: string };

const DEFAULT_KATEGORI = ["Umum", "Produk", "Kelas", "Pendaftaran", "Pembayaran", "Kontak", "Promo", "FAQ"];
const FORM_ID = "knowledge-form";

function KnowledgeDialog({ row, prefill, kategoriList, onClose }: { row: KnowledgeRow | null; prefill?: Prefill; kategoriList: string[]; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveKnowledgeAction, { onSuccess: onClose });
  const [isi, setIsi] = useState(row?.isi ?? prefill?.isi ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={BookOpenText}
      title={row ? "Edit pengetahuan" : "Tambah pengetahuan"}
      description="Tulis fakta yang jelas & lengkap. Chatbot hanya menjawab berdasarkan isi ini dan data otomatis sistem."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {row ? "Simpan perubahan" : "Tambah"}
          </SubmitButton>
        </>
      }
    >
      <form key={row?.id ?? "new"} {...formProps} id={FORM_ID} className="grid gap-4 sm:grid-cols-3">
        {row && <input type="hidden" name="id" value={row.id} />}
        <Field label="Judul / topik *" htmlFor="judul" errors={fe?.judul} className="sm:col-span-2">
          <input id="judul" name="judul" defaultValue={row?.judul ?? prefill?.judul ?? ""} className="input" placeholder="mis. Kebijakan pembatalan & refund" />
        </Field>
        <Field label="Kategori" htmlFor="kategori">
          <input id="kategori" name="kategori" list="kategori-list" defaultValue={row?.kategori ?? "Umum"} className="input" />
          <datalist id="kategori-list">
            {kategoriList.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Isi informasi *"
          htmlFor="isi"
          errors={fe?.isi}
          className="sm:col-span-3"
          hint={`${isi.length.toLocaleString("id-ID")}/8.000 karakter · Boleh pakai poin "- ". Tulis angka, tanggal, dan syarat secara lengkap.`}
        >
          <textarea
            id="isi"
            name="isi"
            rows={9}
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            className="input"
            placeholder={"Contoh:\nPembatalan pendaftaran bisa dilakukan sebelum kelas dimulai.\n- Dana dikembalikan 100% bila kelas batal karena kuota tidak terpenuhi.\n- Proses refund 3-7 hari kerja melalui admin."}
          />
        </Field>
        <Field label="Urutan" htmlFor="urutan" hint="Kecil = lebih prioritas.">
          <input id="urutan" name="urutan" type="number" min={0} defaultValue={row?.urutan ?? 0} className="input" />
        </Field>
        <label className="flex cursor-pointer items-center gap-3 self-end rounded-2xl bg-navy-50/60 px-4 py-3 text-sm font-semibold text-navy-700 sm:col-span-2">
          <input type="checkbox" name="isActive" value="1" defaultChecked={row?.isActive ?? true} className="h-4 w-4 accent-brand-600" />
          Aktif (dipakai chatbot untuk menjawab)
        </label>
      </form>
    </Modal>
  );
}

function ToggleActive({ row }: { row: KnowledgeRow }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      className="btn-icon"
      disabled={pending}
      onClick={() => start(async () => void (toast.fromResult(await toggleKnowledgeAction(row.id)) && router.refresh()))}
      title={row.isActive ? "Nonaktifkan" : "Aktifkan"}
      aria-label={row.isActive ? `Nonaktifkan ${row.judul}` : `Aktifkan ${row.judul}`}
    >
      {pending ? <Spinner className="h-4 w-4" /> : row.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

export function KnowledgeManager({ rows }: { rows: KnowledgeRow[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; row: KnowledgeRow | null }>({ open: false, row: null });
  const [q, setQ] = useState("");
  const [kat, setKat] = useState("");
  const kategoriList = useMemo(() => [...new Set([...DEFAULT_KATEGORI, ...rows.map((r) => r.kategori)])], [rows]);
  const used = useMemo(() => [...new Set(rows.map((r) => r.kategori))], [rows]);
  const shown = rows.filter((r) => (!kat || r.kategori === kat) && (!q || `${r.judul} ${r.isi}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul atau isi…" className="input pl-10" />
        </div>
        <select value={kat} onChange={(e) => setKat(e.target.value)} className="input w-auto" aria-label="Kategori">
          <option value="">Semua kategori</option>
          {used.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <button className="btn-primary ml-auto" onClick={() => setDialog({ open: true, row: null })}>
          <Plus className="h-4 w-4" /> Tambah pengetahuan
        </button>
      </div>

      {shown.length ? (
        <div className="stagger grid gap-3 lg:grid-cols-2">
          {shown.map((r) => (
            <div key={r.id} className={cn("card flex flex-col gap-2 p-4!", !r.isActive && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{r.kategori}</Badge>
                    {!r.isActive && <Badge tone="gray">Nonaktif</Badge>}
                  </div>
                  <button onClick={() => setDialog({ open: true, row: r })} className="text-left font-bold text-navy-900 transition hover:text-brand-700">
                    {r.judul}
                  </button>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <ToggleActive row={r} />
                  <button className="btn-icon" onClick={() => setDialog({ open: true, row: r })} aria-label={`Edit ${r.judul}`} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <ConfirmButton ariaLabel={`Hapus ${r.judul}`} title="Hapus pengetahuan?" message={<>Chatbot tidak akan tahu lagi tentang <b>{r.judul}</b>.</>} action={() => deleteKnowledgeAction(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
              <p className="line-clamp-3 whitespace-pre-line text-sm text-navy-500">{r.isi}</p>
              <p className="mt-auto text-[11px] text-navy-300">
                #{r.urutan} · diubah {formatDate(r.updatedAt)} · {r.isi.length.toLocaleString("id-ID")} karakter
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={BookOpenText} title={rows.length ? "Tidak ada yang cocok" : "Belum ada pengetahuan"} desc="Tambahkan informasi agar chatbot bisa menjawab pertanyaan calon peserta." />
      )}

      {dialog.open && <KnowledgeDialog row={dialog.row} kategoriList={kategoriList} onClose={() => setDialog({ open: false, row: null })} />}
    </>
  );
}

/** Tombol "Jadikan pengetahuan" dari pertanyaan yang belum terjawab. */
export function AddFromQuestionButton({ question }: { question: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Jadikan pengetahuan
      </button>
      {open && <KnowledgeDialog row={null} prefill={{ judul: question.slice(0, 160) }} kategoriList={DEFAULT_KATEGORI} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ResolveButton({ messageId }: { messageId: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => void (toast.fromResult(await resolveUnansweredAction(messageId)) && router.refresh()))}>
      {pending ? <Spinner className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />} Tandai selesai
    </button>
  );
}

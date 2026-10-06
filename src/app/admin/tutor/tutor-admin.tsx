"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award, BookOpen, Briefcase, Camera, Eye, EyeOff, GraduationCap, Pencil, Plus, Presentation, Save, Search, Trash2, X } from "lucide-react";
import { deleteTutorAction, deleteTutorsAction, deleteTutorsByFilterAction, saveTutorAction, toggleTutorPublishAction } from "@/app/actions/tutors";
import { cn } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner, SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";
import { TutorAvatar, listItems } from "@/components/tutor-avatar";
import { SelectableCard, SelectableGrid } from "@/components/selectable-grid";

export type TutorRow = {
  id: number;
  nama: string;
  foto: string | null;
  bidang: string | null;
  pengalaman: string | null;
  prestasi: string | null;
  riwayatPendidikan: string | null;
  isPublished: boolean;
  urutan: number;
  classIds: number[];
  classNames: string[];
};

export type ClassOption = { id: number; name: string; jenjang: string; status: string };

const JENJANG_LABEL: Record<string, string> = { SD: "SD", SMP: "SMP", SMA: "SMA", UMUM: "Umum" };
const STATUS_NOTE: Record<string, string> = { DRAFT: "draft", CLOSED: "ditutup" };

/** Daftar centang kelas COC yang dipegang tutor (dikelompokkan per jenjang, bisa dicari). */
function ClassPicker({ classes, initial }: { classes: ClassOption[]; initial: number[] }) {
  const [picked, setPicked] = useState<Set<number>>(new Set(initial));
  const [q, setQ] = useState("");
  const shown = classes.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(shown.map((c) => c.jenjang))];
  const toggle = (ids: number[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  return (
    <div className="rounded-3xl border border-navy-100 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
          <BookOpen className="h-4 w-4 text-brand-600" /> Kelas yang dipegang
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">{picked.size} dipilih</span>
        </p>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kelas…" className="input py-1.5! pl-8 text-sm" aria-label="Cari kelas" />
        </div>
      </div>
      {/* nilai yang dikirim ke server */}
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="classIds" value={id} />
      ))}
      {classes.length ? (
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {groups.map((g) => {
            const items = shown.filter((c) => c.jenjang === g);
            const allOn = items.every((c) => picked.has(c.id));
            return (
              <div key={g}>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-navy-400">{JENJANG_LABEL[g] ?? g}</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-600 hover:underline"
                    onClick={() =>
                      toggle(
                        items.map((c) => c.id),
                        !allOn,
                      )
                    }
                  >
                    {allOn ? "Hapus semua" : "Pilih semua"}
                  </button>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((c) => {
                    const on = picked.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-2xl px-3 py-2 text-sm ring-1 transition",
                          on ? "bg-brand-50 text-brand-900 ring-brand-200" : "text-navy-600 ring-navy-100 hover:bg-navy-50/60",
                        )}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggle([c.id], !on)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
                        <span className="min-w-0">
                          <span className="font-semibold">{c.name}</span>
                          {STATUS_NOTE[c.status] && <span className="ml-1 text-xs text-navy-400">({STATUS_NOTE[c.status]})</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!shown.length && <p className="py-4 text-center text-sm text-navy-400">Tidak ada kelas yang cocok.</p>}
        </div>
      ) : (
        <p className="text-sm text-navy-400">Belum ada kelas. Buat kelas di menu Produk &amp; Materi terlebih dahulu.</p>
      )}
    </div>
  );
}

const FORM_ID = "tutor-form";

function PhotoPicker({ name, current, error }: { name: string; current: string | null; error?: string[] }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = preview ?? (removed ? null : current);

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => inputRef.current?.click()} className="group relative shrink-0" aria-label="Pilih foto profil">
        <TutorAvatar name={name || "Tutor"} src={shown} className="h-24 w-24 rounded-3xl text-2xl shadow-lg ring-4 ring-white" />
        <span className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-lg transition group-hover:scale-110">
          <Camera className="h-4 w-4" />
        </span>
      </button>
      <div className="min-w-0 text-sm">
        <p className="font-bold text-navy-800">Foto profil</p>
        <p className="text-xs text-navy-400">JPG, PNG, atau WebP · maks 2 MB · disarankan persegi (1:1)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
            <Camera className="h-3.5 w-3.5" /> {shown ? "Ganti foto" : "Unggah foto"}
          </button>
          {shown && (
            <button
              type="button"
              className="btn-ghost btn-sm text-rose-600"
              onClick={() => {
                setPreview(null);
                setRemoved(true);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              <X className="h-3.5 w-3.5" /> Hapus
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs font-medium text-rose-600">{error[0]}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        name="foto"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setPreview(URL.createObjectURL(f));
          setRemoved(false);
        }}
      />
      {removed && !preview && <input type="hidden" name="hapusFoto" value="1" />}
    </div>
  );
}

function TutorDialog({ tutor, classes, onClose }: { tutor: TutorRow | null; classes: ClassOption[]; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveTutorAction, { onSuccess: onClose });
  const v = tutor;
  const [nama, setNama] = useState(v?.nama ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Presentation}
      title={v ? `Edit tutor · ${v.nama}` : "Tambah tutor"}
      description="Tulis pengalaman, prestasi, dan riwayat pendidikan satu poin per baris."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {v ? "Simpan perubahan" : "Tambah tutor"}
          </SubmitButton>
        </>
      }
    >
      <form key={v?.id ?? "new"} {...formProps} id={FORM_ID} className="grid gap-4 sm:grid-cols-2">
        {v && <input type="hidden" name="id" value={v.id} />}
        <div className="sm:col-span-2">
          <PhotoPicker name={nama} current={v?.foto ?? null} error={fe?.foto} />
        </div>
        <Field label="Nama lengkap & gelar *" htmlFor="nama" errors={fe?.nama}>
          <input id="nama" name="nama" value={nama} onChange={(e) => setNama(e.target.value)} className="input" placeholder="mis. Dr. Rina Kusuma, M.Si." />
        </Field>
        <Field label="Bidang keahlian" htmlFor="bidang">
          <input id="bidang" name="bidang" defaultValue={v?.bidang ?? ""} className="input" placeholder="mis. Matematika & Fisika" />
        </Field>
        <div className="sm:col-span-2">
          <ClassPicker classes={classes} initial={v?.classIds ?? []} />
        </div>
        <Field label="Pengalaman" htmlFor="pengalaman" className="sm:col-span-2" hint="Satu poin per baris.">
          <textarea
            id="pengalaman"
            name="pengalaman"
            rows={4}
            defaultValue={v?.pengalaman ?? ""}
            className="input"
            placeholder={"Tutor olimpiade matematika sejak 2015\nPembina OSN tingkat provinsi"}
          />
        </Field>
        <Field label="Prestasi" htmlFor="prestasi" className="sm:col-span-2" hint="Satu poin per baris.">
          <textarea
            id="prestasi"
            name="prestasi"
            rows={4}
            defaultValue={v?.prestasi ?? ""}
            className="input"
            placeholder={"Medali Emas OSN Matematika 2012\nFinalis IMO 2013"}
          />
        </Field>
        <Field label="Riwayat pendidikan" htmlFor="riwayatPendidikan" className="sm:col-span-2" hint="Satu poin per baris.">
          <textarea
            id="riwayatPendidikan"
            name="riwayatPendidikan"
            rows={3}
            defaultValue={v?.riwayatPendidikan ?? ""}
            className="input"
            placeholder={"S2 Matematika, Institut Teknologi Bandung\nS1 Matematika, Universitas Indonesia"}
          />
        </Field>
        <Field label="Urutan tampil" htmlFor="urutan" hint="Angka kecil tampil lebih dulu.">
          <input id="urutan" name="urutan" type="number" min={0} defaultValue={v?.urutan ?? 0} className="input" />
        </Field>
        <label className="flex cursor-pointer items-center gap-3 self-end rounded-2xl bg-navy-50/60 px-4 py-3 text-sm font-semibold text-navy-700">
          <input type="checkbox" name="isPublished" value="1" defaultChecked={v?.isPublished ?? true} className="h-4 w-4 accent-brand-600" />
          Tampilkan di halaman publik
        </label>
      </form>
    </Modal>
  );
}

function PublishToggle({ tutor }: { tutor: TutorRow }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      onClick={() =>
        start(async () => {
          if (toast.fromResult(await toggleTutorPublishAction(tutor.id))) router.refresh();
        })
      }
      disabled={pending}
      className="btn-icon"
      title={tutor.isPublished ? "Sembunyikan dari publik" : "Tampilkan ke publik"}
      aria-label={tutor.isPublished ? `Sembunyikan ${tutor.nama}` : `Tampilkan ${tutor.nama}`}
    >
      {pending ? <Spinner className="h-4 w-4" /> : tutor.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function Count({ icon: Icon, n, label }: { icon: typeof Award; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1" title={label}>
      <Icon className="h-3.5 w-3.5 text-brand-500" /> {n}
    </span>
  );
}

export function TutorAdmin({
  tutors,
  classes,
  total,
  query,
  filtered,
}: {
  tutors: TutorRow[];
  classes: ClassOption[];
  total: number;
  query: string;
  filtered: boolean;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; tutor: TutorRow | null }>({ open: false, tutor: null });
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setDialog({ open: true, tutor: null })} className="btn-primary">
          <Plus className="h-4 w-4" /> Tambah tutor
        </button>
      </div>

      {tutors.length ? (
        <SelectableGrid
          ids={tutors.map((t) => t.id)}
          total={total}
          noun="tutor"
          pageName="Tutor"
          note="Foto profil ikut dihapus. Kelas yang dipegang tidak terhapus, hanya tidak lagi menampilkan tutor ini."
          gridClassName="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          deleteSelected={deleteTutorsAction}
          deleteByFilter={() => deleteTutorsByFilterAction(query, total)}
        >
          {tutors.map((t) => (
            <SelectableCard key={t.id} id={t.id} name={t.nama}>
              <div className={cn("card card-hover flex h-full flex-col gap-4", !t.isPublished && "opacity-70")}>
                <div className="flex items-start gap-4">
                  <TutorAvatar name={t.nama} src={t.foto} className="h-16 w-16 shrink-0 rounded-2xl text-lg shadow-md" />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setDialog({ open: true, tutor: t })}
                      className="text-left font-bold leading-snug text-navy-900 transition hover:text-brand-700"
                    >
                      {t.nama}
                    </button>
                    <p className="truncate text-xs text-navy-400">{t.bidang ?? "Bidang belum diisi"}</p>
                    <Badge tone={t.isPublished ? "green" : "gray"} className="mt-1.5">
                      {t.isPublished ? "Tampil" : "Disembunyikan"}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {t.classNames.length ? (
                    <>
                      {t.classNames.slice(0, 3).map((n) => (
                        <span key={n} className="max-w-full truncate rounded-xl bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
                          {n}
                        </span>
                      ))}
                      {t.classNames.length > 3 && (
                        <span className="rounded-xl bg-navy-50 px-2 py-1 text-[11px] font-semibold text-navy-500" title={t.classNames.slice(3).join(", ")}>
                          +{t.classNames.length - 3} kelas
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-amber-600">Belum memegang kelas</span>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-navy-50 pt-3">
                  <div className="flex gap-3 text-xs font-semibold text-navy-500">
                    <Count icon={Briefcase} n={listItems(t.pengalaman).length} label="Pengalaman" />
                    <Count icon={Award} n={listItems(t.prestasi).length} label="Prestasi" />
                    <Count icon={GraduationCap} n={listItems(t.riwayatPendidikan).length} label="Riwayat pendidikan" />
                    <span className="text-navy-300">#{t.urutan}</span>
                  </div>
                  <div className="flex gap-1">
                    <PublishToggle tutor={t} />
                    <button onClick={() => setDialog({ open: true, tutor: t })} className="btn-icon" aria-label={`Edit ${t.nama}`} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <ConfirmButton
                      ariaLabel={`Hapus ${t.nama}`}
                      title="Hapus tutor?"
                      message={
                        <>
                          Profil <b>{t.nama}</b> beserta fotonya akan dihapus permanen.
                        </>
                      }
                      action={() => deleteTutorAction(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                </div>
              </div>
            </SelectableCard>
          ))}
        </SelectableGrid>
      ) : filtered ? (
        <EmptyState icon={Search} title="Tidak ada tutor yang cocok" desc="Coba kata kunci, status, jenjang, atau kelas lain." />
      ) : (
        <EmptyState
          icon={Presentation}
          title="Belum ada tutor"
          desc="Tambahkan profil tutor agar calon peserta mengenal pengajar kelas COC."
          action={
            <button onClick={() => setDialog({ open: true, tutor: null })} className="btn-primary mt-2">
              <Plus className="h-4 w-4" /> Tambah tutor pertama
            </button>
          }
        />
      )}

      {dialog.open && <TutorDialog tutor={dialog.tutor} classes={classes} onClose={() => setDialog({ open: false, tutor: null })} />}
    </>
  );
}

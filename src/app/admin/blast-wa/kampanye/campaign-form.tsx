"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CalendarClock, CircleAlert, CircleCheck, CircleX, Dices, ImagePlus, Play, Save, Send, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import { countAudienceAction, saveCampaignAction, testSendAction } from "@/app/actions/blast-wa";
import { BLAST_JENJANG, PROVINSI } from "@/lib/constants";
import { analyzeMessage, BLAST_MAX_TEXT, hourlyCap, MESSAGE_VARS, renderMessage, type MessageContact } from "@/lib/blast-wa-shared";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Field } from "@/components/ui";
import { Spinner, useFormAction } from "@/components/form-buttons";

export type CampaignInit = {
  id: number;
  status: string;
  name: string;
  message: string;
  imageFile: string | null;
  delayMin: number;
  delayMax: number;
  batchSize: number;
  batchRestMin: number;
  hourStart: number;
  hourEnd: number;
  dailyLimit: number;
  audienceNote: string | null;
};

const PRESETS = [
  { key: "sangat", label: "Sangat aman", desc: "Nomor baru / sedang warm-up", v: { delayMin: 60, delayMax: 120, batchSize: 15, batchRestMin: 15 } },
  { key: "aman", label: "Aman (disarankan)", desc: "Nomor sudah stabil", v: { delayMin: 30, delayMax: 75, batchSize: 20, batchRestMin: 10 } },
  { key: "normal", label: "Normal", desc: "Nomor lama & balasan tinggi", v: { delayMin: 20, delayMax: 45, batchSize: 30, batchRestMin: 6 } },
] as const;

const FORM_ID = "campaign-form";
const getForm = () => document.getElementById(FORM_ID) as HTMLFormElement | null;

/** pengacak deterministik untuk pratinjau (tombol "Acak" mengganti seed) */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const SAMPLE: MessageContact = { nama: "Budi Santoso", sekolah: "SDN 1 Contoh", jenjang: "SD", kelas: "5", kota: "Bandung", provinsi: "Jawa Barat" };

const DEFAULT_MESSAGE = `{Halo|Hai|Selamat datang} Kak {nama_depan} 👋

{Kami dari|Ini admin} Pelatihan POSI ingin berbagi info kelas persiapan olimpiade untuk jenjang {jenjang|SD–SMA}.

Apakah Kakak tertarik dengan info jadwal & biayanya? Balas *YA* ya Kak 🙏

_Balas STOP bila tidak ingin menerima info lagi._`;

export function CampaignForm({
  campaign,
  labels,
  senderConnected,
  warmCap,
}: {
  campaign: CampaignInit | null;
  labels: string[];
  senderConnected: boolean;
  warmCap: number;
}) {
  const toast = useToast();
  const intentRef = useRef<HTMLInputElement>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveCampaignAction);
  // penerima ditetapkan saat kampanye dibuat (edit tidak mengubah daftar penerima)
  const editAudience = !campaign;

  const [message, setMessage] = useState(campaign?.message ?? DEFAULT_MESSAGE);
  const [pacing, setPacing] = useState({
    delayMin: campaign?.delayMin ?? 30,
    delayMax: campaign?.delayMax ?? 75,
    batchSize: campaign?.batchSize ?? 20,
    batchRestMin: campaign?.batchRestMin ?? 10,
    hourStart: campaign?.hourStart ?? 8,
    hourEnd: campaign?.hourEnd ?? 20,
    dailyLimit: campaign?.dailyLimit ?? Math.min(150, warmCap),
  });
  const [when, setWhen] = useState<"now" | "later">("now");
  const [image, setImage] = useState<{ url: string; name: string } | null>(campaign?.imageFile ? { url: `/api/admin/blast-wa/gambar/${campaign.imageFile}`, name: "gambar tersimpan" } : null);
  const [removeImage, setRemoveImage] = useState(false);
  const [audience, setAudience] = useState<{ count: number; sample: MessageContact[] } | null>(null);
  const [audTick, setAudTick] = useState(0);
  const [seed, setSeed] = useState(1);
  const [testPhone, setTestPhone] = useState("");
  const [testing, startTest] = useTransition();

  // hitung audiens (debounce)
  useEffect(() => {
    if (!editAudience) return;
    const t = setTimeout(async () => {
      const form = getForm();
      if (!form) return;
      try {
        setAudience(await countAudienceAction(new FormData(form)));
      } catch {
        /* abaikan */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [audTick, editAudience]);

  const analysis = useMemo(() => analyzeMessage(message), [message]);
  const preview = useMemo(() => renderMessage(message, audience?.sample[0] ?? SAMPLE, { random: seeded(seed) }), [message, audience, seed]);

  const insert = (text: string) => {
    const el = msgRef.current;
    if (!el) return setMessage((m) => m + text);
    const { selectionStart: a, selectionEnd: b } = el;
    const next = message.slice(0, a) + text + message.slice(b);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + text.length, a + text.length);
    });
  };

  // estimasi durasi
  const count = audience?.count ?? 0;
  const avg = (pacing.delayMin + pacing.delayMax) / 2 + 9; // + jeda gateway & "mengetik…"
  const perHourBySpeed = 3600 / (avg + (pacing.batchRestMin * 60) / Math.max(1, pacing.batchSize));
  const perDay = Math.max(1, Math.floor(Math.min(pacing.dailyLimit, warmCap, Math.min(perHourBySpeed, hourlyCap(warmCap)) * Math.max(1, pacing.hourEnd - pacing.hourStart))));
  const days = count ? Math.ceil(count / perDay) : 0;

  const setNum = (k: keyof typeof pacing) => (e: React.ChangeEvent<HTMLInputElement>) => setPacing((p) => ({ ...p, [k]: Number(e.target.value) }));
  const submit = (intent: string) => {
    if (intentRef.current) intentRef.current.value = intent;
  };

  return (
    <form
      {...formProps}
      id={FORM_ID}
      className="grid gap-6 xl:grid-cols-[1fr_380px]"
      onChange={(e) => {
        if ((e.target as unknown as { name?: string }).name?.startsWith("a")) setAudTick((n) => n + 1);
      }}
    >
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <input type="hidden" name="intent" ref={intentRef} defaultValue="draft" />
      <input type="hidden" name="removeImage" value={removeImage ? "1" : "0"} />

      <div className="space-y-6">
        {/* 1. Pesan */}
        <section className="card space-y-4">
          <p className="flex items-center gap-2 font-bold text-navy-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs text-white">1</span> Pesan
          </p>
          <Field label="Nama kampanye *" htmlFor="name" errors={fe?.name}>
            <input id="name" name="name" defaultValue={campaign?.name} className="input" placeholder="Mis. Promo COC Olimpiade SD — Oktober" maxLength={160} required />
          </Field>
          <Field label="Isi pesan *" htmlFor="message" errors={fe?.message} hint={`${message.length.toLocaleString("id-ID")}/${BLAST_MAX_TEXT.toLocaleString("id-ID")} karakter · *tebal* _miring_ ~coret~`}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {MESSAGE_VARS.map((v) => (
                <button key={v.key} type="button" onClick={() => insert(`{${v.key}}`)} title={v.label} className="rounded-lg bg-brand-50 px-2 py-1 font-mono text-[11px] font-bold text-brand-700 hover:bg-brand-100">
                  {`{${v.key}}`}
                </button>
              ))}
              <button type="button" onClick={() => insert("{Halo|Hai|Selamat datang}")} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100">
                <Sparkles className="h-3 w-3" /> Spintax
              </button>
            </div>
            <textarea ref={msgRef} id="message" name="message" value={message} onChange={(e) => setMessage(e.target.value)} className="input min-h-56 font-mono text-sm" maxLength={BLAST_MAX_TEXT} required />
          </Field>
          <p className="text-xs text-navy-400">
            Variabel kosong bisa diberi cadangan: <code className="font-mono">{"{sekolah|sekolah Kakak}"}</code>. Spintax <code className="font-mono">{"{Halo|Hai}"}</code> dipilih acak per penerima sehingga tidak ada dua pesan yang persis sama.
          </p>
          <div>
            <p className="label">Gambar (opsional)</p>
            {image && !removeImage ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="Lampiran" className="h-20 w-20 rounded-xl object-cover ring-1 ring-navy-100" />
                <button
                  type="button"
                  className="btn-ghost text-rose-600"
                  onClick={() => {
                    setImage(null);
                    setRemoveImage(true);
                    const input = getForm()?.querySelector<HTMLInputElement>("input[name=image]");
                    if (input) input.value = "";
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Hapus gambar
                </button>
              </div>
            ) : null}
            <label className={cn("mt-2 flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-navy-100 p-3 text-sm text-navy-500 hover:border-brand-300", image && !removeImage && "hidden")}>
              <ImagePlus className="h-5 w-5 text-brand-600" /> Pilih gambar JPG/PNG (maks 1 MB) — isi pesan menjadi keterangan gambar
              <input
                type="file"
                name="image"
                accept="image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 1024 * 1024) {
                    toast.error("Ukuran gambar maksimal 1 MB.");
                    e.target.value = "";
                    return;
                  }
                  setImage({ url: URL.createObjectURL(f), name: f.name });
                  setRemoveImage(false);
                }}
              />
            </label>
            {fe?.image && <p className="mt-1 text-xs text-rose-600">{fe.image[0]}</p>}
          </div>
        </section>

        {/* 2. Audiens */}
        <section className="card space-y-4">
          <p className="flex items-center gap-2 font-bold text-navy-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs text-white">2</span> Penerima
          </p>
          {editAudience ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Label / grup" htmlFor="aLabel">
                  <select id="aLabel" name="aLabel" className="input" defaultValue="">
                    <option value="">Semua label</option>
                    {labels.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Jenjang" htmlFor="aJenjang">
                  <select id="aJenjang" name="aJenjang" className="input" defaultValue="">
                    <option value="">Semua jenjang</option>
                    {BLAST_JENJANG.map((j) => (
                      <option key={j}>{j}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Provinsi" htmlFor="aProvinsi">
                  <select id="aProvinsi" name="aProvinsi" className="input" defaultValue="">
                    <option value="">Semua provinsi</option>
                    {PROVINSI.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Kota mengandung" htmlFor="aKota">
                  <input id="aKota" name="aKota" className="input" placeholder="mis. Bandung" />
                </Field>
                <Field label="Sekolah mengandung" htmlFor="aSekolah">
                  <input id="aSekolah" name="aSekolah" className="input" placeholder="mis. SDN" />
                </Field>
                <Field label="Riwayat" htmlFor="aStatus">
                  <select id="aStatus" name="aStatus" className="input" defaultValue="">
                    <option value="">Semua kontak aktif</option>
                    <option value="never">Belum pernah di-blast</option>
                    <option value="replied">Pernah membalas</option>
                  </select>
                </Field>
                <Field label="Jangan kirim ke yang di-blast dalam" htmlFor="aNotBlastedDays" hint="hari terakhir (0 = abaikan)" className="sm:col-span-3">
                  <input id="aNotBlastedDays" name="aNotBlastedDays" type="number" min={0} max={365} defaultValue={7} className="input w-32" />
                </Field>
              </div>
              <p className="flex items-center gap-2 rounded-2xl bg-brand-50 p-3 text-sm text-brand-800">
                <Users className="h-4 w-4" />
                {audience ? (
                  <span>
                    <b>{audience.count.toLocaleString("id-ID")}</b> kontak akan dikirimi. Kontak berhenti berlangganan & nomor tanpa WhatsApp otomatis dikecualikan.
                  </span>
                ) : (
                  <span>Menghitung penerima…</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-navy-500">
              Penerima sudah ditetapkan saat kampanye dibuat: <b>{campaign?.audienceNote ?? "-"}</b>. Duplikat kampanye bila ingin audiens lain.
            </p>
          )}
        </section>

        {/* 3. Kecepatan & jadwal */}
        <section className="card space-y-4">
          <p className="flex items-center gap-2 font-bold text-navy-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs text-white">3</span> Kecepatan kirim & jadwal
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => {
              const on = p.v.delayMin === pacing.delayMin && p.v.delayMax === pacing.delayMax && p.v.batchSize === pacing.batchSize && p.v.batchRestMin === pacing.batchRestMin;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPacing((x) => ({ ...x, ...p.v }))}
                  className={cn("rounded-2xl border p-3 text-left transition", on ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-navy-100 hover:bg-navy-50/60")}
                >
                  <span className="block text-sm font-bold text-navy-900">{p.label}</span>
                  <span className="block text-xs text-navy-500">
                    {p.v.delayMin}–{p.v.delayMax} dtk · istirahat {p.v.batchRestMin} mnt / {p.v.batchSize} pesan
                  </span>
                  <span className="block text-[11px] text-navy-400">{p.desc}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Jeda min (dtk)" htmlFor="delayMin" errors={fe?.delayMin}>
              <input id="delayMin" name="delayMin" type="number" min={15} max={600} value={pacing.delayMin} onChange={setNum("delayMin")} className="input" />
            </Field>
            <Field label="Jeda maks (dtk)" htmlFor="delayMax" errors={fe?.delayMax}>
              <input id="delayMax" name="delayMax" type="number" min={15} max={900} value={pacing.delayMax} onChange={setNum("delayMax")} className="input" />
            </Field>
            <Field label="Istirahat tiap (pesan)" htmlFor="batchSize" errors={fe?.batchSize}>
              <input id="batchSize" name="batchSize" type="number" min={5} max={100} value={pacing.batchSize} onChange={setNum("batchSize")} className="input" />
            </Field>
            <Field label="Lama istirahat (mnt)" htmlFor="batchRestMin" errors={fe?.batchRestMin}>
              <input id="batchRestMin" name="batchRestMin" type="number" min={1} max={180} value={pacing.batchRestMin} onChange={setNum("batchRestMin")} className="input" />
            </Field>
            <Field label="Jam kirim mulai (WIB)" htmlFor="hourStart">
              <input id="hourStart" name="hourStart" type="number" min={0} max={23} value={pacing.hourStart} onChange={setNum("hourStart")} className="input" />
            </Field>
            <Field label="Jam kirim selesai" htmlFor="hourEnd" errors={fe?.hourEnd}>
              <input id="hourEnd" name="hourEnd" type="number" min={1} max={24} value={pacing.hourEnd} onChange={setNum("hourEnd")} className="input" />
            </Field>
            <Field label="Maks pesan / hari" htmlFor="dailyLimit" errors={fe?.dailyLimit} hint={`kuota nomor saat ini ${warmCap}/hari`} className="col-span-2">
              <input id="dailyLimit" name="dailyLimit" type="number" min={5} max={1000} value={pacing.dailyLimit} onChange={setNum("dailyLimit")} className="input" />
            </Field>
          </div>
          {(pacing.delayMin < 20 || pacing.batchSize > 40) && (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Jeda di bawah 20 detik / batch di atas 40 pesan menaikkan risiko nomor dibatasi.
            </p>
          )}
          {(pacing.hourStart < 7 || pacing.hourEnd > 21) && (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Kirim di luar jam 07.00–21.00 lebih sering dilaporkan penerima sebagai spam.
            </p>
          )}
          {editAudience && count > 0 && (
            <p className="text-xs text-navy-500">
              Perkiraan: ±{perDay.toLocaleString("id-ID")} pesan/hari → selesai dalam <b>±{days} hari</b> kirim (sisa kiriman otomatis lanjut besok di jam kirim).
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
              <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} className="accent-brand-600" /> Kirim sekarang
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
              <input type="radio" checked={when === "later"} onChange={() => setWhen("later")} className="accent-brand-600" /> Jadwalkan
            </label>
            {when === "later" && <input type="datetime-local" name="scheduledAt" className="input w-auto" />}
            {fe?.scheduledAt && <p className="w-full text-xs text-rose-600">{fe.scheduledAt[0]}</p>}
          </div>
        </section>
      </div>

      {/* Samping: pratinjau + analisis + tombol */}
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Pratinjau · {audience?.sample[0]?.nama ?? SAMPLE.nama}</p>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSeed((s) => s + 7)} title="Acak variasi spintax">
              <Dices className="h-4 w-4" /> Acak
            </button>
          </div>
          <div className="rounded-2xl bg-[#e5ddd5] p-3">
            <div className="ml-auto max-w-[95%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-2.5 text-sm text-navy-900 shadow-sm">
              {image && !removeImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="" className="mb-2 max-h-48 w-full rounded-xl object-cover" />
              )}
              <p className="whitespace-pre-wrap wrap-break-word">{preview || "…"}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="mb-2 flex items-center justify-between text-sm font-bold text-navy-900">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-600" /> Kualitas pesan (anti-spam)
            </span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-extrabold", analysis.score >= 75 ? "bg-emerald-50 text-emerald-700" : analysis.score >= 50 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>
              {analysis.score}/100
            </span>
          </p>
          <ul className="space-y-1.5">
            {analysis.checks.map((c) => {
              const Icon = c.ok === true ? CircleCheck : c.ok === "warn" ? CircleAlert : CircleX;
              return (
                <li key={c.label} className="flex gap-2 text-xs">
                  <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", c.ok === true ? "text-emerald-500" : c.ok === "warn" ? "text-amber-500" : "text-rose-500")} />
                  <span>
                    <span className="text-navy-700">{c.label}</span>
                    {c.ok !== true && c.tip && <span className="block text-navy-400">{c.tip}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card space-y-2">
          <p className="text-sm font-bold text-navy-900">Kirim uji ke nomor sendiri</p>
          <div className="flex gap-2">
            <input name="testPhone" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="input" placeholder="08xxxxxxxxxx" inputMode="tel" />
            <button
              type="button"
              className="btn-secondary shrink-0"
              disabled={testing || !senderConnected || testPhone.replace(/\D/g, "").length < 10}
              title={senderConnected ? "Kirim 1 pesan uji" : "Nomor blast belum tersambung"}
              onClick={() =>
                startTest(async () => {
                  const form = getForm();
                  if (form) toast.fromResult(await testSendAction(new FormData(form)));
                })
              }
            >
              {testing ? <Spinner /> : <Send className="h-4 w-4" />} Uji
            </button>
          </div>
          {!senderConnected && <p className="text-xs text-amber-700">Tautkan nomor blast di tab Ringkasan untuk mengirim uji / menjalankan kampanye.</p>}
        </div>

        <div className="card flex flex-col gap-2">
          {when === "now" ? (
            <button type="submit" className="btn-primary justify-center" disabled={pending} onClick={() => submit("start")}>
              {pending ? <Spinner /> : <Play className="h-4 w-4" />} {campaign && campaign.status !== "DRAFT" ? "Simpan & lanjutkan" : "Simpan & jalankan"}
            </button>
          ) : (
            <button type="submit" className="btn-primary justify-center" disabled={pending} onClick={() => submit("schedule")}>
              {pending ? <Spinner /> : <CalendarClock className="h-4 w-4" />} Simpan & jadwalkan
            </button>
          )}
          <button type="submit" className="btn-secondary justify-center" disabled={pending} onClick={() => submit("draft")}>
            <Save className="h-4 w-4" /> {campaign?.status === "PAUSED" ? "Simpan (tetap dijeda)" : "Simpan sebagai draf"}
          </button>
        </div>
      </aside>
    </form>
  );
}

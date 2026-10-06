"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, GraduationCap, KeyRound, LoaderCircle, Mail, Sparkles, TriangleAlert, UserPlus } from "lucide-react";
import { enrollInfoAction, enrollLeadAction, registerLeadAccountAction, type EnrollInfo } from "@/app/actions/lead-activation";
import { matchProduct, type MatchProduct } from "@/lib/product-match";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { LeadRow } from "./lead-form";

export type ActivationProduct = MatchProduct & { type: string; status: string };
export type LeadActivation = { id: number; code: string; productId: number | null; product: string; email: string; status: string };

const STATUS_LABEL: Record<string, string> = { OPEN: "", RUNNING: " · berjalan", CLOSED: " · ditutup" };

/* ======================= Langkah 1: registrasi akun ======================= */

function RegisterAccountDialog({ lead, onClose, onRegistered }: { lead: LeadRow; onClose: () => void; onRegistered: () => void }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const submit = () =>
    start(async () => {
      const r = await registerLeadAccountAction(lead.id);
      if (toast.fromResult(r)) {
        router.refresh();
        onRegistered();
      }
    });
  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      icon={UserPlus}
      title="Registrasi akun peserta"
      description="Langkah 1 dari 2 — setelah akun dibuat, Anda bisa langsung mendaftarkannya ke kelas (atau lewati)."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Batal
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={pending}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Registrasi akun
          </button>
        </>
      }
    >
      <dl className="divide-y divide-dashed divide-navy-100 rounded-2xl bg-navy-50/60 px-4 text-sm">
        {[
          ["Nama", lead.nama],
          ["No. WhatsApp", lead.noWa ?? "-"],
          ["Email login", lead.email ?? "-"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5">
            <dt className="text-navy-400">{k}</dt>
            <dd className="text-right font-semibold text-navy-800">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Password awal: <b className="font-mono">smartchampion</b>. Sampaikan ke peserta dan minta ganti di menu Akun setelah login pertama.
        </span>
      </p>
    </Modal>
  );
}

/* ======================= Langkah 2: daftarkan ke kelas ======================= */

function EnrollClassDialog({
  lead,
  products,
  onClose,
  afterRegister,
}: {
  lead: LeadRow;
  products: ActivationProduct[];
  onClose: () => void;
  afterRegister: boolean;
}) {
  const match = useMemo(() => matchProduct(lead.paket, products), [lead.paket, products]);
  const [productId, setProductId] = useState<number | "">(match.productId ?? "");
  const [sessions, setSessions] = useState(Number(lead.paket?.match(/(\d+)\s*x/i)?.[1]) || 1);
  const [info, setInfo] = useState<EnrollInfo | null>(null);
  const [saving, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const byId = new Map(products.map((p) => [p.id, p]));
  const product = productId ? byId.get(productId) : undefined;
  const suggested = match.suggestions.map((id) => byId.get(id)).filter(Boolean) as ActivationProduct[];
  const others = products.filter((p) => !match.suggestions.includes(p.id));
  const paid = lead.statusFunnel === "Paid";

  useEffect(() => {
    let alive = true;
    void enrollInfoAction(lead.id).then((r) => {
      if (!alive) return;
      if ("error" in r) toast.error(r.error);
      else setInfo(r);
    });
    return () => {
      alive = false;
    };
  }, [lead.id, toast]);

  const alreadyInClass = !!(product && info?.paidProductIds.includes(product.id) && product.type !== "PRIVATE");
  const canSubmit = paid && !!productId && !!info?.account && !info.linked && !alreadyInClass && !saving;

  const submit = () =>
    start(async () => {
      const r = await enrollLeadAction({ leadId: lead.id, productId: Number(productId), sessions });
      if (toast.fromResult(r)) {
        router.refresh();
        onClose();
      }
    });

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      size="lg"
      icon={GraduationCap}
      title="Daftarkan ke kelas"
      description={`${afterRegister ? "Langkah 2 dari 2 — " : ""}${lead.nama} · pendaftaran dicatat Lunas (tanpa Midtrans). Klik Batal bila cukup registrasi akun saja.`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />} Daftarkan ke kelas
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-navy-600">
          <Mail className="h-4 w-4 text-navy-400" /> Akun: <b className="text-navy-900">{lead.email}</b>
          {!info && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-navy-400" />}
          {info && !info.account && <span className="font-semibold text-rose-600">(belum ada akun)</span>}
        </p>

        {!paid && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Status lead ini <b>{lead.statusFunnel}</b>, belum Paid. Daftarkan ke kelas setelah peserta lunas (ubah status lead menjadi Paid), atau klik Batal
              untuk cukup registrasi akun.
            </span>
          </p>
        )}
        {info?.linked && (
          <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> Lead ini sudah terhubung ke pendaftaran <b>{info.linked.code}</b> ({info.linked.product}).
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs text-navy-400">
            Paket / bidang / jenjang di Master Lead: <b className="text-navy-700">{lead.paket?.trim() || "(kosong)"}</b>
          </p>
          {match.productId && productId === match.productId ? (
            <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Kelas terisi otomatis: <b>{byId.get(match.productId)?.name}</b>
                {match.confidence === "high" && " (dari kata mapel & jenjang — pastikan sudah benar)"}.
              </span>
            </p>
          ) : !match.productId ? (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {match.confidence === "ambiguous"
                  ? "Kelas dari kolom Paket kurang spesifik (cocok ke lebih dari satu kelas)."
                  : "Kelas dari kolom Paket tidak terdeteksi di sistem."}{" "}
                <b>Silakan pilih kelasnya di sini</b> agar peserta tidak salah kelas.
              </span>
            </p>
          ) : null}
          <Field label="Kelas tujuan *" htmlFor="act-product">
            <select
              id="act-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}
              className={cn("input", !productId && "border-amber-300 ring-4 ring-amber-100")}
            >
              <option value="">— Pilih kelas —</option>
              {suggested.length > 0 && (
                <optgroup label="Paling cocok">
                  {suggested.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.type === "PRIVATE" ? " (VIP Privat)" : ""}
                      {STATUS_LABEL[p.status] ?? ""}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={suggested.length ? "Kelas lain" : "Semua kelas"}>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.type === "PRIVATE" ? " (VIP Privat)" : ""}
                    {STATUS_LABEL[p.status] ?? ""}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          {product?.type === "PRIVATE" && (
            <Field label="Jumlah pertemuan yang dibeli *" htmlFor="act-sessions">
              <input
                id="act-sessions"
                type="number"
                min={1}
                max={100}
                value={sessions}
                onChange={(e) => setSessions(Number(e.target.value) || 1)}
                className="input w-32"
              />
            </Field>
          )}
          {alreadyInClass && <p className="text-sm font-semibold text-rose-600">Akun ini sudah terdaftar lunas di kelas tersebut.</p>}
        </div>

        <p className="rounded-2xl bg-navy-50/60 p-3 text-xs text-navy-500">
          Tanggal bayar & nominal diambil dari lead. Kolom Paket di lead akan diganti nama kelas resmi dan lead ditautkan ke pendaftaran.
        </p>
      </div>
    </Modal>
  );
}

/* ======================= Alur ======================= */

/** mode "akun": registrasi akun lalu (opsional) daftarkan ke kelas; mode "kelas": langsung daftarkan ke kelas */
export function LeadAccountFlow({
  lead,
  mode,
  products,
  onClose,
}: {
  lead: LeadRow;
  mode: "akun" | "kelas";
  products: ActivationProduct[];
  onClose: () => void;
}) {
  const [step, setStep] = useState<"akun" | "kelas">(mode);
  return step === "akun" ? (
    <RegisterAccountDialog lead={lead} onClose={onClose} onRegistered={() => setStep("kelas")} />
  ) : (
    <EnrollClassDialog lead={lead} products={products} onClose={onClose} afterRegister={mode === "akun"} />
  );
}

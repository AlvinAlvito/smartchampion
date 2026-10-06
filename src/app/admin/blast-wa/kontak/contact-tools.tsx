"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { importContactsAction, pullContactsAction, type ContactImportSample } from "@/app/actions/blast-wa";
import { FUNNEL_STATUSES } from "@/lib/constants";
import { ImportButton, type ImportConfig } from "@/components/import-dialog";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";

const CONFIG: ImportConfig<ContactImportSample> = {
  action: importContactsAction,
  templateHref: "/api/admin/blast-wa/kontak/template",
  noun: "kontak",
  duplicateLabel: "Nomor sudah ada",
  skipLabel: (
    <>
      <b>Lewati nomor yang sudah ada di kontak Anda.</b> Hapus centang untuk memperbarui data kontak lama (nama, sekolah, label, dll) dengan isi file.
    </>
  ),
  sampleColumns: [
    { label: "Nama", render: (r) => r.nama, className: "font-semibold text-navy-800" },
    { label: "No. WA", render: (r) => r.noHp },
    { label: "Sekolah", render: (r) => r.sekolah },
    { label: "Label", render: (r) => r.labels },
  ],
};

/** Import Excel + ambil kontak dari Data Blast / Master Lead */
export function ContactTools() {
  const [open, setOpen] = useState(false);
  const [leadStatus, setLeadStatus] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const pull = (from: "blast" | "lead") =>
    start(async () => {
      if (toast.fromResult(await pullContactsAction(from, leadStatus))) {
        setOpen(false);
        router.refresh();
      }
    });
  return (
    <>
      <ImportButton config={CONFIG} />
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <DatabaseZap className="h-4 w-4 text-brand-600" /> Ambil dari data lain
      </button>
      <Modal open={open} onClose={() => !pending && setOpen(false)} icon={DatabaseZap} title="Ambil kontak dari data yang sudah ada" description="Hanya data milik Anda; nomor yang sudah ada di kontak dilewati.">
        <div className="space-y-4">
          <div className="rounded-2xl bg-navy-50/60 p-4">
            <p className="font-bold text-navy-900">Data Blast</p>
            <p className="mb-3 text-xs text-navy-500">Semua data blast WhatsApp dengan owner Anda (label “Data Blast”).</p>
            <button className="btn-primary" disabled={pending} onClick={() => pull("blast")}>
              {pending && <Spinner />} Ambil dari Data Blast
            </button>
          </div>
          <div className="rounded-2xl bg-navy-50/60 p-4">
            <p className="font-bold text-navy-900">Master Lead</p>
            <p className="mb-3 text-xs text-navy-500">Lead milik Anda yang punya No. WA (label “Master Lead” + status funnel).</p>
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)} aria-label="Status funnel">
                <option value="">Semua status funnel</option>
                {FUNNEL_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button className="btn-primary" disabled={pending} onClick={() => pull("lead")}>
                {pending && <Spinner />} Ambil dari Master Lead
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

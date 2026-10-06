"use client";

import { importBlastsAction, type BlastImportSample } from "@/app/actions/blasts";
import { ImportButton, type ImportConfig } from "@/components/import-dialog";

const CONFIG: ImportConfig<BlastImportSample> = {
  action: importBlastsAction,
  templateHref: "/api/admin/blast/template",
  noun: "data blast",
  duplicateLabel: "Duplikat kontak",
  skipLabel: (
    <>
      <b>Lewati kontak yang sudah pernah di-blast lewat kanal yang sama</b> (No. HP untuk WhatsApp, email untuk Email) agar data tidak dobel. Hapus centang untuk tetap
      mengimpor semuanya.
    </>
  ),
  sampleColumns: [
    { label: "Nama", render: (r) => r.nama, className: "font-semibold text-navy-800" },
    { label: "Kontak", render: (r) => r.kontak ?? "-" },
    { label: "Asal", render: (r) => r.asalBlast },
    { label: "Sekolah", render: (r) => r.sekolah },
    { label: "Owner", render: (r) => r.owner },
  ],
};

export function ImportBlastButton() {
  return <ImportButton config={CONFIG} />;
}

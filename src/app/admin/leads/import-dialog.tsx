"use client";

import { importLeadsAction, type LeadImportSample } from "@/app/actions/leads";
import { ImportButton, type ImportConfig } from "@/components/import-dialog";

const CONFIG: ImportConfig<LeadImportSample> = {
  action: importLeadsAction,
  templateHref: "/api/admin/leads/template",
  noun: "lead",
  duplicateLabel: "Duplikat WA",
  skipLabel: (
    <>
      <b>Lewati lead yang No. WA-nya sudah ada di Master Lead</b> (disarankan, agar tidak terjadi lead dobel). Hapus centang untuk tetap mengimpor semuanya.
    </>
  ),
  sampleColumns: [
    { label: "Nama", render: (r) => r.nama, className: "font-semibold text-navy-800" },
    { label: "No. WA", render: (r) => r.noWa ?? "-" },
    { label: "Sumber", render: (r) => r.sumberLead },
    { label: "Status", render: (r) => r.statusFunnel },
    { label: "Owner", render: (r) => r.owner },
  ],
};

export function ImportLeadsButton() {
  return <ImportButton config={CONFIG} />;
}

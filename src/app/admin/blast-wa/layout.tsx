import { Megaphone } from "lucide-react";
import { requireStaff } from "@/lib/session";
import { canBlast } from "@/lib/blast-wa";
import { PageTitle } from "@/components/ui";
import { BlastTabs } from "./tabs";

export const metadata = { title: "Blast WhatsApp" };

export default async function BlastWaLayout({ children }: LayoutProps<"/admin/blast-wa">) {
  const session = await requireStaff();
  return (
    <>
      <PageTitle
        icon={Megaphone}
        eyebrow="CRM"
        title="Blast WhatsApp"
        subtitle={
          canBlast(session.role)
            ? "Kirim pesan massal yang dipersonalisasi dari nomor WhatsApp khusus blast — bertahap, terjadwal, dan dengan pengaman anti-blokir. Kontak otomatis tercatat di Data Blast."
            : "Pantau nomor blast, kontak, dan kampanye setiap admin (hanya lihat)."
        }
      />
      <BlastTabs />
      {children}
    </>
  );
}

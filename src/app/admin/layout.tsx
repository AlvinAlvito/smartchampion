import { cookies } from "next/headers";
import { isReadOnly, requirePanel } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/constants";
import { AdminShell } from "./admin-nav";
import { ReadOnlyProvider } from "@/components/read-only";
import { NOINDEX } from "@/lib/seo";

// panel & area akun tidak boleh muncul di Google
export const metadata = NOINDEX;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePanel();
  const collapsed = (await cookies()).get("pp_sidebar_collapsed")?.value === "1";
  return (
    <AdminShell initialCollapsed={collapsed} user={{ name: session.name, roleLabel: ROLE_LABEL[session.role], role: session.role }}>
      {isReadOnly(session.role) ? <ReadOnlyProvider>{children}</ReadOnlyProvider> : children}
    </AdminShell>
  );
}

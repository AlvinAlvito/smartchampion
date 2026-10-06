import { getSession, isPanel } from "@/lib/session";
import { SiteHeaderClient } from "./site-header-client";

export async function SiteHeader() {
  const session = await getSession();
  return (
    <SiteHeaderClient
      user={session ? { name: session.name, role: session.role, staff: isPanel(session.role) } : null}
    />
  );
}

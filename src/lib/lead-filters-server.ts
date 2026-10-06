import "server-only";
import { prisma } from "./prisma";
import { buildLeadWhere, type LeadFilters } from "./lead-filters";

/** Sama dengan buildLeadWhere, tetapi memuat data pendaftaran bila filter "akun peserta" dipakai. */
export async function buildLeadWhereWithAccounts(f: LeadFilters) {
  if (!f.akun) return buildLeadWhere(f);
  const [regs, users] = await Promise.all([
    prisma.registration.findMany({ select: { code: true, sourceLeadId: true } }),
    prisma.user.findMany({ where: { role: "PESERTA" }, select: { email: true } }),
  ]);
  return buildLeadWhere(f, {
    codes: regs.map((r) => r.code),
    leadIds: regs.map((r) => r.sourceLeadId).filter((x): x is number => x != null),
    emails: users.map((u) => u.email),
  });
}

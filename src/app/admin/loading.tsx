import { BrandLoader, Sk, StatsSkeleton, TableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Sk className="h-12 w-12 rounded-2xl" />
        <div className="space-y-2">
          <Sk className="h-3 w-24" />
          <Sk className="h-7 w-56" />
        </div>
      </div>
      <BrandLoader label="Memuat data..." />
      <StatsSkeleton />
      <TableSkeleton />
    </div>
  );
}

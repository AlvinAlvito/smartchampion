import { BrandLoader, CardGridSkeleton, Sk, StatsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="rounded-[32px] bg-hero p-8">
        <Sk className="mb-3 h-4 w-32 opacity-20" />
        <Sk className="h-8 w-64 opacity-20" />
      </div>
      <BrandLoader label="Menyiapkan dashboard..." />
      <StatsSkeleton />
      <CardGridSkeleton count={3} />
    </div>
  );
}

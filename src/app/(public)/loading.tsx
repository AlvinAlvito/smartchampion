import { BrandLoader, CardGridSkeleton, Sk } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <div className="bg-hero pb-20 pt-12">
        <div className="container-page space-y-4">
          <Sk className="h-6 w-48 rounded-full opacity-20" />
          <Sk className="h-10 w-2/3 opacity-20" />
          <Sk className="h-4 w-1/2 opacity-20" />
        </div>
      </div>
      <div className="container-page relative z-10 -mt-10 space-y-6 pb-10">
        <div className="card">
          <BrandLoader />
        </div>
        <CardGridSkeleton />
      </div>
    </>
  );
}

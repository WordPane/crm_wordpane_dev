import { Skeleton } from "@/components/ui/skeleton";

export default function CompanyDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-44" />
      </div>
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

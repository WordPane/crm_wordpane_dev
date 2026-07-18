import { Skeleton } from "@/components/ui/skeleton";

export default function PortalUsersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-8 w-full max-w-md" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

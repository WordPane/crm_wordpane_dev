import { Skeleton } from "@/components/ui/skeleton";

export default function NewProjectLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-44" />
      </div>
      <Skeleton className="h-[32rem] w-full rounded-xl" />
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Columns3 } from "lucide-react";
import { useLocation } from "wouter";

const DISPUTE_COLUMNS = [
  { status: "Pending SME Review", label: "Pending SME Review", color: "bg-blue-500" },
  { status: "Markdown Disputed", label: "Markdown Disputed", color: "bg-orange-500" },
  { status: "Markdown Retained - QA", label: "Retained (QA)", color: "bg-red-500" },
  { status: "QA Decision Rejected", label: "QA Rejected", color: "bg-purple-500" },
  { status: "Markdown Retained - Trainer", label: "Retained (Trainer)", color: "bg-rose-500" },
  { status: "Trainer Decision Rejected", label: "Trainer Rejected", color: "bg-fuchsia-500" },
];

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "-";
  const num = Number(ts);
  if (!isNaN(num) && num > 1e12) {
    return new Date(num).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DisputeBoard() {
  const [, setLocation] = useLocation();

  // Fetch all QA feedback logs that are in dispute states
  const query = trpc.compass.coachingList.useQuery(
    {
      coachingType: "qa_feedback",
      pageSize: 500,
      sortBy: "coaching_date",
      sortDir: "desc",
    },
    { refetchOnWindowFocus: false }
  );

  const disputeLogs = (query.data?.items ?? []).filter((log) =>
    DISPUTE_COLUMNS.some((col) => col.status === log.status)
  );

  const columns = DISPUTE_COLUMNS.map((col) => ({
    ...col,
    items: disputeLogs.filter((log) => log.status === col.status),
  }));

  const totalDisputes = disputeLogs.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          QA Dispute Board
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalDisputes} active dispute{totalDisputes !== 1 ? "s" : ""} across{" "}
          {columns.filter((c) => c.items.length > 0).length} stages
        </p>
      </div>

      {/* Kanban Board */}
      {query.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : totalDisputes === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Columns3 className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>No active disputes</EmptyTitle>
            <EmptyDescription>
              All QA feedback logs are either pending acknowledgement or resolved.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto">
          {columns.map((col) => (
            <div key={col.status} className="min-w-[220px]">
              {/* Column Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary" className="text-xs ml-auto">
                  {col.items.length}
                </Badge>
              </div>

              {/* Column Items */}
              <div className="space-y-2">
                {col.items.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-4 text-center">
                    <p className="text-xs text-muted-foreground">Empty</p>
                  </div>
                ) : (
                  col.items.map((log) => (
                    <Card
                      key={log.coaching_id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() =>
                        setLocation(`/compass/coaching/${log.coaching_id}`)
                      }
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <p className="font-mono text-xs text-muted-foreground">
                          {log.coaching_id}
                        </p>
                        <p className="text-sm font-medium truncate">
                          {log.coachee_name}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(log.coaching_date)}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                            {log.coach_name}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

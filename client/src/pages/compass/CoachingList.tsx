import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  BookOpen,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";

const COACHING_TYPE_LABELS: Record<string, string> = {
  cap_0: "CAP 0",
  follow_up: "Follow-Up Session",
  group: "Group Coaching",
  triad: "Triad Coaching",
  qa_feedback: "QA Feedback",
  ztp: "ZTP Coaching",
};

const STATUS_COLORS: Record<string, string> = {
  "Pending Acknowledgement": "bg-amber-100 text-amber-800 border-amber-200",
  Acknowledged: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Pending SME Review": "bg-blue-100 text-blue-800 border-blue-200",
  "Markdown Disputed": "bg-orange-100 text-orange-800 border-orange-200",
  "Markdown Retained - QA": "bg-red-100 text-red-800 border-red-200",
  "QA Decision Rejected": "bg-purple-100 text-purple-800 border-purple-200",
  "Markdown Retained - Trainer":
    "bg-rose-100 text-rose-800 border-rose-200",
  "Trainer Decision Rejected":
    "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
};

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "-";
  // Handle both ISO date strings and unix timestamps
  const num = Number(ts);
  if (!isNaN(num) && num > 1e12) {
    return new Date(num).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CoachingList() {
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const [, setLocation] = useLocation();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [searchInput, setSearchInput] = useState(search);
  const [coachingType, setCoachingType] = useState<string>(
    params.get("type") ?? "all"
  );
  const [status, setStatus] = useState<string>(
    params.get("status") ?? "all"
  );

  const emp = trpc.compass.currentEmployee.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const query = trpc.compass.coachingList.useQuery(
    {
      page,
      pageSize: 25,
      coachingType:
        coachingType !== "all" ? (coachingType as any) : undefined,
      status: status !== "all" ? status : undefined,
      search: search || undefined,
      sortBy: "coaching_date",
      sortDir: "desc",
    },
    { refetchOnWindowFocus: false, placeholderData: (prev: any) => prev }
  );

  const canCreate = emp.data?.scope !== "self_only";

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setSearchInput("");
    setCoachingType("all");
    setStatus("all");
    setPage(1);
  };

  const hasFilters =
    search !== "" || coachingType !== "all" || status !== "all";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Coaching Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {query.data
              ? `${query.data.total.toLocaleString()} total records`
              : "Loading..."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setLocation("/compass/coaching/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Log
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, ID, or Job ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>

        <Select value={coachingType} onValueChange={(v) => { setCoachingType(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Coaching Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="cap_0">CAP 0</SelectItem>
            <SelectItem value="follow_up">Follow-Up Session</SelectItem>
            <SelectItem value="group">Group Coaching</SelectItem>
            <SelectItem value="triad">Triad Coaching</SelectItem>
            <SelectItem value="qa_feedback">QA Feedback</SelectItem>
            <SelectItem value="ztp">ZTP Coaching</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Pending Acknowledgement">Pending Ack</SelectItem>
            <SelectItem value="Acknowledged">Acknowledged</SelectItem>
            <SelectItem value="Pending SME Review">Pending SME Review</SelectItem>
            <SelectItem value="Markdown Disputed">Markdown Disputed</SelectItem>
            <SelectItem value="Markdown Retained - QA">Retained - QA</SelectItem>
            <SelectItem value="QA Decision Rejected">QA Decision Rejected</SelectItem>
            <SelectItem value="Markdown Retained - Trainer">Retained - Trainer</SelectItem>
            <SelectItem value="Trainer Decision Rejected">Trainer Decision Rejected</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : query.data && query.data.items.length > 0 ? (
        <>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[120px]">ID</TableHead>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead>Coachee</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[200px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((log) => (
                  <TableRow
                    key={log.coaching_id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() =>
                      setLocation(`/compass/coaching/${log.coaching_id}`)
                    }
                  >
                    <TableCell className="font-mono text-xs">
                      {log.coaching_id}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-medium">
                        {COACHING_TYPE_LABELS[log.coaching_type] ??
                          log.coaching_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium truncate max-w-[180px]">
                          {log.coachee_name ?? "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.coachee_ohr}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm truncate max-w-[160px]">
                        {log.coach_name ?? "-"}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(log.coaching_date)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          STATUS_COLORS[log.status ?? ""] ?? ""
                        }`}
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {query.data.page} of {query.data.totalPages} (
              {query.data.total.toLocaleString()} records)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (query.data?.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>No coaching logs found</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? "Try adjusting your filters or search terms."
                : "Create your first coaching log to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

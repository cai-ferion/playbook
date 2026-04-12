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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Plus,
  Search,
  Shield,
  Timer,
  XCircle,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  incident_reported: "Incident Reported",
  nte_issued: "NTE Issued",
  awaiting_response: "Awaiting Response",
  response_received: "Response Received",
  response_waived: "Response Waived",
  hearing_scheduled: "Hearing Scheduled",
  hearing_conducted: "Hearing Conducted",
  nod_issued: "NOD Issued",
  cap_issued: "CAP Issued",
  active_period: "Active Period",
  case_closed: "Case Closed",
  case_dismissed: "Case Dismissed",
};

const STATUS_COLORS: Record<string, string> = {
  incident_reported: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  nte_issued: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  awaiting_response: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  response_received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  response_waived: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  hearing_scheduled: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  hearing_conducted: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  nod_issued: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  cap_issued: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  active_period: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  case_closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  case_dismissed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const CAP_LABELS: Record<string, string> = {
  cap_0: "CAP 0",
  cap_1: "CAP 1",
  cap_2: "CAP 2",
  cap_3: "CAP 3",
};

export default function CACaseList() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [capFilter, setCapFilter] = useState<string>("all");

  const analyticsQuery = trpc.caCases.analyticsSummary.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const listQuery = trpc.caCases.list.useQuery(
    {
      page,
      pageSize: 20,
      search: search || undefined,
      caseStatus: statusFilter !== "all" ? statusFilter : undefined,
      capLevel: capFilter !== "all" ? capFilter : undefined,
    },
    {
      retry: false,
      refetchOnWindowFocus: false,
      placeholderData: (prev) => prev,
    }
  );

  const stats = analyticsQuery.data;
  const data = listQuery.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CA Cases</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Corrective Action case management and tracking
          </p>
        </div>
        <Button onClick={() => setLocation("/compass/cases/new")} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          New Case
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <FileWarning className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{stats?.totalCases ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Total Cases</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{stats?.activeCases ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Active Cases</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <Timer className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{stats?.activeCaps ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Active CAPs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{stats?.closedCases ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Closed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or case ID..."
              className="pl-9 h-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={capFilter}
          onValueChange={(v) => {
            setCapFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="All CAP Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All CAP Levels</SelectItem>
            {Object.entries(CAP_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Case ID</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Violation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>CAP Level</TableHead>
                <TableHead>Filed By</TableHead>
                <TableHead className="w-[100px]">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted rounded animate-pulse w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileWarning className="h-8 w-8" />
                      <p>No CA cases found</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation("/compass/cases/new")}
                      >
                        Create First Case
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((c) => (
                  <TableRow
                    key={c.case_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLocation(`/compass/cases/${c.case_id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {c.case_id}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{c.employee_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.employee_ohr}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-sm truncate">
                        {c.violation_category_name || c.violation_type || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-[11px] font-medium ${STATUS_COLORS[c.case_status] || ""}`}
                      >
                        {STATUS_LABELS[c.case_status] || c.case_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.final_cap_level || c.recommended_cap_level ? (
                        <Badge variant="outline" className="text-xs">
                          {CAP_LABELS[c.final_cap_level || c.recommended_cap_level || ""] ||
                            c.final_cap_level ||
                            c.recommended_cap_level ||
                            "—"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.created_by_name || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.created_at
                        ? new Date(parseInt(c.created_at)).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(data.page - 1) * data.pageSize + 1}–
            {Math.min(data.page * data.pageSize, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              {data.page} / {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

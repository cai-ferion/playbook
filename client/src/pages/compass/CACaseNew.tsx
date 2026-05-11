import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function CACaseNew() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Form state
  const [employeeOhr, setEmployeeOhr] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [violationCatalogId, setViolationCatalogId] = useState("");
  const [violationType, setViolationType] = useState("");
  const [incidentDate, setIncidentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [incidentDescription, setIncidentDescription] = useState("");
  const [linkedCoachingIds, setLinkedCoachingIds] = useState("");
  const [showAiRecommendation, setShowAiRecommendation] = useState(false);

  // Queries
  const employeesQuery = trpc.compass.employeeList.useQuery({}, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const violationCatalogQuery = trpc.compass.violationCatalog.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const attendanceSummaryQuery = trpc.caCases.attendanceSummary.useQuery(
    { employeeOhr },
    { enabled: !!employeeOhr, retry: false, refetchOnWindowFocus: false }
  );

  const employeeHistoryQuery = trpc.caCases.employeeCaHistory.useQuery(
    { employeeOhr },
    { enabled: !!employeeOhr, retry: false, refetchOnWindowFocus: false }
  );

  // Mutation
  const createMutation = trpc.caCases.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Case ${data.caseId} created`);
      utils.caCases.list.invalidate();
      setLocation(`/compass/cases/${data.caseId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!employeesQuery.data) return [];
    if (!employeeSearch) return employeesQuery.data.slice(0, 50);
    const q = employeeSearch.toLowerCase();
    return employeesQuery.data
      .filter(
        (e: any) =>
          e.full_name?.toLowerCase().includes(q) ||
          e.ohr_id?.includes(q)
      )
      .slice(0, 50);
  }, [employeesQuery.data, employeeSearch]);

  // Group violations by category
  const violationsByCategory = useMemo(() => {
    if (!violationCatalogQuery.data) return {};
    const grouped: Record<string, any[]> = {};
    for (const v of violationCatalogQuery.data) {
      const cat = v.category_name || "Other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(v);
    }
    return grouped;
  }, [violationCatalogQuery.data]);

  const selectedEmployee = useMemo(() => {
    if (!employeeOhr || !employeesQuery.data) return null;
    return employeesQuery.data.find((e: any) => e.ohr_id === employeeOhr);
  }, [employeeOhr, employeesQuery.data]);

  const selectedViolation = useMemo(() => {
    if (!violationCatalogId || !violationCatalogQuery.data) return null;
    return violationCatalogQuery.data.find(
      (v: any) => String(v.id) === violationCatalogId
    );
  }, [violationCatalogId, violationCatalogQuery.data]);

  const handleSubmit = () => {
    if (!employeeOhr) {
      toast.error("Select an employee");
      return;
    }
    if (!incidentDate) {
      toast.error("Enter incident date");
      return;
    }
    if (!incidentDescription.trim()) {
      toast.error("Enter incident description");
      return;
    }

    createMutation.mutate({
      employeeOhr,
      violationCategoryNumber: violationCatalogId
        ? parseInt(violationCatalogId)
        : undefined,
      violationType: violationType || undefined,
      incidentDate,
      incidentDetails: incidentDescription,
      linkedCoachingIds: linkedCoachingIds
        ? linkedCoachingIds.split(",").map((s) => s.trim())
        : undefined,
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setLocation("/compass/cases")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            New CA Case
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            File a new corrective action case
          </p>
        </div>
      </div>

      {/* Employee Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Employee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or OHR..."
              className="pl-9"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
            />
          </div>

          {!employeeOhr && filteredEmployees.length > 0 && employeeSearch && (
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {filteredEmployees.map((emp: any) => (
                <button
                  key={emp.ohr_id}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex items-center justify-between"
                  onClick={() => {
                    setEmployeeOhr(emp.ohr_id);
                    setEmployeeSearch(emp.full_name);
                  }}
                >
                  <span className="font-medium">{emp.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {emp.ohr_id}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedEmployee && (
            <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {(selectedEmployee as any).full_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedEmployee as any).ohr_id} ·{" "}
                  {(selectedEmployee as any).actual_role} ·{" "}
                  {(selectedEmployee as any).supervisor_name}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEmployeeOhr("");
                  setEmployeeSearch("");
                }}
              >
                Change
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee History (shown when employee selected) */}
      {employeeOhr && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Attendance Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Attendance Violations</CardTitle>
            </CardHeader>
            <CardContent>
              {attendanceSummaryQuery.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : attendanceSummaryQuery.data ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tardiness</span>
                    <span className="font-medium">
                      {attendanceSummaryQuery.data.tardiness ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unauthorized Absence</span>
                    <span className="font-medium">
                      {attendanceSummaryQuery.data.unauthorizedAbsence ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">NCNS</span>
                    <span className="font-medium">
                      {attendanceSummaryQuery.data.ncns ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Violations</span>
                    <span className="font-medium">
                      {attendanceSummaryQuery.data.totalViolations ?? 0}
                    </span>
                  </div>
                  {attendanceSummaryQuery.data.recommendedCapLevel && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs">
                          Recommended:{" "}
                          <strong>
                            {attendanceSummaryQuery.data.recommendedCapLevel.toUpperCase().replace("_", " ")}
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
            </CardContent>
          </Card>

          {/* CA History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">CA History</CardTitle>
            </CardHeader>
            <CardContent>
              {employeeHistoryQuery.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : employeeHistoryQuery.data &&
                employeeHistoryQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {employeeHistoryQuery.data.map((h: any) => (
                    <div
                      key={h.case_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="font-mono text-xs">{h.case_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {h.violation_type || h.violation_category_name || "—"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {h.final_cap_level || h.recommended_cap_level || h.case_status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No prior CA cases
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Violation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Violation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Violation Category (from GPHR Policy)
            </label>
            <Select
              value={violationCatalogId}
              onValueChange={setViolationCatalogId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select violation..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {Object.entries(violationsByCategory).map(
                  ([category, violations]) => (
                    <div key={category}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {category}
                      </div>
                      {(violations as any[]).map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          <span className="text-sm">{v.violation_name}</span>
                          {v.offense_level && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({v.offense_level})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </div>
                  )
                )}
              </SelectContent>
            </Select>
            {selectedViolation && (
              <div className="mt-2 p-2 bg-muted/50 rounded text-xs space-y-1">
                <p>
                  <strong>Penalty Matrix:</strong>{" "}
                  {(selectedViolation as any).first_offense || "—"} →{" "}
                  {(selectedViolation as any).second_offense || "—"} →{" "}
                  {(selectedViolation as any).third_offense || "—"}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Violation Type (free text, if not in catalog)
            </label>
            <Input
              placeholder="e.g., Habitual Tardiness, Policy Violation..."
              value={violationType}
              onChange={(e) => setViolationType(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Incident Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Incident Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Incident Date
            </label>
            <Input
              type="date"
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Incident Description *
            </label>
            <Textarea
              placeholder="Describe the incident in detail..."
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Linked Coaching Log IDs (comma-separated, optional)
            </label>
            <Input
              placeholder="e.g., CL-abc123, CL-def456"
              value={linkedCoachingIds}
              onChange={(e) => setLinkedCoachingIds(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setLocation("/compass/cases")}
        >
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setLocation("/compass/ai")}
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Ask AI Assistant
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !employeeOhr}
          >
            {createMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Create Case
          </Button>
        </div>
      </div>
    </div>
  );
}

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
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, X, Search } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const COACHING_TYPES = [
  { value: "cap_0", label: "CAP 0 (General Coaching)" },
  { value: "follow_up", label: "Follow-Up Session" },
  { value: "group", label: "Group Coaching" },
  { value: "triad", label: "Triad Coaching" },
  { value: "qa_feedback", label: "QA Feedback" },
  { value: "ztp", label: "ZTP Coaching" },
];

export default function CoachingNew() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Form state
  const [coachingType, setCoachingType] = useState("");
  const [coachingDate, setCoachingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [coacheeSearch, setCoacheeSearch] = useState("");
  const [selectedCoachee, setSelectedCoachee] = useState<{
    ohr_id: string;
    full_name: string | null;
  } | null>(null);
  const [sessionGoals, setSessionGoals] = useState<string[]>([""]);
  const [coachingDetails, setCoachingDetails] = useState("");
  const [jobId, setJobId] = useState("");

  // RCA state
  const [rcaLevel1, setRcaLevel1] = useState("");
  const [rcaLevel2, setRcaLevel2] = useState("");
  const [rcaLevel3, setRcaLevel3] = useState("");
  const [rcaLevel4, setRcaLevel4] = useState("");
  const [rcaLevel5, setRcaLevel5] = useState("");
  const [rcaDescription, setRcaDescription] = useState("");

  // ZTP state
  const [infractionCategory, setInfractionCategory] = useState("");
  const [infraction, setInfraction] = useState("");
  const [infractionDescription, setInfractionDescription] = useState("");
  const [severity, setSeverity] = useState("");

  // Group coaching state
  const [groupCoachees, setGroupCoachees] = useState<
    { ohr_id: string; full_name: string | null }[]
  >([]);
  const [groupSearch, setGroupSearch] = useState("");

  // Triad state
  const [smeJoinerName, setSmeJoinerName] = useState("");
  const [smeJoinerEmail, setSmeJoinerEmail] = useState("");

  // Employee search query
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const empSearch = trpc.compass.employeeList.useQuery(
    { search: debouncedSearch, limit: 10 },
    { enabled: debouncedSearch.length >= 2, refetchOnWindowFocus: false }
  );

  // Group employee search
  const [debouncedGroupSearch, setDebouncedGroupSearch] = useState("");
  const groupEmpSearch = trpc.compass.employeeList.useQuery(
    { search: debouncedGroupSearch, limit: 10 },
    { enabled: debouncedGroupSearch.length >= 2, refetchOnWindowFocus: false }
  );

  // RCA catalog
  const rcaCatalog = trpc.compass.rcaCatalog.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // ZTP catalog
  const ztpCatalog = trpc.compass.ztpCatalog.useQuery(undefined, {
    enabled: coachingType === "ztp",
    refetchOnWindowFocus: false,
  });

  // Create mutation
  const createMutation = trpc.compass.coachingCreate.useMutation({
    onSuccess: (data) => {
      toast.success("Coaching log created successfully");
      if (data.coachingId) {
        setLocation(`/compass/coaching/${data.coachingId}`);
      } else {
        setLocation("/compass/coaching");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Debounce search
  const handleCoacheeSearchChange = useCallback(
    (val: string) => {
      setCoacheeSearch(val);
      const timer = setTimeout(() => setDebouncedSearch(val), 300);
      return () => clearTimeout(timer);
    },
    []
  );

  const handleGroupSearchChange = useCallback(
    (val: string) => {
      setGroupSearch(val);
      const timer = setTimeout(() => setDebouncedGroupSearch(val), 300);
      return () => clearTimeout(timer);
    },
    []
  );

  // RCA cascading options
  const rcaL1Options = useMemo(() => {
    if (!rcaCatalog.data) return [];
    return Array.from(new Set(rcaCatalog.data.map((r: any) => r.level_1).filter(Boolean)));
  }, [rcaCatalog.data]);

  const rcaL2Options = useMemo(() => {
    if (!rcaCatalog.data || !rcaLevel1) return [];
    return Array.from(new Set(
        rcaCatalog.data
          .filter((r: any) => r.level_1 === rcaLevel1)
          .map((r: any) => r.level_2)
          .filter(Boolean)
      ));
  }, [rcaCatalog.data, rcaLevel1]);

  const rcaL3Options = useMemo(() => {
    if (!rcaCatalog.data || !rcaLevel2) return [];
    return Array.from(new Set(
        rcaCatalog.data
          .filter((r: any) => r.level_1 === rcaLevel1 && r.level_2 === rcaLevel2)
          .map((r: any) => r.level_3)
          .filter(Boolean)
      ));
  }, [rcaCatalog.data, rcaLevel1, rcaLevel2]);

  const rcaL4Options = useMemo(() => {
    if (!rcaCatalog.data || !rcaLevel3) return [];
    return Array.from(new Set(
        rcaCatalog.data
          .filter(
            (r: any) =>
              r.level_1 === rcaLevel1 &&
              r.level_2 === rcaLevel2 &&
              r.level_3 === rcaLevel3
          )
          .map((r: any) => r.level_4)
          .filter(Boolean)
      ));
  }, [rcaCatalog.data, rcaLevel1, rcaLevel2, rcaLevel3]);

  const rcaL5Options = useMemo(() => {
    if (!rcaCatalog.data || !rcaLevel4) return [];
    return Array.from(new Set(
        rcaCatalog.data
          .filter(
            (r: any) =>
              r.level_1 === rcaLevel1 &&
              r.level_2 === rcaLevel2 &&
              r.level_3 === rcaLevel3 &&
              r.level_4 === rcaLevel4
          )
          .map((r: any) => r.level_5)
          .filter(Boolean)
      ));
  }, [rcaCatalog.data, rcaLevel1, rcaLevel2, rcaLevel3, rcaLevel4]);

  const addGoal = () => setSessionGoals((g) => [...g, ""]);
  const removeGoal = (i: number) =>
    setSessionGoals((g) => g.filter((_, idx) => idx !== i));
  const updateGoal = (i: number, val: string) =>
    setSessionGoals((g) => g.map((v, idx) => (idx === i ? val : v)));

  const handleSubmit = () => {
    if (!coachingType) {
      toast.error("Please select a coaching type");
      return;
    }
    if (!coachingDate) {
      toast.error("Please select a date");
      return;
    }
    const filteredGoals = sessionGoals.filter((g) => g.trim());
    if (filteredGoals.length === 0) {
      toast.error("Please add at least one session goal");
      return;
    }
    if (!coachingDetails.trim()) {
      toast.error("Please enter coaching details");
      return;
    }

    if (coachingType === "group") {
      if (groupCoachees.length === 0) {
        toast.error("Please add at least one coachee for group coaching");
        return;
      }
      createMutation.mutate({
        coachingType: coachingType as any,
        coachingDate,
        sessionGoals: filteredGoals,
        coachingDetails,
        coacheeOhr: groupCoachees[0].ohr_id,
        groupCoacheeOhrs: groupCoachees.map((c) => c.ohr_id),
        coacheeList: groupCoachees.map((c) => c.full_name).join(", "),
        jobId: jobId || undefined,
        rcaLevel1: rcaLevel1 || undefined,
        rcaLevel2: rcaLevel2 || undefined,
        rcaLevel3: rcaLevel3 || undefined,
        rcaLevel4: rcaLevel4 || undefined,
        rcaLevel5: rcaLevel5 || undefined,
        rcaDescription: rcaDescription || undefined,
      });
    } else {
      if (!selectedCoachee) {
        toast.error("Please select a coachee");
        return;
      }
      createMutation.mutate({
        coachingType: coachingType as any,
        coachingDate,
        sessionGoals: filteredGoals,
        coachingDetails,
        coacheeOhr: selectedCoachee.ohr_id,
        jobId: jobId || undefined,
        rcaLevel1: rcaLevel1 || undefined,
        rcaLevel2: rcaLevel2 || undefined,
        rcaLevel3: rcaLevel3 || undefined,
        rcaLevel4: rcaLevel4 || undefined,
        rcaLevel5: rcaLevel5 || undefined,
        rcaDescription: rcaDescription || undefined,
        infractionCategory: infractionCategory || undefined,
        infraction: infraction || undefined,
        infractionDescription: infractionDescription || undefined,
        severity: severity || undefined,
        smeJoinerName: smeJoinerName || undefined,
        smeJoinerEmail: smeJoinerEmail || undefined,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/compass/coaching")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          New Coaching Log
        </h1>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Coaching Type *</label>
              <Select value={coachingType} onValueChange={setCoachingType}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {COACHING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Date *</label>
              <Input
                type="date"
                value={coachingDate}
                onChange={(e) => setCoachingDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Coachee Selection (single) */}
          {coachingType && coachingType !== "group" && (
            <div>
              <label className="text-sm font-medium">Coachee *</label>
              {selectedCoachee ? (
                <div className="flex items-center gap-2 mt-1 p-2 rounded-lg border bg-muted/30">
                  <span className="text-sm font-medium flex-1">
                    {selectedCoachee.full_name} ({selectedCoachee.ohr_id})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCoachee(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or OHR..."
                    value={coacheeSearch}
                    onChange={(e) => handleCoacheeSearchChange(e.target.value)}
                    className="pl-9"
                  />
                  {debouncedSearch.length >= 2 && empSearch.data && (
                    <div className="absolute z-10 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {empSearch.data.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          No employees found
                        </p>
                      ) : (
                        empSearch.data.map((emp: any) => (
                          <button
                            key={emp.ohr_id}
                            className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between"
                            onClick={() => {
                              setSelectedCoachee(emp);
                              setCoacheeSearch("");
                              setDebouncedSearch("");
                            }}
                          >
                            <span>{emp.full_name}</span>
                            <span className="text-muted-foreground">
                              {emp.ohr_id}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Group Coaching — multiple coachees */}
          {coachingType === "group" && (
            <div>
              <label className="text-sm font-medium">
                Coachees * ({groupCoachees.length} selected)
              </label>
              {groupCoachees.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1 mb-2">
                  {groupCoachees.map((c) => (
                    <span
                      key={c.ohr_id}
                      className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-md"
                    >
                      {c.full_name}
                      <button
                        onClick={() =>
                          setGroupCoachees((g) =>
                            g.filter((x) => x.ohr_id !== c.ohr_id)
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search to add coachees..."
                  value={groupSearch}
                  onChange={(e) => handleGroupSearchChange(e.target.value)}
                  className="pl-9"
                />
                {debouncedGroupSearch.length >= 2 && groupEmpSearch.data && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {groupEmpSearch.data
                      .filter(
                        (e: any) =>
                          !groupCoachees.some((g) => g.ohr_id === e.ohr_id)
                      )
                      .map((emp: any) => (
                        <button
                          key={emp.ohr_id}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between"
                          onClick={() => {
                            setGroupCoachees((g) => [...g, emp]);
                            setGroupSearch("");
                            setDebouncedGroupSearch("");
                          }}
                        >
                          <span>{emp.full_name}</span>
                          <span className="text-muted-foreground">
                            {emp.ohr_id}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Triad — SME Joiner */}
          {coachingType === "triad" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">SME Joiner Name</label>
                <Input
                  value={smeJoinerName}
                  onChange={(e) => setSmeJoinerName(e.target.value)}
                  placeholder="SME name"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">SME Joiner Email</label>
                <Input
                  value={smeJoinerEmail}
                  onChange={(e) => setSmeJoinerEmail(e.target.value)}
                  placeholder="SME email"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* QA Feedback — Job ID */}
          {coachingType === "qa_feedback" && (
            <div>
              <label className="text-sm font-medium">Job ID</label>
              <Input
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                placeholder="Enter Job ID"
                className="mt-1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Goals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session Goals *</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessionGoals.map((goal, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={goal}
                onChange={(e) => updateGoal(i, e.target.value)}
                placeholder={`Goal ${i + 1}`}
              />
              {sessionGoals.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeGoal(i)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addGoal}>
            <Plus className="h-4 w-4 mr-1" />
            Add Goal
          </Button>
        </CardContent>
      </Card>

      {/* Coaching Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coaching Details *</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={coachingDetails}
            onChange={(e) => setCoachingDetails(e.target.value)}
            placeholder="Describe the coaching session in detail..."
            rows={6}
          />
        </CardContent>
      </Card>

      {/* RCA Section (for non-ZTP types) */}
      {coachingType && coachingType !== "ztp" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Root Cause Analysis (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rcaL1Options.length > 0 && (
              <div>
                <label className="text-sm font-medium">Level 1</label>
                <Select value={rcaLevel1} onValueChange={(v) => { setRcaLevel1(v); setRcaLevel2(""); setRcaLevel3(""); setRcaLevel4(""); setRcaLevel5(""); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Level 1" />
                  </SelectTrigger>
                  <SelectContent>
                    {rcaL1Options.map((o: any) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {rcaL2Options.length > 0 && (
              <div>
                <label className="text-sm font-medium">Level 2</label>
                <Select value={rcaLevel2} onValueChange={(v) => { setRcaLevel2(v); setRcaLevel3(""); setRcaLevel4(""); setRcaLevel5(""); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Level 2" />
                  </SelectTrigger>
                  <SelectContent>
                    {rcaL2Options.map((o: any) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {rcaL3Options.length > 0 && (
              <div>
                <label className="text-sm font-medium">Level 3</label>
                <Select value={rcaLevel3} onValueChange={(v) => { setRcaLevel3(v); setRcaLevel4(""); setRcaLevel5(""); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Level 3" />
                  </SelectTrigger>
                  <SelectContent>
                    {rcaL3Options.map((o: any) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {rcaL4Options.length > 0 && (
              <div>
                <label className="text-sm font-medium">Level 4</label>
                <Select value={rcaLevel4} onValueChange={(v) => { setRcaLevel4(v); setRcaLevel5(""); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Level 4" />
                  </SelectTrigger>
                  <SelectContent>
                    {rcaL4Options.map((o: any) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {rcaL5Options.length > 0 && (
              <div>
                <label className="text-sm font-medium">Level 5</label>
                <Select value={rcaLevel5} onValueChange={setRcaLevel5}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Level 5" />
                  </SelectTrigger>
                  <SelectContent>
                    {rcaL5Options.map((o: any) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">RCA Description</label>
              <Textarea
                value={rcaDescription}
                onChange={(e) => setRcaDescription(e.target.value)}
                placeholder="Describe the root cause..."
                rows={3}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ZTP Infraction Section */}
      {coachingType === "ztp" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ZTP Infraction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={infractionCategory} onValueChange={(v) => { setInfractionCategory(v); setInfraction(""); }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {ztpCatalog.data
                    ? Array.from(new Set(
                          ztpCatalog.data.map((z: any) => z.category).filter(Boolean)
                        )).map((c: any) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))
                    : null}
                </SelectContent>
              </Select>
            </div>
            {infractionCategory && (
              <div>
                <label className="text-sm font-medium">Infraction</label>
                <Select value={infraction} onValueChange={setInfraction}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select infraction" />
                  </SelectTrigger>
                  <SelectContent>
                    {ztpCatalog.data
                      ?.filter((z: any) => z.category === infractionCategory)
                      .map((z: any) => (
                        <SelectItem key={z.infraction} value={z.infraction}>
                          {z.infraction}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={infractionDescription}
                onChange={(e) => setInfractionDescription(e.target.value)}
                placeholder="Describe the infraction..."
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Severity</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3 pb-8">
        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          size="lg"
        >
          {createMutation.isPending ? "Creating..." : "Create Coaching Log"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => setLocation("/compass/coaching")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

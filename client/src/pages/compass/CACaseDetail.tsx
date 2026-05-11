import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

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

// Valid transitions for each status
const TRANSITIONS: Record<string, { label: string; target: string; variant?: string }[]> = {
  incident_reported: [
    { label: "Issue NTE", target: "nte_issued" },
    { label: "Dismiss Case", target: "case_dismissed", variant: "outline" },
  ],
  nte_issued: [
    { label: "Mark Awaiting Response", target: "awaiting_response" },
  ],
  awaiting_response: [
    { label: "Response Received", target: "response_received" },
    { label: "Response Waived (5-day expired)", target: "response_waived" },
  ],
  response_received: [
    { label: "Schedule Hearing", target: "hearing_scheduled" },
    { label: "Issue NOD (Skip Hearing)", target: "nod_issued" },
    { label: "Dismiss Case", target: "case_dismissed", variant: "outline" },
  ],
  response_waived: [
    { label: "Schedule Hearing", target: "hearing_scheduled" },
    { label: "Issue NOD (Skip Hearing)", target: "nod_issued" },
  ],
  hearing_scheduled: [
    { label: "Hearing Conducted", target: "hearing_conducted" },
  ],
  hearing_conducted: [
    { label: "Issue NOD", target: "nod_issued" },
    { label: "Dismiss Case", target: "case_dismissed", variant: "outline" },
  ],
  nod_issued: [
    { label: "Issue CAP", target: "cap_issued" },
  ],
  cap_issued: [
    { label: "Start Active Period", target: "active_period" },
  ],
  active_period: [
    { label: "Close Case (Period Complete)", target: "case_closed" },
  ],
};

export default function CACaseDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [transitionDialog, setTransitionDialog] = useState<{
    target: string;
    label: string;
  } | null>(null);
  const [transitionNotes, setTransitionNotes] = useState("");
  const [capLevel, setCapLevel] = useState("");
  const [docType, setDocType] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const caseQuery = trpc.caCases.get.useQuery(
    { caseId: params.id || "" },
    { enabled: !!params.id, retry: false, refetchOnWindowFocus: false }
  );

  const timelineQuery = trpc.caCases.get.useQuery(
    { caseId: params.id || "" },
    { enabled: !!params.id, retry: false, refetchOnWindowFocus: false }
  );

  const transitionMutation = trpc.caCases.transition.useMutation({
    onSuccess: () => {
      toast.success("Case status updated");
      utils.caCases.get.invalidate({ caseId: params.id });
      utils.caCases.list.invalidate();
      setTransitionDialog(null);
      setTransitionNotes("");
      setCapLevel("");
    },
    onError: (err) => toast.error(err.message),
  });

  const generateDocMutation = trpc.caCases.generateDocument.useMutation({
    onSuccess: (data) => {
      // Download the generated document
      window.open(data.documentUrl, "_blank");
      toast.success("Document generated — downloading");
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadSignedMutation = trpc.caCases.uploadSignedDocument.useMutation({
    onSuccess: () => {
      toast.success("Signed document uploaded");
      utils.caCases.get.invalidate({ caseId: params.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const c = caseQuery.data;

  if (caseQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <XCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Case not found</p>
        <Button variant="outline" onClick={() => setLocation("/compass/cases")}>
          Back to Cases
        </Button>
      </div>
    );
  }

  const transitions = TRANSITIONS[c.case_status] || [];
  const timeline = c.timeline || [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      // Upload file via the upload endpoint
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/io/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();

      await uploadSignedMutation.mutateAsync({
        caseId: c.case_id,
        signedDocumentUrl: url,
        documentType: (docType === "signed_nte" || docType === "signed_cap" ? (docType === "signed_nte" ? "nte" : "cap") : "nte") as "nte" | "cap",
      });
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingDoc(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
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
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              {c.case_id}
            </h1>
            <Badge
              variant="secondary"
              className={`text-[11px] ${STATUS_COLORS[c.case_status] || ""}`}
            >
              {STATUS_LABELS[c.case_status] || c.case_status}
            </Badge>
            {(c.final_cap_level || c.recommended_cap_level) && (
              <Badge variant="outline" className="text-xs">
                {CAP_LABELS[c.final_cap_level || c.recommended_cap_level || ""] ||
                  c.final_cap_level ||
                  c.recommended_cap_level}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Filed {c.created_at ? new Date(parseInt(c.created_at)).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Case Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Case Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Employee</p>
                  <p className="text-sm font-medium">{c.employee_name}</p>
                  <p className="text-xs text-muted-foreground">{c.employee_ohr}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Filed By</p>
                  <p className="text-sm font-medium">{c.created_by_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Violation Category</p>
                  <p className="text-sm">{c.violation_category_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Violation Type</p>
                  <p className="text-sm">{c.violation_type || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Incident Date</p>
                  <p className="text-sm">{c.incident_date || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Incident Description</p>
                  <p className="text-sm">{(c as any).incident_description || "—"}</p>
                </div>
              </div>

              {(c as any).employee_response && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Employee Response</p>
                  <p className="text-sm whitespace-pre-wrap">{(c as any).employee_response}</p>
                </div>
              )}

              {(c as any).hearing_notes && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Hearing Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{(c as any).hearing_notes}</p>
                </div>
              )}

              {(c as any).nod_summary && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Notice of Decision</p>
                  <p className="text-sm whitespace-pre-wrap">{(c as any).nod_summary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No timeline events yet
                </p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((event: any, i: number) => (
                    <div key={event.id || i} className="flex gap-3 pb-4 last:pb-0">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                        {i < timeline.length - 1 && (
                          <div className="w-px flex-1 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {STATUS_LABELS[event.new_status] || event.new_status}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {event.created_at
                              ? new Date(parseInt(event.created_at)).toLocaleString()
                              : ""}
                          </span>
                        </div>
                        {event.notes && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {event.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          by {event.performed_by_name || "System"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          {transitions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {transitions.map((t) => (
                  <Button
                    key={t.target}
                    variant={t.variant === "outline" ? "outline" : "default"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setTransitionDialog(t);
                      setTransitionNotes("");
                      setCapLevel("");
                    }}
                  >
                    {t.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Document Generation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                disabled={generateDocMutation.isPending}
                onClick={() =>
                  generateDocMutation.mutate({
                    caseId: c.case_id,
                    documentType: "nte",
                  })
                }
              >
                {generateDocMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5 mr-2" />
                )}
                Generate NTE
              </Button>

              {(c.final_cap_level || c.recommended_cap_level) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  disabled={generateDocMutation.isPending}
                  onClick={() =>
                    generateDocMutation.mutate({
                      caseId: c.case_id,
                      documentType: (c.final_cap_level || c.recommended_cap_level || "cap_0") as any,
                    })
                  }
                >
                  {generateDocMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 mr-2" />
                  )}
                  Generate CAP Document
                </Button>
              )}

              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">
                  Upload Signed Document
                </p>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="h-8 text-xs mb-2">
                    <SelectValue placeholder="Document type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="signed_nte">Signed NTE</SelectItem>
                    <SelectItem value="signed_cap">Signed CAP</SelectItem>
                    <SelectItem value="explanation_letter">Explanation Letter</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <label className="cursor-pointer">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={!docType || uploadingDoc}
                    asChild
                  >
                    <span>
                      {uploadingDoc ? (
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-2" />
                      )}
                      {uploadingDoc ? "Uploading..." : "Choose File"}
                    </span>
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    disabled={!docType || uploadingDoc}
                  />
                </label>
              </div>

              {/* Existing documents */}
              {c.nte_document_url && (
                <a
                  href={c.nte_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline pt-1"
                >
                  <Download className="h-3 w-3" />
                  NTE Document
                </a>
              )}
              {(c as any).signed_nte_url && (
                <a
                  href={(c as any).signed_nte_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Signed NTE
                </a>
              )}
              {c.cap_document_url && (
                <a
                  href={c.cap_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <Download className="h-3 w-3" />
                  CAP Document
                </a>
              )}
              {(c as any).signed_cap_url && (
                <a
                  href={(c as any).signed_cap_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Signed CAP
                </a>
              )}
            </CardContent>
          </Card>

          {/* Active Period Info */}
          {c.case_status === "active_period" && c.active_period_start && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Active Period</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Start</span>
                  <span>{c.active_period_start}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">End</span>
                  <span>{c.active_period_end || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{c.active_period_days || "—"} days</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Linked Coaching Logs */}
          {c.linked_coaching_ids && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Linked Coaching</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() =>
                    setLocation(`/compass/coaching/${c.linked_coaching_ids}`)
                  }
                >
                  View Coaching Log → {c.linked_coaching_ids}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Transition Dialog */}
      <Dialog
        open={!!transitionDialog}
        onOpenChange={(open) => !open && setTransitionDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transitionDialog?.label}</DialogTitle>
            <DialogDescription>
              Transition case {c.case_id} to{" "}
              {STATUS_LABELS[transitionDialog?.target || ""] || transitionDialog?.target}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* CAP level selection for NOD/CAP transitions */}
            {(transitionDialog?.target === "nod_issued" ||
              transitionDialog?.target === "cap_issued") && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  CAP Level
                </label>
                <Select value={capLevel} onValueChange={setCapLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select CAP level..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cap_0">CAP 0 (Coaching & Counseling)</SelectItem>
                    <SelectItem value="cap_1">CAP 1 (Written Warning)</SelectItem>
                    <SelectItem value="cap_2">CAP 2 (Final Written Warning)</SelectItem>
                    <SelectItem value="cap_3">CAP 3 (Suspension / Termination)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Notes (optional)
              </label>
              <Textarea
                placeholder="Add notes for this transition..."
                value={transitionNotes}
                onChange={(e) => setTransitionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransitionDialog(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!transitionDialog) return;
                transitionMutation.mutate({
                  caseId: c.case_id,
                  targetStatus: transitionDialog.target,
                  notes: transitionNotes || undefined,
                  finalCapLevel: capLevel || undefined,
                });
              }}
              disabled={transitionMutation.isPending}
            >
              {transitionMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

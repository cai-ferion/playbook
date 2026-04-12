import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Star,
  MessageSquare,
  FileText,
  User,
  Briefcase,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

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
  "Markdown Retained - Trainer": "bg-rose-100 text-rose-800 border-rose-200",
  "Trainer Decision Rejected": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
};

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "-";
  const num = Number(ts);
  if (!isNaN(num) && num > 1e12) {
    return new Date(num).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%] truncate">
        {value ?? "-"}
      </span>
    </div>
  );
}

export default function CoachingDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const emp = trpc.compass.currentEmployee.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const detail = trpc.compass.coachingGet.useQuery(
    { coachingId: params.id ?? "" },
    { enabled: !!params.id, refetchOnWindowFocus: false }
  );
  const utils = trpc.useUtils();

  // Dispute transition
  const disputeMutation = trpc.compass.disputeTransition.useMutation({
    onSuccess: (data) => {
      toast.success(`Dispute action completed: ${data.action}`);
      utils.compass.coachingGet.invalidate({ coachingId: params.id });
    },
    onError: (err) => toast.error(err.message),
  });

  // Acknowledgement
  const ackMutation = trpc.compass.coachingAcknowledge.useMutation({
    onSuccess: () => {
      toast.success("Coaching log acknowledged successfully");
      utils.compass.coachingGet.invalidate({ coachingId: params.id });
    },
    onError: (err) => toast.error(err.message),
  });

  // Dispute form state
  const [disputeComments, setDisputeComments] = useState("");
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    action: string;
    label: string;
  } | null>(null);

  // Ack form state
  const [ackCommitments, setAckCommitments] = useState("");
  const [ackRating, setAckRating] = useState(0);
  const [ackSentiments, setAckSentiments] = useState("");
  const [ackDialogOpen, setAckDialogOpen] = useState(false);

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setLocation("/compass/coaching")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-16">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive font-medium">{detail.error.message}</p>
        </div>
      </div>
    );
  }

  const log = detail.data?.log;
  const events = detail.data?.disputeEvents ?? [];
  if (!log) return null;

  const isCoachee = emp.data?.ohr_id === log.coachee_ohr;
  const canAck = isCoachee && log.status === "Pending Acknowledgement";

  // Parse session goals
  let goals: string[] = [];
  try {
    goals = JSON.parse(log.session_goals ?? "[]");
  } catch {
    goals = log.session_goals ? [log.session_goals] : [];
  }

  // Determine available dispute actions
  const getDisputeActions = () => {
    if (log.coaching_type !== "qa_feedback") return [];
    const role = emp.data?.actual_role ?? "";
    const status = log.status ?? "";

    const actionMap: Record<string, { requiredRoles: string[]; actions: { action: string; label: string; variant: "default" | "destructive" | "outline" }[] }> = {
      "Pending SME Review": {
        requiredRoles: ["Operational SME"],
        actions: [
          { action: "accept_markdown", label: "Accept Markdown", variant: "default" },
          { action: "dispute_markdown", label: "Dispute Markdown", variant: "destructive" },
        ],
      },
      "Markdown Disputed": {
        requiredRoles: ["Quality & Policy Expert"],
        actions: [
          { action: "reverse_markdown", label: "Reverse Markdown", variant: "default" },
          { action: "retain_markdown", label: "Retain Markdown", variant: "destructive" },
        ],
      },
      "Markdown Retained - QA": {
        requiredRoles: ["Operational SME"],
        actions: [
          { action: "accept_decision", label: "Accept Decision", variant: "default" },
          { action: "reject_decision", label: "Reject Decision", variant: "destructive" },
        ],
      },
      "QA Decision Rejected": {
        requiredRoles: ["Trainer"],
        actions: [
          { action: "reverse_markdown", label: "Reverse Markdown", variant: "default" },
          { action: "retain_markdown", label: "Retain Markdown", variant: "destructive" },
        ],
      },
      "Markdown Retained - Trainer": {
        requiredRoles: ["Operational SME"],
        actions: [
          { action: "accept_decision", label: "Accept Decision", variant: "default" },
          { action: "reject_decision", label: "Reject Decision", variant: "destructive" },
        ],
      },
      "Trainer Decision Rejected": {
        requiredRoles: ["Manager"],
        actions: [
          { action: "reverse_markdown", label: "Reverse Markdown", variant: "default" },
          { action: "retain_markdown", label: "Retain Markdown", variant: "destructive" },
        ],
      },
    };

    const config = actionMap[status];
    if (!config) return [];
    const isAdmin = emp.data?.isAdmin;
    if (!isAdmin && !config.requiredRoles.includes(role)) return [];
    return config.actions;
  };

  const disputeActions = getDisputeActions();

  const handleDisputeAction = (action: string, label: string) => {
    const needsComments = ["dispute_markdown", "retain_markdown", "reject_decision"].includes(action);
    if (needsComments) {
      setPendingAction({ action, label });
      setDisputeComments("");
      setDisputeDialogOpen(true);
    } else {
      disputeMutation.mutate({
        coachingId: log.coaching_id,
        action,
      });
    }
  };

  const submitDisputeWithComments = () => {
    if (!pendingAction) return;
    disputeMutation.mutate({
      coachingId: log.coaching_id,
      action: pendingAction.action,
      comments: disputeComments,
    });
    setDisputeDialogOpen(false);
  };

  const submitAck = () => {
    if (!ackCommitments.trim() || ackRating === 0 || !ackSentiments.trim()) {
      toast.error("Please fill in all acknowledgement fields");
      return;
    }
    ackMutation.mutate({
      coachingId: log.coaching_id,
      commitments: ackCommitments,
      rating: ackRating,
      sentiments: ackSentiments,
    });
    setAckDialogOpen(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/compass/coaching")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight font-mono">
              {log.coaching_id}
            </h1>
            <Badge variant="outline" className={STATUS_COLORS[log.status ?? ""] ?? ""}>
              {log.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {COACHING_TYPE_LABELS[log.coaching_type] ?? log.coaching_type} — {formatTimestamp(log.coaching_date)}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      {(disputeActions.length > 0 || canAck) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Actions:</span>
              {disputeActions.map((da) => (
                <Button
                  key={da.action}
                  variant={da.variant === "destructive" ? "destructive" : "default"}
                  size="sm"
                  disabled={disputeMutation.isPending}
                  onClick={() => handleDisputeAction(da.action, da.label)}
                >
                  {da.label}
                </Button>
              ))}
              {canAck && (
                <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Acknowledge
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Acknowledge Coaching Log</DialogTitle>
                      <DialogDescription>
                        Please provide your commitments, rating, and feedback.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div>
                        <label className="text-sm font-medium">Commitments *</label>
                        <Textarea
                          value={ackCommitments}
                          onChange={(e) => setAckCommitments(e.target.value)}
                          placeholder="What do you commit to improving?"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Rating *</label>
                        <div className="flex gap-1 mt-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => setAckRating(n)}
                              className="p-1"
                            >
                              <Star
                                className={`h-6 w-6 ${
                                  n <= ackRating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Sentiments *</label>
                        <Textarea
                          value={ackSentiments}
                          onChange={(e) => setAckSentiments(e.target.value)}
                          placeholder="How do you feel about this coaching session?"
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={submitAck}
                        disabled={ackMutation.isPending}
                      >
                        Submit Acknowledgement
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coachee Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              Coachee
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="Name" value={log.coachee_name} />
            <InfoRow label="OHR" value={log.coachee_ohr} />
            <InfoRow label="Planning Group" value={log.coachee_pg} />
            <InfoRow label="Supervisor" value={log.coachee_supervisor} />
          </CardContent>
        </Card>

        {/* Coach Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Coach
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="Name" value={log.coach_name} />
            <InfoRow label="OHR" value={log.coach_ohr} />
            <InfoRow label="Planning Group" value={log.coach_pg} />
            <InfoRow label="Supervisor" value={log.coach_supervisor} />
          </CardContent>
        </Card>
      </div>

      {/* Coaching Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Coaching Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {goals.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Session Goals</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
                {goals.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-sm font-medium mb-1">Details</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {log.coaching_details ?? "-"}
            </p>
          </div>
          {log.rca_level_1 && (
            <div>
              <p className="text-sm font-medium mb-1">Root Cause Analysis</p>
              <div className="text-sm text-muted-foreground space-y-0.5">
                {log.rca_level_1 && <p>L1: {log.rca_level_1}</p>}
                {log.rca_level_2 && <p>L2: {log.rca_level_2}</p>}
                {log.rca_level_3 && <p>L3: {log.rca_level_3}</p>}
                {log.rca_level_4 && <p>L4: {log.rca_level_4}</p>}
                {log.rca_level_5 && <p>L5: {log.rca_level_5}</p>}
                {log.rca_description && <p className="mt-1">{log.rca_description}</p>}
              </div>
            </div>
          )}
          {log.infraction && (
            <div>
              <p className="text-sm font-medium mb-1">Infraction</p>
              <p className="text-sm text-muted-foreground">
                {log.infraction_category} — {log.infraction}
                {log.severity && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {log.severity}
                  </Badge>
                )}
              </p>
              {log.infraction_description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {log.infraction_description}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acknowledgement Section */}
      {log.coachee_ack && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Acknowledgement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Acknowledged" value={formatTimestamp(log.ack_date)} />
            <div>
              <p className="text-sm font-medium mb-1">Commitments</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {log.coachee_commitments ?? "-"}
              </p>
            </div>
            {log.coaching_rating !== null && (
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium mr-2">Rating:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-4 w-4 ${
                      n <= (log.coaching_rating ?? 0)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  />
                ))}
              </div>
            )}
            {log.coachee_sentiments && (
              <div>
                <p className="text-sm font-medium mb-1">Sentiments</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {log.coachee_sentiments}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dispute Trail */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Dispute Trail ({events.length} events)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {events.map((evt: any, i: number) => (
                <div key={evt.id ?? i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {evt.dispute_level}
                    </div>
                    {i < events.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {evt.actor_name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {evt.actor_role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(evt.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Action: <span className="font-medium">{evt.action.replace(/_/g, " ")}</span>
                    </p>
                    {evt.comments && (
                      <p className="text-sm mt-1 bg-muted/50 rounded px-3 py-2">
                        {evt.comments}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dispute Comments Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction?.label}</DialogTitle>
            <DialogDescription>
              Please provide comments for this action.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={disputeComments}
            onChange={(e) => setDisputeComments(e.target.value)}
            placeholder="Enter your comments..."
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisputeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitDisputeWithComments}
              disabled={
                !disputeComments.trim() || disputeMutation.isPending
              }
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

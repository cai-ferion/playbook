import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useLocation } from "wouter";

export default function CompassDashboard() {
  const stats = trpc.compass.analyticsSummary.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const emp = trpc.compass.currentEmployee.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [, setLocation] = useLocation();

  const cards = [
    {
      title: "Total Coaching Logs",
      value: stats.data?.totalLogs ?? 0,
      icon: BookOpen,
      color: "text-blue-600",
      bg: "bg-blue-50",
      path: "/compass/coaching",
    },
    {
      title: "QA Feedback Logs",
      value: stats.data?.qaFeedbackLogs ?? 0,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      path: "/compass/coaching?type=qa_feedback",
    },
    {
      title: "Active Disputes",
      value: stats.data?.activeDisputes ?? 0,
      icon: Clock,
      color: "text-orange-600",
      bg: "bg-orange-50",
      path: "/compass/disputes",
    },
    {
      title: "Acknowledged",
      value: stats.data?.acknowledged ?? 0,
      icon: CheckCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      path: "/compass/coaching?status=Acknowledged",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {emp.data
            ? `Welcome, ${emp.data.full_name} — ${emp.data.actual_role}`
            : "Loading your profile..."}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card
            key={card.title}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation(card.path)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`h-8 w-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {stats.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Visibility Scope</CardTitle>
          </CardHeader>
          <CardContent>
            {emp.isLoading ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium">{emp.data?.actual_role ?? "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Planning Group</span>
                  <span className="font-medium">{emp.data?.planning_group ?? "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scope</span>
                  <span className="font-medium capitalize">
                    {emp.data?.scope === "all"
                      ? "All Records"
                      : emp.data?.scope === "team"
                      ? "Team Records"
                      : emp.data?.scope === "self_filed"
                      ? "Own Filings"
                      : emp.data?.scope === "self_only"
                      ? "Own Records"
                      : "-"}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {emp.data?.scope !== "self_only" && (
                <button
                  onClick={() => setLocation("/compass/coaching/new")}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4 text-primary" />
                  Create New Coaching Log
                </button>
              )}
              <button
                onClick={() => setLocation("/compass/coaching")}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm flex items-center gap-2"
              >
                <Clock className="h-4 w-4 text-muted-foreground" />
                View All Coaching Logs
              </button>
              <button
                onClick={() => setLocation("/compass/disputes")}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm flex items-center gap-2"
              >
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                View QA Dispute Board
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

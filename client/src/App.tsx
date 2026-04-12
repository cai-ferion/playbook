import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { lazy, Suspense } from "react";

// Compass pages (lazy-loaded)
const CompassLayout = lazy(() => import("./components/CompassLayout"));
const CompassDashboard = lazy(() => import("./pages/compass/Dashboard"));
const CoachingList = lazy(() => import("./pages/compass/CoachingList"));
const CoachingDetail = lazy(() => import("./pages/compass/CoachingDetail"));
const CoachingNew = lazy(() => import("./pages/compass/CoachingNew"));
const DisputeBoard = lazy(() => import("./pages/compass/DisputeBoard"));
const CACaseList = lazy(() => import("./pages/compass/CACaseList"));
const CACaseDetail = lazy(() => import("./pages/compass/CACaseDetail"));
const CACaseNew = lazy(() => import("./pages/compass/CACaseNew"));
const AIAssistant = lazy(() => import("./pages/compass/AIAssistant"));

function CompassShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <CompassLayout>{children}</CompassLayout>
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />

      {/* Compass Module */}
      <Route path="/compass">
        <CompassShell>
          <CompassDashboard />
        </CompassShell>
      </Route>
      <Route path="/compass/coaching">
        <CompassShell>
          <CoachingList />
        </CompassShell>
      </Route>
      <Route path="/compass/coaching/new">
        <CompassShell>
          <CoachingNew />
        </CompassShell>
      </Route>
      <Route path="/compass/coaching/:id">
        <CompassShell>
          <CoachingDetail />
        </CompassShell>
      </Route>
      <Route path="/compass/disputes">
        <CompassShell>
          <DisputeBoard />
        </CompassShell>
      </Route>
      <Route path="/compass/cases">
        <CompassShell>
          <CACaseList />
        </CompassShell>
      </Route>
      <Route path="/compass/cases/new">
        <CompassShell>
          <CACaseNew />
        </CompassShell>
      </Route>
      <Route path="/compass/cases/:id">
        <CompassShell>
          <CACaseDetail />
        </CompassShell>
      </Route>
      <Route path="/compass/ai">
        <CompassShell>
          <AIAssistant />
        </CompassShell>
      </Route>

      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

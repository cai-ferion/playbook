import { useEffect } from "react";

/**
 * Home page redirects to the Playbook desktop site served at /api/site/
 * The actual workforce management UI is a static HTML/CSS/JS application.
 */
export default function Home() {
  useEffect(() => {
    window.location.href = "/api/site/";
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-current border-t-transparent rounded-full mb-4" />
        <p className="text-lg">Redirecting to Playbook...</p>
      </div>
    </div>
  );
}

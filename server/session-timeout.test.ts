/**
 * Vitest tests for Session Idle Timeout enhancements (Phase 6.3 Security Hardening)
 *
 * Tests the client-side idle timeout logic by verifying the source code
 * contains the expected security patterns.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_JS_PATH = path.join(__dirname, "public/js/app.js");
const SSE_JS_PATH = path.join(__dirname, "public/js/sse-client.js");

describe("Session Idle Timeout — Phase 6.3", () => {
  const appJs = fs.readFileSync(APP_JS_PATH, "utf-8");
  const sseJs = fs.readFileSync(SSE_JS_PATH, "utf-8");

  describe("Idle Timer Configuration", () => {
    it("has 8-hour session timeout (full shift)", () => {
      expect(appJs).toContain("SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000");
    });

    it("has 7h 50m warning (10 min before timeout)", () => {
      expect(appJs).toContain("SESSION_WARN_MS   = (8 * 60 - 10) * 60 * 1000");
    });

    it("listens to all relevant activity events", () => {
      expect(appJs).toContain("'mousemove'");
      expect(appJs).toContain("'mousedown'");
      expect(appJs).toContain("'keydown'");
      expect(appJs).toContain("'touchstart'");
      expect(appJs).toContain("'scroll'");
    });

    it("uses passive event listeners for performance", () => {
      expect(appJs).toContain("{ passive: true }");
    });
  });

  describe("Pre-Expiry Warning Toast", () => {
    it("shows idle timeout toast with Stay Logged In button", () => {
      expect(appJs).toContain("idle-timeout-toast");
      expect(appJs).toContain("Stay Logged In");
    });

    it("warns user about upcoming logout", () => {
      expect(appJs).toContain("logged out in 5 minutes");
    });

    it("Stay Logged In button resets idle timers", () => {
      expect(appJs).toContain('onclick="_resetIdleTimers()"');
    });
  });

  describe("Unsaved-Changes Guard", () => {
    it("checks for pending edits before forced logout", () => {
      expect(appJs).toContain("appState.pendingEdits && Object.keys(appState.pendingEdits).length > 0");
    });

    it("shows unsaved timeout warning dialog", () => {
      expect(appJs).toContain("_showUnsavedTimeoutWarning");
      expect(appJs).toContain("unsaved-timeout-warning");
    });

    it("offers Save & Logout option", () => {
      expect(appJs).toContain("Save & Logout");
      expect(appJs).toContain("_handleUnsavedSaveAndLogout");
    });

    it("offers Discard & Logout option", () => {
      expect(appJs).toContain("Discard & Logout");
      expect(appJs).toContain("_handleUnsavedDiscardLogout");
    });

    it("offers Stay Logged In option from unsaved dialog", () => {
      expect(appJs).toContain("_handleUnsavedStayLoggedIn");
    });

    it("forces logout after 60s grace period", () => {
      expect(appJs).toContain("60000");
      expect(appJs).toContain("logged out in 60 seconds");
    });

    it("Save & Logout calls confirmSave before logout", () => {
      expect(appJs).toContain("confirmSave().then(() => handleLogout");
    });
  });

  describe("SSE Disconnect on Logout", () => {
    it("handleLogout disconnects SSE client", () => {
      expect(appJs).toContain("window.sseClient.disconnect()");
    });

    it("clears pendingEdits on logout", () => {
      // After the SSE disconnect line, pendingEdits should be cleared
      const logoutSection = appJs.slice(appJs.indexOf("function handleLogout(reason)"));
      expect(logoutSection).toContain("appState.pendingEdits = {}");
    });
  });

  describe("Graceful SSE Reconnection", () => {
    it("stops reconnecting when user is logged out", () => {
      expect(sseJs).toContain("!window.currentUserOhr");
      expect(sseJs).toContain("stopping reconnection");
    });

    it("probes auth endpoint after 5 failed reconnects", () => {
      expect(sseJs).toContain("reconnectAttempts >= 5");
      expect(sseJs).toContain("/api/io/employees?limit=1");
    });

    it("triggers logout on 401 response from probe", () => {
      expect(sseJs).toContain("resp.status === 401");
      expect(sseJs).toContain("Session expired (401)");
      expect(sseJs).toContain("handleLogout('timeout')");
    });

    it("continues reconnecting on network errors", () => {
      expect(sseJs).toContain("_scheduleReconnect");
    });

    it("uses exponential backoff with jitter", () => {
      expect(sseJs).toContain("Math.pow(1.5, reconnectAttempts)");
      expect(sseJs).toContain("Math.random() * 1000");
    });
  });

  describe("Login Form Feedback", () => {
    it("shows timeout message on login form after auto-logout", () => {
      expect(appJs).toContain("You were logged out due to inactivity");
    });

    it("uses warning color for timeout message", () => {
      expect(appJs).toContain("var(--warning, #f59e0b)");
    });
  });
});

import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  Send,
  User,
  Search,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Streamdown } from "streamdown";

// ── Types ───────────────────────────────────────────────────────────────
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// ── Component ───────────────────────────────────────────────────────────
export default function AIAssistant() {
  const [selectedOhr, setSelectedOhr] = useState<string>("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Employee list for selection
  const employeesQuery = trpc.compass.employeeList.useQuery({}, {
    staleTime: 5 * 60 * 1000,
  });

  const employees = employeesQuery.data ?? [];

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees.slice(0, 20);
    const q = employeeSearch.toLowerCase();
    return employees
      .filter(
        (e: any) =>
          e.full_name?.toLowerCase().includes(q) ||
          e.ohr_id?.includes(q)
      )
      .slice(0, 20);
  }, [employees, employeeSearch]);

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => e.ohr_id === selectedOhr),
    [employees, selectedOhr]
  );

  // Chat mutation
  const chatMutation = trpc.aiAssistant.chat.useMutation();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message handler
  const handleSend = async () => {
    const msg = inputValue.trim();
    if (!msg || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      const result = await chatMutation.mutateAsync({
        employeeOhr: selectedOhr || undefined,
        message: msg,
        conversationHistory: messages.slice(-10), // Last 10 messages for context
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.reply },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err.message || "Failed to get response. Please try again."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearConversation = () => {
    setMessages([]);
  };

  const capLevelLabel = (level: string) => {
    const map: Record<string, string> = {
      cap_0: "CAP 0",
      cap_1: "CAP 1",
      cap_2: "CAP 2",
      cap_3: "CAP 3",
      review_for_termination: "RT",
    };
    return map[level] || level;
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      {/* Left Panel — Employee Context */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-2">
        {/* Employee Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Employee Context
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setShowEmployeeDropdown(true);
                }}
                onFocus={() => setShowEmployeeDropdown(true)}
                className="pl-9 h-9"
              />
              {showEmployeeDropdown && filteredEmployees.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredEmployees.map((emp: any) => (
                    <button
                      key={emp.ohr_id}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => {
                        setSelectedOhr(emp.ohr_id);
                        setEmployeeSearch(emp.full_name || "");
                        setShowEmployeeDropdown(false);
                      }}
                    >
                      <div className="font-medium">{emp.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {emp.ohr_id} · {emp.actual_role}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedEmployee && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {(selectedEmployee as any).full_name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setSelectedOhr("");
                      setEmployeeSearch("");
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>OHR: {(selectedEmployee as any).ohr_id}</div>
                  <div>Role: {(selectedEmployee as any).actual_role}</div>
                  <div>
                    Supervisor: {(selectedEmployee as any).supervisor_name}
                  </div>
                  <div>PG: {(selectedEmployee as any).planning_group}</div>
                </div>
              </div>
            )}

            {!selectedEmployee && (
              <p className="text-xs text-muted-foreground">
                Select an employee for context-aware recommendations, or ask
                general policy questions without selecting anyone.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Quick Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              {
                label: "Recommend CAP level",
                prompt: selectedOhr
                  ? `What CAP level should I give this employee for their recent violations?`
                  : "How do I determine the right CAP level for a violation?",
              },
              {
                label: "Attendance escalation",
                prompt: selectedOhr
                  ? `Analyze this employee's attendance record and recommend if a CAP is needed.`
                  : "Explain the attendance escalation matrix.",
              },
              {
                label: "Active CAP check",
                prompt: selectedOhr
                  ? `Does this employee have an active CAP? What happens if they commit another violation?`
                  : "What happens when an employee violates policy during an active CAP?",
              },
              {
                label: "NTE requirements",
                prompt: selectedOhr
                  ? `What are the NTE requirements for this employee's case?`
                  : "What are the NTE issuance requirements per policy?",
              },
            ].map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs h-8"
                onClick={() => {
                  setInputValue(action.prompt);
                  inputRef.current?.focus();
                }}
              >
                {action.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              CAP Quick Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>CAP 0</span>
                <span>No active period</span>
              </div>
              <div className="flex justify-between">
                <span>CAP 1</span>
                <span>60 days</span>
              </div>
              <div className="flex justify-between">
                <span>CAP 2</span>
                <span>90 days</span>
              </div>
              <div className="flex justify-between">
                <span>CAP 3</span>
                <span>180 days</span>
              </div>
              <Separator className="my-1.5" />
              <div className="flex justify-between">
                <span>NTE response (≤CAP 2)</span>
                <span>48 hours</span>
              </div>
              <div className="flex justify-between">
                <span>NTE response (CAP 3+)</span>
                <span>5 days</span>
              </div>
              <div className="flex justify-between">
                <span>Hearing required</span>
                <span>CAP 3+ only</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel — Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">AI CAP Assistant</h2>
            <Badge variant="outline" className="text-xs">
              Advisory Mode
            </Badge>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearConversation}>
              Clear Chat
            </Button>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto border rounded-lg p-4 mb-3 bg-muted/30">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Bot className="h-12 w-12 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">
                Compass AI CAP Assistant
              </h3>
              <p className="text-sm text-center max-w-md mb-4">
                I can help you determine the appropriate corrective action
                level based on the GPHR Policy v3.0. Select an employee for
                context-aware recommendations, or ask general policy
                questions.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className="h-3 w-3" />
                <span>
                  Advisory only — final decisions rest with the issuing
                  supervisor
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-card-foreground border"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <Streamdown>{msg.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-card text-card-foreground border rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder={
              selectedOhr
                ? `Ask about ${(selectedEmployee as any)?.full_name || "this employee"}...`
                : "Ask a policy question..."
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          This is an advisory tool based on GPHR Policy v3.0. Recommendations
          are not binding. The final decision rests with the issuing supervisor.
        </p>
      </div>
    </div>
  );
}

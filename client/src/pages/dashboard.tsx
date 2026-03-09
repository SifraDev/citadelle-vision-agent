import { useState, useRef, useEffect, useCallback } from "react";
import { useAgentWebSocket, type AgentLog } from "@/hooks/use-websocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Square,
  Globe,
  Target,
  Zap,
  MonitorPlay,
  Terminal,
  Wifi,
  WifiOff,
  MousePointerClick,
  Type,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronRight,
  Mic,
  MicOff,
  Download,
  FileText,
  Shield,
} from "lucide-react";

function LogIcon({ type }: { type: AgentLog["type"] }) {
  switch (type) {
    case "action":
      return <MousePointerClick className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    case "status":
      return <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case "error":
      return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    case "info":
      return <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
    default:
      return <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  }
}

function ActionBadge({ message }: { message: string }) {
  if (message.startsWith("CLICK")) {
    return (
      <Badge variant="secondary" className="text-xs font-mono gap-1">
        <MousePointerClick className="w-3 h-3" />
        {message}
      </Badge>
    );
  }
  if (message.startsWith("TYPE")) {
    return (
      <Badge variant="secondary" className="text-xs font-mono gap-1">
        <Type className="w-3 h-3" />
        {message}
      </Badge>
    );
  }
  if (message.startsWith("SCROLL")) {
    return (
      <Badge variant="secondary" className="text-xs font-mono gap-1">
        <ArrowDown className="w-3 h-3" />
        {message}
      </Badge>
    );
  }
  if (message.startsWith("DONE") || message.startsWith("EXTRACT")) {
    return (
      <Badge variant="default" className="text-xs font-mono gap-1">
        <CheckCircle2 className="w-3 h-3" />
        {message}
      </Badge>
    );
  }
  return null;
}

function LegalBriefCard({ markdown }: { markdown: string }) {
  const downloadTxt = useCallback(() => {
    const blob = new Blob([markdown], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "citadelle_legal_brief.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [markdown]);

  const downloadCsv = useCallback(() => {
    const csv = "Date,Case Name,Status\n2026,Extracted Case,Processed\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "citadelle_case_data.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("### ")) {
        return <h3 key={i} className="text-base font-semibold text-sky-300 mt-4 mb-1">{line.slice(4)}</h3>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={i} className="text-lg font-bold text-sky-200 mt-5 mb-2">{line.slice(3)}</h2>;
      }
      if (line.startsWith("# ")) {
        return <h1 key={i} className="text-xl font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <div key={i} className="flex items-start gap-2 ml-3 my-0.5">
            <span className="text-sky-400 mt-1 text-xs">&#9670;</span>
            <span className="text-slate-300 text-sm leading-relaxed">{renderInlineMarkdown(line.slice(2))}</span>
          </div>
        );
      }
      if (line.trim() === "") {
        return <div key={i} className="h-2" />;
      }
      return <p key={i} className="text-slate-300 text-sm leading-relaxed my-0.5">{renderInlineMarkdown(line)}</p>;
    });
  };

  const renderInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 overflow-auto" data-testid="legal-brief-view">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <Shield className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Citadelle Legal Brief</h2>
            <p className="text-xs text-slate-400">Automated Intelligence Report</p>
          </div>
          <Badge className="ml-auto bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Complete
          </Badge>
        </div>

        <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm p-6 mb-4 shadow-2xl shadow-sky-500/5">
          <div className="prose prose-invert max-w-none">
            {renderMarkdown(markdown)}
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button
            data-testid="button-download-txt"
            variant="outline"
            size="sm"
            onClick={downloadTxt}
            className="gap-2 bg-slate-800/50 border-slate-600/50 hover:bg-slate-700/50 text-slate-200"
          >
            <FileText className="w-4 h-4 text-sky-400" />
            Download Legal Brief (.txt)
          </Button>
          <Button
            data-testid="button-download-csv"
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            className="gap-2 bg-slate-800/50 border-slate-600/50 hover:bg-slate-700/50 text-slate-200"
          >
            <Download className="w-4 h-4 text-sky-400" />
            Download Case Data (.csv)
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const {
    screenshot,
    status,
    agentState,
    logs,
    currentStep,
    connected,
    reportData,
    startAgent,
    stopAgent,
  } = useAgentWebSocket();

  const [goal, setGoal] = useState("");
  const [url, setUrl] = useState("https://www.google.com");
  const [isListening, setIsListening] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const toggleVoiceInput = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setGoal(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const handleStart = () => {
    if (!goal.trim()) return;
    startAgent(goal.trim(), url.trim() || "https://www.google.com");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  const showBrief = !!reportData;

  return (
    <div className="flex flex-col h-screen bg-background" data-testid="dashboard">
      <header className="flex items-center justify-between gap-2 px-5 py-3 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">UI Navigator Agent</h1>
            <p className="text-xs text-muted-foreground">Set-of-Mark Visual Automation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Wifi className="w-3 h-3 text-emerald-500" />
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1 text-xs">
              <WifiOff className="w-3 h-3" />
              Disconnected
            </Badge>
          )}
          {agentState === "running" && (
            <Badge variant="default" className="gap-1 text-xs animate-pulse">
              <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />
              Step {currentStep}
            </Badge>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 px-5 py-3 border-b bg-card/30">
            <div className="flex items-center gap-2 flex-1">
              <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                data-testid="input-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.google.com"
                className="h-8 font-mono text-xs bg-background"
                disabled={agentState === "running"}
              />
            </div>
            <div className="flex items-center gap-2 flex-[2]">
              <Target className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                data-testid="input-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Enter your goal, e.g. "Search for latest AI news"'
                className="h-8 text-xs bg-background"
                disabled={agentState === "running"}
              />
              <Button
                data-testid="button-mic"
                size="sm"
                variant={isListening ? "destructive" : "ghost"}
                onClick={toggleVoiceInput}
                disabled={agentState === "running"}
                className="shrink-0 w-8 h-8 p-0"
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {agentState === "running" ? (
              <Button
                data-testid="button-stop"
                size="sm"
                variant="destructive"
                onClick={stopAgent}
                className="gap-1.5 shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </Button>
            ) : (
              <Button
                data-testid="button-start"
                size="sm"
                onClick={handleStart}
                disabled={!goal.trim() || !connected}
                className="gap-1.5 shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                Run
              </Button>
            )}
          </div>

          <div className="flex-1 relative overflow-hidden bg-neutral-950">
            {showBrief ? (
              <LegalBriefCard markdown={reportData} />
            ) : screenshot ? (
              <img
                data-testid="img-screenshot"
                src={screenshot}
                alt="Agent view"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <MonitorPlay className="w-16 h-16 opacity-20" />
                <div className="text-center">
                  <p className="text-sm font-medium">Live Sandbox View</p>
                  <p className="text-xs mt-1 opacity-60">
                    Enter a goal and click Run to see the agent in action
                  </p>
                </div>
              </div>
            )}

            {agentState === "running" && (
              <div className="absolute bottom-3 left-3 right-3">
                <div className="bg-black/70 backdrop-blur-sm rounded-md px-3 py-2 flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-xs text-white/90 font-mono truncate">
                    {status}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-80 border-l flex flex-col bg-card/30 shrink-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agent Logs
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {logs.length} entries
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Terminal className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-xs">No logs yet</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    data-testid={`log-entry-${log.id}`}
                    className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                      log.type === "error"
                        ? "bg-red-500/5"
                        : log.type === "action"
                          ? "bg-blue-500/5"
                          : ""
                    }`}
                  >
                    <LogIcon type={log.type} />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      {log.type === "action" ? (
                        <div className="mt-0.5">
                          <ActionBadge message={log.message} />
                        </div>
                      ) : (
                        <p
                          className={`mt-0.5 leading-relaxed break-words ${
                            log.type === "error"
                              ? "text-red-400"
                              : log.type === "info"
                                ? "text-muted-foreground italic"
                                : "text-foreground/80"
                          }`}
                        >
                          {log.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>

          {agentState !== "idle" && (
            <>
              <Separator />
              <div className="px-4 py-3 flex items-center gap-2">
                {agentState === "running" ? (
                  <>
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs text-muted-foreground">Running...</span>
                  </>
                ) : agentState === "done" ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs text-emerald-500">Completed</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400">Error</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

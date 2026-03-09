import { useState, useRef, useEffect, useCallback } from "react";
import { useAgentWebSocket, type AgentLog } from "@/hooks/use-websocket";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Square,
  Zap,
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

function LegalBriefCard({ markdown, onClose }: { markdown: string; onClose: () => void }) {
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
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-950 via-[#0c1222] to-slate-950 overflow-auto" data-testid="legal-brief-view">
      <div className="border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/20 shadow-lg shadow-sky-500/5">
            <Shield className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white tracking-tight">Citadelle Legal Brief</h2>
            <p className="text-xs text-slate-500">Automated Intelligence Report</p>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Complete
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <Card className="bg-slate-800/30 border-slate-700/40 backdrop-blur-sm p-8 shadow-2xl shadow-sky-500/5 rounded-xl">
            <div className="prose prose-invert max-w-none">
              {renderMarkdown(markdown)}
            </div>
          </Card>
        </div>
      </div>

      <div className="border-t border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            data-testid="button-download-txt"
            variant="outline"
            size="sm"
            onClick={downloadTxt}
            className="gap-2 bg-slate-800/60 border-slate-600/40 hover:bg-slate-700/60 hover:border-sky-500/30 text-slate-200 transition-all"
          >
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Download Legal Brief (.txt)</span>
          </Button>
          <Button
            data-testid="button-download-csv"
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            className="gap-2 bg-slate-800/60 border-slate-600/40 hover:bg-slate-700/60 hover:border-sky-500/30 text-slate-200 transition-all"
          >
            <Download className="w-4 h-4 text-sky-400" />
            <span>Download Case Data (.csv)</span>
          </Button>
          <div className="flex-1" />
          <Button
            data-testid="button-close-brief"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="gap-2 bg-slate-800/60 border-slate-600/40 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 text-slate-400 transition-all"
          >
            <Square className="w-3.5 h-3.5" />
            Close Brief
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
    stopAgent,
    sendAudioCommand,
    clearSession,
  } = useAgentWebSocket();

  const [isRecording, setIsRecording] = useState(false);
  const [isAutoStopping, setIsAutoStopping] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const stoppingRef = useRef(false);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SILENCE_THRESHOLD = 12;
  const SILENCE_DURATION_MS = 1500;

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const cleanupAudio = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    silenceStartRef.current = null;
    hasSpokenRef.current = false;
    setVolumeLevel(0);
  }, []);

  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    cleanupAudio();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [cleanupAudio]);

  const startRecording = useCallback(async () => {
    try {
      stoppingRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecordingDuration(0);

        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1000) {
          setIsAutoStopping(false);
          return;
        }

        setIsAutoStopping(true);
        sendTimeoutRef.current = setTimeout(() => {
          sendTimeoutRef.current = null;
          setIsAutoStopping(false);
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            if (base64) {
              const simpleMime = mimeType.split(";")[0];
              sendAudioCommand(base64, simpleMime);
            }
          };
          reader.readAsDataURL(blob);
        }, 600);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      hasSpokenRef.current = false;
      silenceStartRef.current = null;

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const monitorVolume = () => {
        if (!analyserRef.current || stoppingRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setVolumeLevel(Math.min(avg / 80, 1));

        if (avg > SILENCE_THRESHOLD) {
          hasSpokenRef.current = true;
          silenceStartRef.current = null;
        } else if (hasSpokenRef.current) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS) {
            stopRecording();
            return;
          }
        }

        rafRef.current = requestAnimationFrame(monitorVolume);
      };

      rafRef.current = requestAnimationFrame(monitorVolume);
    } catch {
      cleanupAudio();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }, [sendAudioCommand, stopRecording, cleanupAudio]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const showBrief = !!reportData;

  const resetSession = useCallback(() => {
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
    clearSession();
    setIsRecording(false);
    setIsAutoStopping(false);
    setRecordingDuration(0);
    setVolumeLevel(0);
  }, [clearSession]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-screen bg-background" data-testid="dashboard">
      <header className="flex items-center justify-between gap-2 px-5 py-3 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Citadelle Intelligence</h1>
            <p className="text-xs text-muted-foreground">Voice-Activated Legal Research Agent</p>
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
            <>
              <Badge variant="default" className="gap-1 text-xs animate-pulse">
                <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />
                Step {currentStep}
              </Badge>
              <Button
                data-testid="button-stop"
                size="sm"
                variant="destructive"
                onClick={stopAgent}
                className="gap-1.5 ml-1"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 relative overflow-hidden bg-neutral-950">
            {showBrief ? (
              <LegalBriefCard markdown={reportData} onClose={resetSession} />
            ) : screenshot ? (
              <div className="relative w-full h-full">
                <img
                  data-testid="img-screenshot"
                  src={screenshot}
                  alt="Agent view"
                  className="w-full h-full object-contain"
                />
                {agentState !== "running" && (
                  <div className="absolute top-3 right-3">
                    <button
                      data-testid="button-new-mission-screenshot"
                      onClick={resetSession}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm border border-sky-500/30 hover:bg-black/80 hover:border-sky-400 transition-all text-sky-400 text-sm font-medium"
                    >
                      <Mic className="w-4 h-4" />
                      New Mission
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-6">
                <div className="relative">
                  {isRecording && (
                    <div
                      className="absolute inset-0 rounded-full bg-red-500/10 transition-transform duration-100"
                      style={{ transform: `scale(${1 + volumeLevel * 0.6})` }}
                    />
                  )}

                  {isAutoStopping && (
                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                  )}

                  <button
                    data-testid="button-jarvis-mic"
                    onClick={toggleRecording}
                    disabled={agentState === "running" || !connected || isAutoStopping}
                    className={`
                      relative z-10 w-32 h-32 rounded-full flex items-center justify-center
                      transition-all duration-300 cursor-pointer
                      disabled:opacity-40 disabled:cursor-not-allowed
                      ${isAutoStopping
                        ? "bg-emerald-500/20 border-2 border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.3)]"
                        : isRecording
                          ? "bg-red-500/20 border-2 border-red-400 shadow-[0_0_40px_rgba(239,68,68,0.3)]"
                          : "bg-sky-500/10 border-2 border-sky-500/30 hover:border-sky-400 hover:bg-sky-500/20 hover:shadow-[0_0_40px_rgba(56,189,248,0.2)]"
                      }
                    `}
                  >
                    {isAutoStopping ? (
                      <Zap className="w-12 h-12 text-emerald-400 animate-pulse" />
                    ) : isRecording ? (
                      <Mic className="w-12 h-12 text-red-400" />
                    ) : (
                      <Mic className="w-12 h-12 text-sky-400" />
                    )}
                  </button>

                  {isRecording && !isAutoStopping && (
                    <div className="absolute -inset-3 rounded-full border border-red-400/10 animate-pulse" />
                  )}
                </div>

                <div className="text-center max-w-md">
                  {isAutoStopping ? (
                    <p className="text-sm font-medium text-emerald-400 animate-pulse">Sending to Gemini...</p>
                  ) : isRecording ? (
                    <>
                      <p className="text-sm font-medium text-red-400">Recording... {formatDuration(recordingDuration)}</p>
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        Speak naturally — auto-stops when you finish
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-muted-foreground">Tap to Activate</p>
                      <p className="text-xs text-muted-foreground/60 mt-2 leading-relaxed">
                        Speak your full command, e.g. "Go to courtlistener.com and find the Epic Games vs Apple verdict"
                      </p>
                    </>
                  )}
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

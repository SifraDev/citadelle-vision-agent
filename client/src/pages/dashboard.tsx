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
  PlayCircle,
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

interface CaseData {
  title: string;
  court: string;
  date: string;
  docket?: string;
  content: string;
}

function parseReportData(raw: string): { cases: CaseData[]; fallbackText: string | null } {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const attempts = [
    cleaned,
    raw.trim(),
  ];

  for (const str of attempts) {
    try {
      if (str.startsWith("[")) {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { cases: parsed, fallbackText: null };
        }
      }
    } catch {}
  }

  for (const str of attempts) {
    try {
      const arrMatch = str.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { cases: parsed, fallbackText: null };
        }
      }
    } catch {}
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.title) {
      return { cases: [parsed as CaseData], fallbackText: null };
    }
  } catch {}

  return { cases: [], fallbackText: raw };
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateReportHtml(cases: CaseData[], goal: string, fallbackText: string | null): string {
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const isMultiCase = cases.length > 1;
  const isVideo = cases.some(c => c.court?.startsWith("Channel:"));
  const caseCardsHtml = cases.map((c, i) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      ${isMultiCase ? `<div style="margin-bottom:12px;"><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 12px;border-radius:20px;${i === 0 ? 'background:#f0f9ff;color:#0284c7;' : 'background:#fffbeb;color:#d97706;'}">${i === 0 ? 'Primary Case' : `Precedent ${i}`}</span></div>` : ''}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
        <div>
          <h3 style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#1a202c;">${escHtml(c.title || `Case ${i + 1}`)}</h3>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            ${c.court ? `<span style="font-size:13px;color:#64748b;">${escHtml(c.court)}</span>` : ""}
            ${c.date ? `<span style="font-size:13px;color:#64748b;">${escHtml(c.date)}</span>` : ""}
            ${c.docket ? `<span style="font-size:13px;color:#64748b;">Docket: ${escHtml(c.docket)}</span>` : ""}
          </div>
        </div>
        <span style="background:#ecfdf5;color:#059669;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;white-space:nowrap;">Extracted</span>
      </div>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:16px 0;" />
      <div style="font-size:14px;line-height:1.75;color:#334155;white-space:pre-wrap;">${escHtml(c.content || "")}</div>
    </div>
  `).join("");

  const fallbackHtml = fallbackText ? `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="font-size:14px;line-height:1.75;color:#334155;white-space:pre-wrap;">${escHtml(fallbackText)}</div>
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Citadelle Legal Report</title>
<style>
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1a202c; }
</style>
</head>
<body>
<div style="background:#0B132B;padding:48px 32px 40px;text-align:center;">
  <div style="font-size:13px;letter-spacing:6px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:8px;">Intelligence Division</div>
  <h1 style="font-size:36px;font-weight:800;color:#ffffff;letter-spacing:2px;margin-bottom:6px;">CITADELLE</h1>
  <p style="font-size:16px;color:rgba(255,255,255,0.6);margin-bottom:20px;">${isMultiCase ? 'Precedent Research Report' : isVideo ? 'Video Analysis Report' : 'Legal Research Report'}</p>
  <div style="font-size:13px;color:rgba(255,255,255,0.35);">Generated ${dateStr}</div>
</div>
<div style="max-width:800px;margin:0 auto;padding:32px 24px 64px;">
  ${goal ? `
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px 24px;margin-bottom:32px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#0284c7;font-weight:600;margin-bottom:6px;">Research Query</div>
    <div style="font-size:15px;color:#0c4a6e;font-weight:500;">${escHtml(goal)}</div>
  </div>` : ""}
  <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:600;margin-bottom:16px;">${isMultiCase ? `Precedent Research — ${cases.length} Cases` : isVideo ? 'Video Summary' : `Extracted Cases (${cases.length || 1})`}</div>
  ${cases.length > 0 ? caseCardsHtml : fallbackHtml}
  <div style="text-align:center;padding:32px 0;color:#94a3b8;font-size:12px;">
    Citadelle Intelligence &mdash; Automated Legal Research Platform
  </div>
</div>
<div class="no-print" style="position:fixed;bottom:24px;right:24px;background:#0B132B;color:white;padding:12px 24px;border-radius:8px;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);" onclick="window.print()">
  Print / Save as PDF
</div>
</body>
</html>`;
}

function LegalBriefCard({ reportRaw, goal, onClose }: { reportRaw: string; goal: string; onClose: () => void }) {
  const { cases, fallbackText } = parseReportData(reportRaw);

  const openFullReport = useCallback(() => {
    const html = generateReportHtml(cases, goal, fallbackText);
    const newWin = window.open("", "_blank");
    if (newWin) {
      newWin.document.write(html);
      newWin.document.close();
    }
  }, [cases, goal, fallbackText]);

  const downloadDocx = useCallback(async () => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
    const paragraphs: (typeof Paragraph.prototype)[] = [];

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "CITADELLE", bold: true, size: 40, font: "Calibri" })],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cases.some(c => c.court?.startsWith("Channel:")) ? "Video Analysis Report" : cases.length > 1 ? "Precedent Research Report" : "Legal Research Report", size: 24, font: "Calibri", color: "666666" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, size: 20, font: "Calibri", color: "999999" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );

    if (goal) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: "Research Query", bold: true, size: 22, font: "Calibri" })], spacing: { before: 200, after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: goal, size: 22, font: "Calibri", italics: true })], spacing: { after: 300 } })
      );
    }

    const items = cases.length > 0 ? cases : [{ title: "Extracted Content", court: "", date: "", content: fallbackText || "" }];
    for (const c of items) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: c.title || "Case", bold: true, size: 28, font: "Calibri" })], heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 80 } }));
      const meta = [c.court, c.date, c.docket ? `Docket: ${c.docket}` : ""].filter(Boolean).join("  |  ");
      if (meta) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: meta, size: 20, font: "Calibri", color: "888888" })], spacing: { after: 120 } }));
      }
      const contentLines = (c.content || "").split("\n");
      for (const line of contentLines) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line, size: 22, font: "Calibri" })], spacing: { after: 40 } }));
      }
    }

    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "citadelle_legal_brief.docx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cases, goal, fallbackText]);

  const openSingleCaseReport = useCallback((c: CaseData, label: string) => {
    const html = generateReportHtml([c], goal, null);
    const newWin = window.open("", "_blank");
    if (newWin) {
      newWin.document.write(html);
      newWin.document.close();
    }
  }, [goal]);

  const downloadSingleCaseDocx = useCallback(async (c: CaseData, label: string) => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
    const paragraphs: (typeof Paragraph.prototype)[] = [];
    paragraphs.push(
      new Paragraph({ children: [new TextRun({ text: "CITADELLE", bold: true, size: 40, font: "Calibri" })], heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
      new Paragraph({ children: [new TextRun({ text: label, size: 24, font: "Calibri", color: "666666" })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
      new Paragraph({ children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, size: 20, font: "Calibri", color: "999999" })], alignment: AlignmentType.CENTER, spacing: { after: 300 } })
    );
    if (goal) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: "Research Query", bold: true, size: 22, font: "Calibri" })], spacing: { before: 200, after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: goal, size: 22, font: "Calibri", italics: true })], spacing: { after: 300 } })
      );
    }
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: c.title || "Case", bold: true, size: 28, font: "Calibri" })], heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 80 } }));
    const meta = [c.court, c.date, c.docket ? `Docket: ${c.docket}` : ""].filter(Boolean).join("  |  ");
    if (meta) paragraphs.push(new Paragraph({ children: [new TextRun({ text: meta, size: 20, font: "Calibri", color: "888888" })], spacing: { after: 120 } }));
    for (const line of (c.content || "").split("\n")) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: line, size: 22, font: "Calibri" })], spacing: { after: 40 } }));
    }
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `citadelle_${(c.title || label).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [goal]);

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="legal-brief-view">
      <div className="px-8 py-6" style={{ background: "#0B132B" }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-[4px] text-white/30 mb-1">Intelligence Division</p>
          <h1 className="text-2xl font-extrabold text-white tracking-wider mb-1">CITADELLE</h1>
          <p className="text-sm text-white/50 mb-2">{cases.length > 1 ? 'Precedent Research Report' : cases.some(c => c.court?.startsWith("Channel:")) ? 'Video Analysis Report' : 'Legal Research Report'}</p>
          <p className="text-xs text-white/25">Generated {dateStr}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
          {goal && (
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 rounded-xl px-5 py-4">
              <p className="text-[11px] uppercase tracking-wider text-sky-600 dark:text-sky-400 font-semibold mb-1">Research Query</p>
              <p className="text-sm text-sky-900 dark:text-sky-200 font-medium">{goal}</p>
            </div>
          )}

          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            {cases.length > 1 ? `Precedent Research — ${cases.length} Cases` : `Extracted Cases (${cases.length || 1})`}
          </p>

          {cases.length > 0 ? cases.map((c, i) => {
            const caseLabel = cases.length > 1
              ? (i === 0 ? "Primary Case" : `Precedent ${i}`)
              : null;
            return (
            <Card key={i} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden" data-testid={`card-case-${i}`}>
              <div className="px-6 pt-5 pb-4">
                {caseLabel && (
                  <div className="mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${i === 0 ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                      {caseLabel}
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">{c.title || `Case ${i + 1}`}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {c.court && <span className="text-xs text-slate-500 dark:text-slate-400">{c.court?.startsWith("Channel:") ? c.court : c.court}</span>}
                      {c.date && <span className="text-xs text-slate-500 dark:text-slate-400">{c.date}</span>}
                      {c.docket && <span className="text-xs text-slate-500 dark:text-slate-400">Docket: {c.docket}</span>}
                    </div>
                  </div>
                  {c.court?.startsWith("Channel:") ? (
                    <Badge className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20 text-[10px] shrink-0">
                      <PlayCircle className="w-3 h-3 mr-1" />
                      Video
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 text-[10px] shrink-0">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Extracted
                    </Badge>
                  )}
                </div>
                <Separator className="bg-slate-100 dark:bg-slate-800 mb-4" />
                <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-[500px] overflow-y-auto pr-2">
                  {c.content}
                </div>
                {cases.length > 1 && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      data-testid={`button-case-pdf-${i}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => openSingleCaseReport(c, caseLabel || `Case ${i + 1}`)}
                      className="gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 h-7 px-2.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Open as PDF
                    </Button>
                    <Button
                      data-testid={`button-case-docx-${i}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadSingleCaseDocx(c, caseLabel || `Case ${i + 1}`)}
                      className="gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 h-7 px-2.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export .docx
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );}) : fallbackText && (
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden">
              <div className="px-6 pt-5 pb-4">
                <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {fallbackText}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur-sm px-6 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            data-testid="button-open-report"
            size="sm"
            onClick={openFullReport}
            className="gap-2 bg-[#0B132B] hover:bg-[#1a2744] text-white"
          >
            <FileText className="w-4 h-4" />
            <span>Open Full Report</span>
          </Button>
          <Button
            data-testid="button-download-docx"
            variant="outline"
            size="sm"
            onClick={downloadDocx}
            className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Export .docx</span>
          </Button>
          <div className="flex-1" />
          <Button
            data-testid="button-close-brief"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-300 dark:hover:border-red-500/30 hover:text-red-600 dark:hover:text-red-300 text-slate-400 transition-all"
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
    lastGoal,
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
  const hardStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SILENCE_THRESHOLD = 25;
  const SILENCE_DURATION_MS = 3000;

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
    if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null; }
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
        if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null; }
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
    if (sendTimeoutRef.current) { clearTimeout(sendTimeoutRef.current); sendTimeoutRef.current = null; }
    if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null; }
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
              <LegalBriefCard reportRaw={reportData} goal={lastGoal} onClose={resetSession} />
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

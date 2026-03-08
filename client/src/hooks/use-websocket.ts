import { useState, useEffect, useRef, useCallback } from "react";
import type { WsMessageToClient, WsMessageToServer } from "@shared/schema";

export type AgentState = "idle" | "running" | "done" | "error";

export interface AgentLog {
  id: number;
  timestamp: Date;
  type: "action" | "status" | "error" | "log" | "info";
  message: string;
}

export function useAgentWebSocket() {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const addLog = useCallback((type: AgentLog["type"], message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: ++logIdRef.current, timestamp: new Date(), type, message },
    ]);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onclose = () => {
      setConnected(false);
      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    socket.onerror = () => {};

    socket.onmessage = (event) => {
      try {
        const msg: WsMessageToClient = JSON.parse(event.data);

        switch (msg.type) {
          case "screenshot":
            if (msg.screenshot) {
              setScreenshot(`data:image/jpeg;base64,${msg.screenshot}`);
            }
            if (msg.step) setCurrentStep(msg.step);
            break;
          case "action":
            if (msg.action) {
              addLog(
                "action",
                `${msg.action.action.toUpperCase()}${msg.action.targetNumber ? ` #${msg.action.targetNumber}` : ""}${msg.action.textToType ? `: "${msg.action.textToType}"` : ""}`
              );
              if (msg.action.reasoning) {
                addLog("info", msg.action.reasoning);
              }
            }
            break;
          case "status":
            setStatus(msg.message || "");
            break;
          case "error":
            setAgentState("error");
            setStatus(msg.message || "Error occurred");
            addLog("error", msg.message || "Unknown error");
            break;
          case "done":
            setAgentState("done");
            setStatus(msg.message || "Done");
            addLog("status", msg.message || "Task completed");
            break;
          case "log":
            addLog("log", msg.message || "");
            break;
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };
  }, [addLog]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const startAgent = useCallback(
    (goal: string, startUrl: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        setAgentState("running");
        setCurrentStep(0);
        setLogs([]);
        setScreenshot(null);
        setStatus("Starting agent...");
        addLog("status", `Starting: "${goal}" at ${startUrl}`);

        const msg: WsMessageToServer = {
          type: "start_agent",
          goal,
          startUrl,
        };
        wsRef.current.send(JSON.stringify(msg));
      }
    },
    [addLog]
  );

  const stopAgent = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: WsMessageToServer = { type: "stop_agent" };
      wsRef.current.send(JSON.stringify(msg));
      setAgentState("idle");
      setStatus("Stopped");
      addLog("status", "Agent stopped by user");
    }
  }, [addLog]);

  return {
    screenshot,
    status,
    agentState,
    logs,
    currentStep,
    connected,
    startAgent,
    stopAgent,
  };
}

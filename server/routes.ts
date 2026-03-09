import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { runAgentLoop } from "./agent";
import { parseAudioCommand } from "./jarvis-parser";
import type { WsMessageToServer, WsMessageToClient } from "@shared/schema";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    log("WebSocket client connected", "ws");
    let stopFlag = false;
    let isRunning = false;

    const send = (msg: WsMessageToClient) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.on("message", async (raw) => {
      try {
        const msg: WsMessageToServer = JSON.parse(raw.toString());

        if (msg.type === "audio_command") {
          if (isRunning) {
            send({ type: "error", message: "Agent is already running. Stop it first." });
            return;
          }

          const audioData = msg.audioBase64 || "";
          const mimeType = msg.mimeType || "audio/webm";
          if (!audioData) {
            send({ type: "error", message: "No audio data received." });
            return;
          }

          stopFlag = false;
          isRunning = true;
          send({ type: "status", message: "Processing voice command with Gemini..." });
          log(`Audio command received (${mimeType}, ${Math.round(audioData.length / 1024)}KB)`, "ws");

          try {
            const parsed = await parseAudioCommand(audioData, mimeType);

            if (stopFlag) {
              log("Stop requested during audio parsing, aborting.", "ws");
              send({ type: "status", message: "Stopped." });
              isRunning = false;
              return;
            }

            log(`Parsed audio: url="${parsed.url}", goal="${parsed.goal}"`, "ws");
            send({ type: "log", message: `Target: ${parsed.url}` });
            send({ type: "log", message: `Mission: ${parsed.goal}` });
            send({ type: "status", message: "Agent launching..." });

            await runAgentLoop(parsed.goal, parsed.url, send, () => stopFlag);
          } catch (parseErr: any) {
            log(`Audio parse error: ${parseErr.message}`, "ws");
            send({ type: "error", message: `Failed to process voice command: ${parseErr.message}` });
          } finally {
            isRunning = false;
          }
          return;
        }

        if (msg.type === "start_agent") {
          if (isRunning) {
            send({ type: "error", message: "Agent is already running. Stop it first." });
            return;
          }
          stopFlag = false;
          isRunning = true;
          const goal = msg.goal || "Explore this page";
          const startUrl = msg.startUrl || "https://www.google.com";

          log(`Agent starting: goal="${goal}", url="${startUrl}"`, "ws");
          send({ type: "status", message: "Agent starting..." });

          try {
            await runAgentLoop(goal, startUrl, send, () => stopFlag);
          } finally {
            isRunning = false;
          }
        } else if (msg.type === "stop_agent") {
          stopFlag = true;
          send({ type: "status", message: "Stopping agent..." });
          log("Agent stop requested", "ws");
        }
      } catch (err: any) {
        log(`WebSocket message error: ${err.message}`, "ws");
        send({ type: "error", message: err.message });
        isRunning = false;
      }
    });

    ws.on("close", () => {
      stopFlag = true;
      log("WebSocket client disconnected", "ws");
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return httpServer;
}

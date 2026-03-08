import { z } from "zod";

export const agentActionSchema = z.object({
  action: z.enum(["click", "type", "scroll", "done"]),
  targetNumber: z.number().optional(),
  textToType: z.string().optional(),
  reasoning: z.string().optional(),
});

export type AgentAction = z.infer<typeof agentActionSchema>;

export interface MarkerMapping {
  [id: number]: { x: number; y: number; tag: string; text: string };
}

export interface WsMessageToServer {
  type: "start_agent" | "stop_agent";
  goal?: string;
  startUrl?: string;
}

export interface WsMessageToClient {
  type: "screenshot" | "frame" | "action" | "status" | "error" | "done" | "log";
  screenshot?: string;
  action?: AgentAction;
  message?: string;
  step?: number;
  totalMarkers?: number;
}

import { GoogleGenAI } from "@google/genai";
import { log } from "./index";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function parseAudioCommand(audioBase64: string, mimeType: string): Promise<{ url: string; goal: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: audioBase64, mimeType } },
        { text: 'Listen to this voice command for a web automation agent. Extract the target URL and the goal. Return ONLY JSON with no markdown or code fences: {"url": "https://...", "goal": "..."}. If the user mentions a website name, construct the full URL (e.g., "courtlistener" becomes "https://www.courtlistener.com"). Default URL to https://www.google.com if no domain is specified.' }
      ]
    }]
  });

  const rawText = response.text || "";
  log(`Audio parser raw response: ${rawText}`, "agent");

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse audio command");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    url: parsed.url || "https://www.google.com",
    goal: parsed.goal || "Explore this page",
  };
}

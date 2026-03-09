import { GoogleGenAI } from "@google/genai";
import { log } from "./index";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function parseJarvisCommand(voiceText: string): Promise<{ url: string; goal: string }> {
  const prompt = `Extract the target URL and the user's ultimate goal from this voice command.
Return ONLY a JSON object with NO markdown formatting, code fences, or extra text:
{"url": "https://...", "goal": "..."}

Rules:
- If the user mentions a website name or domain, construct the full URL (e.g., "courtlistener" becomes "https://www.courtlistener.com")
- If no explicit domain or website is mentioned, default url to "https://www.google.com"
- The goal should be a clear, actionable instruction for a browser automation agent
- Keep the goal concise but complete

Voice command: "${voiceText}"`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  });

  const rawText = response.text || "";
  log(`Jarvis parser raw response: ${rawText}`, "agent");

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse voice command");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    url: parsed.url || "https://www.google.com",
    goal: parsed.goal || voiceText,
  };
}

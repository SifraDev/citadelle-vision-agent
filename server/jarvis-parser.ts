import { GoogleGenAI } from "@google/genai";
import { log } from "./index";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function parseAudioCommand(audioBase64: string, mimeType: string): Promise<{ url: string; goal: string }> {
  const audioSizeKB = Math.round(audioBase64.length * 3 / 4 / 1024);
  if (audioBase64.length < 2000) {
    log(`Audio too small (${audioSizeKB} KB), rejecting.`, "agent");
    throw new Error("AUDIO_TOO_SHORT");
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: audioBase64, mimeType } },
        { text: 'Listen to this voice command for a web automation agent. Extract the target URL and the goal. Return ONLY JSON with no markdown or code fences: {"url": "https://...", "goal": "..."}. If the user mentions a website name, construct the full URL (e.g., "courtlistener" becomes "https://www.courtlistener.com"). Default URL to https://www.google.com if no domain is specified. CRITICAL: NEVER hallucinate, guess, or construct deep links (e.g., /opinion/123/case-name). You MUST ONLY return the root base URL of the domain (e.g., "https://www.courtlistener.com", "https://www.wikipedia.org"). Put all the specific search terms, case names, and instructions into the goal field so the visual agent performs the search manually. If the audio sounds like "strat", "straight", or "track" in the context of getting or reading a case, assume the user meant the word "extract". CRITICAL: Listen to the audio carefully. If the audio contains only silence, background noise, static, or unintelligible sounds, you MUST return a JSON object with empty values: {"url": "", "goal": ""}. DO NOT hallucinate commands. DO NOT output example phrases like "the district court decision". Only transcribe actual human speech.' }
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
    url: parsed.url || "",
    goal: parsed.goal || "",
  };
}

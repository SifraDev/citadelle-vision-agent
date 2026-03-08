import { chromium, type Browser, type Page } from "playwright";
import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";
import type { AgentAction, MarkerMapping, WsMessageToClient } from "@shared/schema";
import { log } from "./index";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

let browser: Browser | null = null;

function findChromium(): string {
  try {
    return execSync("which chromium").toString().trim();
  } catch {
    return "chromium";
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      executablePath: findChromium(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    });
  }
  return browser;
}

export async function injectMarkers(page: Page): Promise<MarkerMapping> {
  return await page.evaluate(() => {
    const mapping: Record<number, { x: number; y: number; tag: string; text: string }> = {};
    const selectors = "a, button, input, textarea, select, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [onclick]";
    const elements = document.querySelectorAll(selectors);
    let id = 1;

    const existing = document.querySelectorAll(".som-marker-overlay");
    existing.forEach((el) => el.remove());

    elements.forEach((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) return;
      if (rect.top < 0 || rect.left < 0) return;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

      const box = document.createElement("div");
      box.className = "som-marker-overlay";
      box.style.cssText = `
        position: absolute;
        left: ${rect.left + window.scrollX}px;
        top: ${rect.top + window.scrollY}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 2px solid rgba(56, 189, 248, 0.8);
        background: rgba(56, 189, 248, 0.1);
        z-index: 999999;
        pointer-events: none;
        box-sizing: border-box;
      `;

      const label = document.createElement("span");
      label.style.cssText = `
        position: absolute;
        top: -2px;
        left: -2px;
        background: #0f172a;
        color: #38bdf8;
        font-size: 11px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 4px;
        z-index: 1000000;
        font-family: monospace;
        line-height: 1.2;
      `;
      label.textContent = `${id}`;
      box.appendChild(label);
      document.body.appendChild(box);

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const text = (el as HTMLElement).innerText?.slice(0, 50) ||
        (el as HTMLInputElement).placeholder ||
        (el as HTMLElement).getAttribute("aria-label") ||
        el.tagName.toLowerCase();

      mapping[id] = {
        x: Math.round(centerX),
        y: Math.round(centerY),
        tag: el.tagName.toLowerCase(),
        text: text.trim(),
      };
      id++;
    });

    return mapping;
  });
}

export async function removeMarkers(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const markers = document.querySelectorAll(".som-marker-overlay");
      markers.forEach((el) => el.remove());
    });
  } catch {
  }
}

async function ensureGhostCursor(page: Page): Promise<void> {
  try {
    const exists = await page.evaluate(() => !!document.getElementById("som-ghost-cursor"));
    if (!exists) {
      await page.addStyleTag({ content: `
        #som-ghost-cursor {
          position: absolute; top: 0; left: 0; width: 24px; height: 24px;
          pointer-events: none; z-index: 2147483647;
          transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }
      `});
      await page.evaluate(() => {
        const el = document.createElement("div");
        el.id = "som-ghost-cursor";
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#38bdf8" stroke="white" stroke-width="2" stroke-linejoin="round"><path d="M5 3L19 12L12 13L9 20L5 3Z"/></svg>';
        document.body.appendChild(el);
      });
    }
  } catch {}
}

async function takeScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({
    type: "jpeg",
    quality: 75,
    fullPage: false,
  });
  return buffer.toString("base64");
}

async function askGemini(
  screenshotBase64: string,
  goal: string,
  step: number,
  previousActions: string[]
): Promise<AgentAction> {
  const historyContext = previousActions.length > 0
    ? `\nPrevious actions taken:\n${previousActions.map((a, i) => `Step ${i + 1}: ${a}`).join("\n")}`
    : "";

  const prompt = `You are a UI automation agent. The user wants to: "${goal}".${historyContext}

Look at the provided screenshot. Interactable elements have numbered red bounding boxes with labels.
Decide the next logical action to accomplish the user's goal.

Return ONLY a JSON object with NO markdown formatting, code fences, or extra text:
{"action": "click" | "type" | "scroll" | "done", "targetNumber": integer, "textToType": "string (only if typing)", "reasoning": "brief explanation"}

Rules:
- Use "click" to click on a numbered element
- Use "type" to click a numbered input field and type text into it
- Use "scroll" to scroll down the page (no targetNumber needed)
- Use "done" when the goal appears to be accomplished
- targetNumber must match a visible numbered label in the screenshot
- Be precise and methodical`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: screenshotBase64,
              mimeType: "image/jpeg",
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  const rawText = response.text || "";
  log(`Gemini raw response: ${rawText}`, "agent");

  const cleaned = rawText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      action: parsed.action || "done",
      targetNumber: parsed.targetNumber,
      textToType: parsed.textToType,
      reasoning: parsed.reasoning,
    };
  } catch {
    log(`Failed to parse Gemini response: ${cleaned}`, "agent");
    throw new Error(`Failed to parse AI response: ${cleaned.slice(0, 200)}`);
  }
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
    if (hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.")) return false;
    if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function runAgentLoop(
  goal: string,
  startUrl: string,
  send: (msg: WsMessageToClient) => void,
  shouldStop: () => boolean
): Promise<void> {
  if (!validateUrl(startUrl)) {
    send({ type: "error", message: "Invalid URL. Only public http/https URLs are allowed." });
    return;
  }

  let page: Page | null = null;

  try {
    const b = await getBrowser();
    const context = await b.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    page = await context.newPage();

    send({ type: "status", message: `Navigating to ${startUrl}...` });
    send({ type: "log", message: `Goal: "${goal}"` });
    send({ type: "log", message: `Navigating to: ${startUrl}` });

    try {
      await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (navError: any) {
      if (navError.message.includes("Timeout")) {
        log("Navigation timeout reached, but proceeding with available DOM...", "agent");
        send({ type: "log", message: "Navigation timeout reached, proceeding with available DOM..." });
      } else {
        throw navError;
      }
    }
    await new Promise(r => setTimeout(r, 1000));

    await page.addStyleTag({ content: `
      #som-ghost-cursor {
        position: absolute; top: 0; left: 0; width: 24px; height: 24px;
        pointer-events: none; z-index: 2147483647;
        transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
      }
    `});
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "som-ghost-cursor";
      el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#38bdf8" stroke="white" stroke-width="2" stroke-linejoin="round"><path d="M5 3L19 12L12 13L9 20L5 3Z"/></svg>';
      document.body.appendChild(el);
    });

    const MAX_STEPS = 15;
    const previousActions: string[] = [];

    for (let step = 1; step <= MAX_STEPS; step++) {
      if (shouldStop()) {
        send({ type: "status", message: "Agent stopped by user." });
        break;
      }

      send({ type: "status", message: `Step ${step}: Analyzing page...` });
      send({ type: "log", message: `--- Step ${step} ---` });

      await ensureGhostCursor(page);

      const mapping = await injectMarkers(page);
      const markerCount = Object.keys(mapping).length;
      send({ type: "log", message: `Injected ${markerCount} markers` });

      await page.waitForTimeout(500);

      const screenshot = await takeScreenshot(page);
      send({ type: "screenshot", screenshot, step, totalMarkers: markerCount });

      send({ type: "status", message: `Step ${step}: Thinking...` });
      let action: AgentAction;
      let retries = 0;
      const MAX_RETRIES = 2;
      while (true) {
        try {
          action = await askGemini(screenshot, goal, step, previousActions);
          break;
        } catch (parseErr: any) {
          retries++;
          if (retries > MAX_RETRIES) {
            send({ type: "log", message: `Failed to get valid AI response after ${MAX_RETRIES} retries` });
            send({ type: "error", message: "AI returned invalid responses. Stopping." });
            return;
          }
          send({ type: "log", message: `AI response parse error, retrying (${retries}/${MAX_RETRIES})...` });
        }
      }

      send({
        type: "action",
        action,
        step,
        message: action.reasoning || `Action: ${action.action}`,
      });
      send({
        type: "log",
        message: `AI decided: ${action.action}${action.targetNumber ? ` on element #${action.targetNumber}` : ""}${action.textToType ? ` with text "${action.textToType}"` : ""} — ${action.reasoning || ""}`,
      });

      if (action.action === "done") {
        await removeMarkers(page);
        send({ type: "status", message: "Goal accomplished!" });
        send({ type: "log", message: "Agent completed the task." });

        const finalScreenshot = await takeScreenshot(page);
        send({ type: "screenshot", screenshot: finalScreenshot, step });
        send({ type: "done", message: "Task completed successfully." });
        break;
      }

      try {
        await removeMarkers(page);
      } catch { }

      if (action.action === "click" && action.targetNumber) {
        const target = mapping[action.targetNumber];
        if (target) {
          send({ type: "status", message: `Step ${step}: Clicking element #${action.targetNumber}...` });
          try {
            await page.evaluate(({x, y}) => {
              const c = document.getElementById("som-ghost-cursor");
              if (c) c.style.transform = `translate(${x}px, ${y}px)`;
            }, { x: target.x, y: target.y });
          } catch {}
          await page.mouse.move(target.x, target.y, { steps: 25 });
          const navigationPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
          await page.mouse.click(target.x, target.y);
          await navigationPromise;
          previousActions.push(`Clicked element #${action.targetNumber} (${target.tag}: "${target.text}")`);
        } else {
          send({ type: "log", message: `Warning: Element #${action.targetNumber} not found in mapping` });
          previousActions.push(`Attempted to click element #${action.targetNumber} but it was not found`);
        }
      } else if (action.action === "type" && action.targetNumber && action.textToType) {
        const target = mapping[action.targetNumber];
        if (target) {
          send({ type: "status", message: `Step ${step}: Typing into element #${action.targetNumber}...` });
          try {
            await page.evaluate(({x, y}) => {
              const c = document.getElementById("som-ghost-cursor");
              if (c) c.style.transform = `translate(${x}px, ${y}px)`;
            }, { x: target.x, y: target.y });
          } catch {}
          await page.mouse.move(target.x, target.y, { steps: 25 });
          await page.mouse.click(target.x, target.y);
          await page.waitForTimeout(300);
          await page.keyboard.type(action.textToType, { delay: 50 });
          const navigationPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
          await page.keyboard.press("Enter");
          await navigationPromise;
          previousActions.push(`Typed "${action.textToType}" into element #${action.targetNumber} (${target.tag}: "${target.text}")`);
        } else {
          send({ type: "log", message: `Warning: Element #${action.targetNumber} not found` });
          previousActions.push(`Attempted to type into element #${action.targetNumber} but it was not found`);
        }
      } else if (action.action === "scroll") {
        send({ type: "status", message: `Step ${step}: Scrolling down...` });
        await page.mouse.wheel(0, 400);
        previousActions.push("Scrolled down the page");
      }

      await new Promise(r => setTimeout(r, 1500));

      if (step === MAX_STEPS) {
        send({ type: "status", message: "Reached maximum steps." });
        send({ type: "done", message: "Maximum steps reached." });
      }
    }
  } catch (err: any) {
    log(`Agent error: ${err.message}`, "agent");
    send({ type: "error", message: err.message });
  } finally {
    if (page) {
      try {
        await page.context().close();
      } catch {}
    }
  }
}

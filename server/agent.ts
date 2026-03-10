import { chromium, type Browser, type Page } from "playwright";
import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";
import type { AgentAction, MarkerMapping, WsMessageToClient } from "@shared/schema";
import { log } from "./index";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function findChromium(): string {
  try {
    return execSync("which chromium").toString().trim();
  } catch {
    return "chromium";
  }
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
    const wasCreated = await page.evaluate(() => {
      let el = document.getElementById("som-ghost-cursor");
      const created = !el;
      if (!el) {
        el = document.createElement("div");
        el.id = "som-ghost-cursor";
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#38bdf8" stroke="white" stroke-width="2" stroke-linejoin="round"><path d="M5 3L19 12L12 13L9 20L5 3Z"/></svg>';
        document.body.appendChild(el);
      }
      el.style.cssText = "position:fixed;top:0;left:0;width:24px;height:24px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));";
      return created;
    });
    if (wasCreated) {
      log("Ghost cursor injected on page", "agent");
    }
  } catch {}
}

async function moveCursorFluidly(
  page: Page,
  fromX: number, fromY: number,
  toX: number, toY: number,
  send: (msg: WsMessageToClient) => void,
  step: number
): Promise<void> {
  const totalSteps = 80;
  for (let i = 1; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const nextX = fromX + (toX - fromX) * ease;
    const nextY = fromY + (toY - fromY) * ease;
    try {
      await page.evaluate(({x, y}) => {
        const c = document.getElementById("som-ghost-cursor");
        if (c) c.style.transform = `translate(${x}px, ${y}px)`;
      }, { x: nextX, y: nextY });
    } catch {}
    await page.mouse.move(nextX, nextY, { steps: 1 });
    await new Promise(r => setTimeout(r, 18));
    if (i % 4 === 0 || i === totalSteps) {
      const snap = await takeScreenshot(page);
      send({ type: "screenshot", screenshot: snap, step });
    }
  }
  await new Promise(r => setTimeout(r, 300));
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
{"action": "click" | "type" | "scroll" | "extract" | "done", "targetNumber": integer, "textToType": "string (only if typing)", "extractedData": "string (markdown summary of the case/data)", "reasoning": "brief explanation"}

Rules:
- Use "click" to click on a numbered element
- Use "type" to click a numbered input field and type text into it. IMPORTANT: When typing into a search bar, DO NOT type the user's entire goal literally if it contains instructional words (like "summarized", "extract", "find", "look for", "analyze"). Extract ONLY the relevant entity names and keywords. For example, if the goal is "Epic Games versus Apple lawsuit summarized", type ONLY "Epic Games versus Apple" into the search bar
- Use "scroll" to scroll down the page (no targetNumber needed)
- UNIVERSAL EXTRACT RULE: Your only job as the navigator is to reach the final page containing the requested case, article, video, or document. The MOMENT you are on the correct target page, you MUST IMMEDIATELY use the "extract" action and stop navigating. DO NOT try to read the document yourself, and DO NOT try to click into specific PDF viewers or sub-tabs unless strictly necessary to reveal the page. Just get to the main page of the document/video and trigger "extract". Our universal backend will automatically detect if there is a PDF to download, a video to transcribe, or text to scrape, and will perform the deep analysis.
- PRECEDENT RESEARCH RULE: When the user's goal asks for precedents, cited cases, case history, or authorities, follow these steps IN ORDER:
  Step 1: Navigate to the main case page and trigger "extract" on it.
  Step 2: After extracting, click the "Authorities", "Cited by", or "References" TAB exactly ONCE to open that section.
  Step 3: You are now INSIDE the authorities/cited-by list. Do NOT click the tab header again. Instead, look at the LIST of case titles/links below the tab and click on an INDIVIDUAL case link (a specific case name, not the tab itself).
  Step 4: You are now on a precedent case page. Trigger "extract" on it.
  Step 5: Use the browser back button (if visible) or navigation links to return to the authorities list, then click the NEXT individual case link.
  Step 6: Repeat until you have extracted 3-4 cases total. The backend collects all extractions automatically.
- EXCEPTION FOR LISTS: If the user's goal explicitly asks for a LIST or MULTIPLE items (e.g., "5 lawsuits", "latest cases", "recent articles"), you ARE ALLOWED to use the "extract" action directly on the search results page without clicking into individual items.
- WRONG PAGE RULE: If you realize you are on the WRONG page, DO NOT use "extract". Use "click" to go back or "type" to search again. "extract" is ONLY for the correct target page.
- EXTRACTION FORMAT: When using "extract", structure the extractedData as a JSON array: [{"title": "Name", "court": "Court", "date": "Date", "docket": "Docket", "content": "Summary text"}]. Always return valid JSON array syntax.
- CRITICAL: If the user's goal involves extracting, summarizing, reading, or analyzing any content, you are FORBIDDEN from using the "done" action. You MUST use "extract" instead. The backend handles all document processing — you just trigger "extract".
- Use "done" ONLY when the user's goal strictly asks to navigate somewhere without needing a summary, report, or data extraction.
- ANTI-LOOP RULE: Check your previous actions carefully. If you clicked the SAME element number 2 or more times in a row, OR if you used "extract" on the same page multiple times, you MUST choose a DIFFERENT action. Either scroll down to reveal new elements, click a different element, or try a completely different approach. Repeating the same action means you are stuck. If a previous action says "SKIPPED duplicate extract", it means you already extracted this page — navigate away immediately.
- targetNumber must match a visible numbered label in the screenshot
- Be precise and methodical
- CRITICAL: You must return EXACTLY ONE single JSON object per turn. DO NOT chain multiple actions. DO NOT output multiple JSON blocks. Analyze the screen, pick the SINGLE best next step, output its JSON, and stop.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
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

  let jsonStr: string | null = null;

  const firstBrace = rawText.indexOf("{");
  if (firstBrace === -1) {
    throw new Error("No JSON found in response: " + rawText.slice(0, 100));
  }

  let depth = 0;
  for (let i = firstBrace; i < rawText.length; i++) {
    if (rawText[i] === "{") depth++;
    else if (rawText[i] === "}") depth--;
    if (depth === 0) {
      jsonStr = rawText.slice(firstBrace, i + 1);
      break;
    }
  }

  if (!jsonStr) {
    throw new Error("Malformed JSON in response: " + rawText.slice(0, 200));
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      action: parsed.action || "done",
      targetNumber: parsed.targetNumber,
      textToType: parsed.textToType,
      extractedData: parsed.extractedData,
      reasoning: parsed.reasoning,
    };
  } catch {
    log(`Failed to parse Gemini response: ${jsonStr}`, "agent");
    throw new Error(`Failed to parse AI response: ${jsonStr.slice(0, 200)}`);
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

  let localBrowser: Browser | null = null;
  let page: Page | null = null;
  let cursorX = 0;
  let cursorY = 0;

  try {
    localBrowser = await chromium.launch({
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

    const context = await localBrowser.newContext({
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

    await ensureGhostCursor(page);

    const isPrecedentGoal = /precedent|cited|authorities|citing cases|case history|and its precedents|with precedents/i.test(goal);
    const MAX_STEPS = isPrecedentGoal ? 25 : 15;
    const collectedReports: string[] = [];
    const MAX_EXTRACTS = isPrecedentGoal ? 4 : 1;
    let extractCount = 0;
    let searchBlockCount = 0;
    const extractedUrls = new Set<string>();
    const previousActions: string[] = [];

    if (isPrecedentGoal) {
      log(`Precedent research mode: will collect up to ${MAX_EXTRACTS} cases over ${MAX_STEPS} steps.`, "agent");
      send({ type: "log", message: "Precedent research mode activated — will collect multiple cases." });
    }

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
          send({ type: "log", message: `AI error: ${parseErr.message}. Retrying (${retries}/${MAX_RETRIES})...` });
          if (retries > MAX_RETRIES) {
            send({ type: "log", message: `Failed to get valid AI response after ${MAX_RETRIES} retries` });
            send({ type: "error", message: "AI returned invalid responses. Stopping." });
            return;
          }
          await new Promise(r => setTimeout(r, 3000));
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

      if (action.action === "extract") {
        const currentUrl = page.url().toLowerCase();
        const pathname = new URL(currentUrl).pathname;
        const isSearchPage =
          /google\.com/.test(currentUrl) ||
          /bing\.com/.test(currentUrl) ||
          /duckduckgo/.test(currentUrl) ||
          pathname === "/" ||
          /^\/search/.test(pathname) ||
          /^\/results/.test(pathname) ||
          /^\/find\b/.test(pathname);
        const listKeywords = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(lawsuits?|cases?|filings?|opinions?|results?)|last\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)|latest|recent|list\s+of|find\s+all|multiple|lawsuits|all\s+cases/i;
        const isListGoal = listKeywords.test(goal);

        if (isSearchPage && !isListGoal) {
          searchBlockCount++;
          log(`Extract blocked: page appears to be a search/results page (${currentUrl}). Block count: ${searchBlockCount}`, "agent");
          send({ type: "log", message: "Extraction blocked — still on search results. Navigating to the actual document..." });
          previousActions.push(`EXTRACT BLOCKED (attempt ${searchBlockCount}): You are on a search/results page. You CANNOT extract here. You MUST click on a specific result (a video title, article link, or case name) to navigate to the actual content page BEFORE you can extract. DO NOT use extract again — use click on a result.`);
          action.action = "scroll";
          continue;
        }
        if (isSearchPage && isListGoal) {
          log(`Extract allowed on search page: goal requests a list of cases.`, "agent");
        }

        searchBlockCount = 0;

        await removeMarkers(page);
        const cleanScreenshot = await takeScreenshot(page);
        send({ type: "screenshot", screenshot: cleanScreenshot, step });

        if (shouldStop()) break;

        const pageUrlNow = page.url();
        if (extractedUrls.has(pageUrlNow)) {
          log(`Harvester: already extracted this URL (${pageUrlNow}). Skipping duplicate extract.`, "agent");
          send({ type: "log", message: "Already extracted this page — navigate to a different case." });
          previousActions.push(`SKIPPED duplicate extract on ${pageUrlNow}. Must navigate to a DIFFERENT page before extracting again.`);
          continue;
        }

        const isYouTube = /youtube\.com\/watch|youtu\.be\//i.test(pageUrlNow);
        let videoTranscript: string | null = null;
        let videoTitle: string | null = null;
        let videoChannel: string | null = null;
        let videoDate: string | null = null;

        if (isYouTube) {
          send({ type: "status", message: "Extracting video transcript..." });
          log(`Harvester: YouTube video detected. Extracting transcript.`, "agent");
          try {
            const captionData = await page.evaluate(() => {
              const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title')?.textContent?.trim()
                || document.title.replace(/ - YouTube$/, '').trim();
              const channel = document.querySelector('#channel-name a, #owner #text a, ytd-channel-name a')?.textContent?.trim() || "";
              const date = document.querySelector('#info-strings yt-formatted-string, #upload-info span')?.textContent?.trim() || "";

              const scripts = Array.from(document.querySelectorAll('script'));
              for (const script of scripts) {
                const text = script.textContent || "";
                if (text.includes('captionTracks')) {
                  const match = text.match(/"captionTracks":\s*(\[[\s\S]*?\])/);
                  if (match) {
                    try {
                      const tracks = JSON.parse(match[1]);
                      if (tracks.length > 0) {
                        const enTrack = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
                        return { title, channel, date, captionUrl: enTrack.baseUrl };
                      }
                    } catch {}
                  }
                }
              }
              return { title, channel, date, captionUrl: null };
            });

            videoTitle = captionData.title;
            videoChannel = captionData.channel;
            videoDate = captionData.date;

            if (captionData.captionUrl) {
              log(`Harvester: found caption track URL. Fetching transcript.`, "agent");
              try {
                const captionResp = await page.request.get(captionData.captionUrl);
                const captionXml = await captionResp.text();
                const textSegments = captionXml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
                if (textSegments && textSegments.length > 0) {
                  videoTranscript = textSegments
                    .map(seg => {
                      const content = seg.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
                      return content;
                    })
                    .filter(Boolean)
                    .join(' ');
                  log(`Harvester: extracted ${videoTranscript.length} chars of transcript.`, "agent");
                }
              } catch (captErr: any) {
                log(`Harvester: caption fetch failed: ${captErr.message}`, "agent");
              }
            }

            if (!videoTranscript) {
              log(`Harvester: no captions available. Trying page description/text.`, "agent");
              const pageText = await page.evaluate(() => {
                const desc = document.querySelector('#description-inline-expander, #description, ytd-text-inline-expander')?.textContent?.trim() || "";
                return desc;
              });
              if (pageText && pageText.length > 50) {
                videoTranscript = pageText;
                log(`Harvester: using video description (${pageText.length} chars) as fallback.`, "agent");
              }
            }
          } catch (ytErr: any) {
            log(`Harvester: YouTube extraction error: ${ytErr.message}`, "agent");
          }
        }

        send({ type: "status", message: isYouTube ? "Analyzing video content..." : "Searching for PDF document..." });
        log(isYouTube ? `Harvester: proceeding with video analysis.` : `Harvester: looking for embedded PDF on page.`, "agent");

        let pdfBuffer: Buffer | null = null;
        if (!isYouTube) try {
          const pdfUrl = await page.evaluate(() => {
            const pdfTab = Array.from(document.querySelectorAll('a')).find(a => {
              const text = (a.innerText || "").trim().toLowerCase();
              return text === 'pdf' || text === 'view pdf' || text === 'download pdf';
            }) as HTMLAnchorElement | undefined;
            if (pdfTab?.href) return pdfTab.href;

            const hrefPdf = Array.from(document.querySelectorAll('a')).find(a => {
              const href = (a as HTMLAnchorElement).href || "";
              return href.includes('/pdf') || href.endsWith('.pdf');
            }) as HTMLAnchorElement | undefined;
            if (hrefPdf?.href) return hrefPdf.href;

            const exactPdf = document.querySelector('a[href$=".pdf"]') as HTMLAnchorElement | null;
            if (exactPdf) return exactPdf.href;

            const anyPdfLink = document.querySelector('a[href*=".pdf"], a[href*="PDF"]') as HTMLAnchorElement | null;
            if (anyPdfLink) return anyPdfLink.href;

            const dropdownPdf = document.querySelector('div.dropdown-menu a[href*=".pdf"], ul.dropdown-menu a[href*=".pdf"], .dropdown-menu a[href*=".pdf"]') as HTMLAnchorElement | null;
            if (dropdownPdf) return dropdownPdf.href;

            const embed = document.querySelector('embed[type="application/pdf"], embed[src*=".pdf"]') as HTMLEmbedElement | null;
            if (embed?.src) return embed.src;

            const iframe = document.querySelector('iframe[src*=".pdf"]') as HTMLIFrameElement | null;
            if (iframe?.src) return iframe.src;

            const obj = document.querySelector('object[data*=".pdf"]') as HTMLObjectElement | null;
            if (obj?.data) return obj.data;

            return null;
          });

          if (pdfUrl) {
            log(`Harvester: found PDF URL: ${pdfUrl}`, "agent");
            send({ type: "status", message: "Downloading PDF document..." });

            const cookies = await page.context().cookies(pdfUrl);
            const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

            let body: Buffer | null = null;
            try {
              const response = await page.request.get(pdfUrl, {
                headers: cookieHeader ? { "Cookie": cookieHeader } : undefined,
              });
              body = await response.body();
            } catch (fetchErr: any) {
              log(`Harvester: page.request.get failed: ${fetchErr.message}. Trying native fetch.`, "agent");
            }

            if (!body || body.length < 500) {
              try {
                const nativeResp = await fetch(pdfUrl, {
                  headers: {
                    ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/pdf,*/*",
                    "Referer": pageUrlNow,
                  },
                  redirect: "follow",
                });
                if (nativeResp.ok) {
                  const ab = await nativeResp.arrayBuffer();
                  body = Buffer.from(ab);
                  log(`Harvester: native fetch got ${body.length} bytes.`, "agent");
                }
              } catch (nativeErr: any) {
                log(`Harvester: native fetch also failed: ${nativeErr.message}`, "agent");
              }
            }

            if (!body || body.length < 500) {
              try {
                log(`Harvester: trying direct navigation to PDF URL.`, "agent");
                const navResp = await page.goto(pdfUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
                if (navResp) {
                  body = await navResp.body();
                  log(`Harvester: navigation fetch got ${body?.length || 0} bytes.`, "agent");
                }
                await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {
                  log(`Harvester: goBack failed, navigating to original page.`, "agent");
                  page.goto(pageUrlNow, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
                });
              } catch (navErr: any) {
                log(`Harvester: navigation fetch failed: ${navErr.message}`, "agent");
                await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {
                  page.goto(pageUrlNow, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
                });
              }
            }

            if (body && body.length > 500) {
              const headerChunk = body.slice(0, 1024).toString("ascii");
              if (headerChunk.includes("%PDF")) {
                pdfBuffer = body;
                log(`Harvester: valid PDF confirmed (${(body.length / 1024).toFixed(1)} KB).`, "agent");
              } else {
                log(`Harvester: downloaded file is not a valid PDF (${body.length} bytes). Falling back to text.`, "agent");
              }
            } else {
              log(`Harvester: PDF response too small (${body?.length || 0} bytes).`, "agent");
            }
          } else {
            log(`Harvester: no PDF link/embed found on page.`, "agent");
          }
        } catch (e: any) {
          log(`Harvester: PDF extraction failed: ${e.message}`, "agent");
        }

        if (shouldStop()) break;

        let lawyerOutput = action.extractedData || "";

        if (isYouTube && videoTranscript) {
          send({ type: "status", message: "Analyzing video content..." });
          log(`Analyst: sending ${videoTranscript.length} chars of transcript to Gemini.`, "agent");
          try {
            const safeTitle = (videoTitle || "Video Title").replace(/"/g, '\\"');
            const safeChannel = (videoChannel || "Unknown").replace(/"/g, '\\"');
            const safeDate = (videoDate || "").replace(/"/g, '\\"');
            const videoPrompt = `You are an expert content analyst and researcher. The user's goal is: "${goal}". Read this YouTube video transcript and write an EXTENSIVE, detailed analysis of AT LEAST 800 words. Structure your analysis into these sections:

1. VIDEO OVERVIEW: What is this video about? Who is the speaker/creator and what is the context?
2. MAIN ARGUMENTS & KEY POINTS: What are the primary arguments, claims, or topics discussed? Detail each major point thoroughly.
3. SUPPORTING EVIDENCE & EXAMPLES: What evidence, data, stories, or examples does the speaker use to support their points?
4. NOTABLE QUOTES & MOMENTS: Highlight any particularly impactful statements or pivotal moments in the video.
5. CRITICAL ANALYSIS: What are the strengths and weaknesses of the arguments presented? Are there any biases or gaps?
6. CONCLUSIONS & TAKEAWAYS: What are the final conclusions, and what should the viewer take away from this content?

Write each section as a detailed paragraph. Be thorough — this is for a premium intelligence report. Return ONLY a valid JSON array with no markdown: [{"title": "${safeTitle}", "court": "Channel: ${safeChannel}", "date": "${safeDate}", "docket": "", "content": "Your extensive 6-section analysis here"}].\n\nVideo transcript:\n${videoTranscript.slice(0, 30000)}`;
            const analystResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash-lite",
              contents: [{ role: "user", parts: [{ text: videoPrompt }] }],
            });
            let analystText = analystResponse.text?.trim() || "";
            analystText = analystText
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```\s*$/, "")
              .trim();
            if (analystText.length > 50 && analystText.includes("[")) {
              lawyerOutput = analystText;
              log(`Analyst: produced ${analystText.length} char video analysis.`, "agent");
            }
          } catch (e: any) {
            log(`Video analysis failed: ${e.message}`, "agent");
          }
        } else if (isYouTube && !videoTranscript) {
          send({ type: "status", message: "No transcript found. Analyzing visible page content..." });
          log(`Harvester: no transcript available, falling back to page text.`, "agent");
          try {
            let fullText = await page.evaluate(() => document.body.innerText);
            fullText = fullText.replace(/\t/g, " ").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
            if (fullText.length > 200) {
              const safeTitleFb = (videoTitle || "Video").replace(/"/g, '\\"');
              const safeChannelFb = (videoChannel || "Unknown").replace(/"/g, '\\"');
              const safeDateFb = (videoDate || "").replace(/"/g, '\\"');
              const videoPrompt = `You are an expert content analyst. The user's goal is: "${goal}". This is text from a YouTube video page (no transcript was available). Write a detailed analysis of AT LEAST 800 words based on all available information. Structure into these sections:

1. VIDEO OVERVIEW: What is the video about and who created it?
2. KEY TOPICS DISCUSSED: Main subjects and arguments covered
3. DETAILS FROM DESCRIPTION: Important information from the video description
4. COMMUNITY RESPONSE: Notable points from comments or engagement metrics
5. CRITICAL ASSESSMENT: Strengths, weaknesses, and overall quality
6. CONCLUSIONS: Key takeaways and relevance to the user's goal

Write each section as a detailed paragraph. Return ONLY a valid JSON array: [{"title": "${safeTitleFb}", "court": "Channel: ${safeChannelFb}", "date": "${safeDateFb}", "docket": "", "content": "Your extensive 6-section analysis here"}].\n\nPage text:\n${fullText.slice(0, 30000)}`;
              const analystResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash-lite",
                contents: [{ role: "user", parts: [{ text: videoPrompt }] }],
              });
              let analystText = analystResponse.text?.trim() || "";
              analystText = analystText
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```\s*$/, "")
                .trim();
              if (analystText.length > 50 && analystText.includes("[")) {
                lawyerOutput = analystText;
                log(`Analyst: produced ${analystText.length} char page text analysis.`, "agent");
              }
            }
          } catch (e: any) {
            log(`YouTube page text fallback failed: ${e.message}`, "agent");
          }
        } else if (pdfBuffer) {
          send({ type: "status", message: "Legal analyst reading PDF document..." });
          log(`Lawyer: sending PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB) to Gemini for analysis.`, "agent");
          try {
            const pdfBase64 = pdfBuffer.toString("base64");
            const lawyerPrompt = `You are a Senior Legal Partner at a top-tier law firm. The user's goal is: "${goal}". Read this official court PDF and write an EXTENSIVE, highly detailed legal analysis of AT LEAST 800 words organized into these sections:

1. CASE BACKGROUND & PARTIES: Who are the parties, what is the dispute about, and what is the factual context?
2. PROCEDURAL HISTORY: How did this case arrive at this court? What happened in lower courts?
3. KEY LEGAL ISSUES: What are the central legal questions the court must resolve?
4. COURT'S ANALYSIS & REASONING: How did the court analyze each issue? What legal tests or standards were applied?
5. IMPORTANT PRECEDENTS CITED: Which prior cases did the court rely on, and how were they applied?
6. CONTRADICTIONS & DISSENTING OPINIONS: Identify any contradictory arguments, conflicting statements, or dissenting opinions.
7. HOLDING & VERDICT: What did the court ultimately decide?
8. PRACTICAL IMPLICATIONS: What does this ruling mean for future cases or parties in similar situations?

Write each section as a detailed paragraph. Be thorough — this is for a premium legal intelligence report. Return ONLY a valid JSON array with NO markdown: [{"title": "Case Name", "court": "Court", "date": "Date", "docket": "Docket", "content": "Your extensive analysis here with all 8 sections"}]. For list requests, return multiple objects.`;
            const lawyerResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash-lite",
              contents: [{
                role: "user",
                parts: [
                  { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
                  { text: lawyerPrompt },
                ],
              }],
            });
            let lawyerText = lawyerResponse.text?.trim() || "";
            lawyerText = lawyerText
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```\s*$/, "")
              .trim();
            if (lawyerText.length > 50 && lawyerText.includes("[")) {
              lawyerOutput = lawyerText;
              log(`Lawyer: produced ${lawyerText.length} char PDF analysis.`, "agent");
            } else {
              log(`Lawyer: PDF response invalid, using vision extract fallback.`, "agent");
            }
          } catch (e: any) {
            log(`Lawyer PDF analysis failed: ${e.message}. Using vision extract fallback.`, "agent");
          }
        } else {
          send({ type: "status", message: "No PDF found. Analyzing page text..." });
          log(`Harvester: no PDF available, falling back to DOM text extraction.`, "agent");
          try {
            let fullText = await page.evaluate(() => document.body.innerText);
            fullText = fullText.replace(/\t/g, " ").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
            if (fullText.length > 200) {
              log(`Lawyer: sending ${fullText.length} chars of page text to Gemini.`, "agent");
              const lawyerPrompt = `You are a Senior Legal Analyst preparing a premium intelligence report. The user's goal is: "${goal}". Read this webpage text and write an EXTENSIVE, detailed legal analysis of AT LEAST 800 words. Structure your analysis into these sections:

1. CASE BACKGROUND & PARTIES: Identify all parties and the nature of the dispute
2. PROCEDURAL HISTORY: How the case progressed through the courts
3. KEY LEGAL ISSUES: The central legal questions at stake
4. ANALYSIS & REASONING: How the court or parties addressed each issue
5. IMPORTANT PRECEDENTS: Any cited cases or legal authorities referenced
6. HOLDING & VERDICT: The final decision and its basis
7. PRACTICAL IMPLICATIONS: What this means going forward

Write each section as a thorough paragraph. Ignore UI menus, navigation links, and ads. Return ONLY a valid JSON array with no markdown: [{"title": "Case Name", "court": "Court", "date": "Date", "docket": "Docket Number", "content": "Your extensive 7-section analysis here"}]. For list requests, return multiple objects.\n\nWebpage text:\n${fullText.slice(0, 30000)}`;
              const lawyerResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash-lite",
                contents: [{ role: "user", parts: [{ text: lawyerPrompt }] }],
              });
              let lawyerText = lawyerResponse.text?.trim() || "";
              lawyerText = lawyerText
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```\s*$/, "")
                .trim();
              if (lawyerText.length > 50 && lawyerText.includes("[")) {
                lawyerOutput = lawyerText;
                log(`Lawyer: produced ${lawyerText.length} char text analysis.`, "agent");
              }
            }
          } catch (e: any) {
            log(`DOM text fallback failed: ${e.message}`, "agent");
          }
        }

        if (shouldStop()) break;

        extractedUrls.add(pageUrlNow);
        extractCount++;
        const extractedPageUrl = page.url();
        previousActions.push(`Extracted case from ${extractedPageUrl}. DO NOT extract this page again. Navigate to the Authorities or Cited-by section and click an individual precedent case link.`);

        if (isPrecedentGoal && extractCount < MAX_EXTRACTS) {
          collectedReports.push(lawyerOutput);
          log(`Precedent research: extracted case ${extractCount} of ${MAX_EXTRACTS}. Continuing to find more.`, "agent");
          send({ type: "status", message: `Extracted case ${extractCount} of ${MAX_EXTRACTS}. Navigating to next precedent...` });
          send({ type: "log", message: `Case ${extractCount} extracted. Looking for precedents...` });
          if (step >= MAX_STEPS) {
            let mergedCases: any[] = [];
            for (const report of collectedReports) {
              try {
                const cleaned = report.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
                const arrMatch = cleaned.match(/\[[\s\S]*\]/);
                if (arrMatch) {
                  const parsed = JSON.parse(arrMatch[0]);
                  if (Array.isArray(parsed)) mergedCases.push(...parsed);
                }
              } catch {}
            }
            send({ type: "report", message: JSON.stringify(mergedCases) });
            log(`Precedent research: max steps reached after ${mergedCases.length} cases.`, "agent");
            send({ type: "done", message: "Precedent research complete (max steps reached)." });
            break;
          }
          continue;
        }

        if (isPrecedentGoal && collectedReports.length > 0) {
          collectedReports.push(lawyerOutput);
          let mergedCases: any[] = [];
          for (const report of collectedReports) {
            try {
              const cleaned = report.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
              const arrMatch = cleaned.match(/\[[\s\S]*\]/);
              if (arrMatch) {
                const parsed = JSON.parse(arrMatch[0]);
                if (Array.isArray(parsed)) mergedCases.push(...parsed);
              }
            } catch {}
          }
          const finalReport = JSON.stringify(mergedCases);
          send({ type: "report", message: finalReport });
          log(`Precedent research complete: ${mergedCases.length} cases collected.`, "agent");
          send({ type: "log", message: `Precedent research complete — ${mergedCases.length} cases in report.` });
          send({ type: "done", message: "Precedent research complete." });
          break;
        }

        send({ type: "report", message: lawyerOutput });
        log(`Extract action completed. Data extracted successfully.`, "agent");
        send({ type: "log", message: "Data extracted successfully." });
        send({ type: "done", message: "Extraction complete." });
        break;
      }

      if (action.action === "done") {
        await removeMarkers(page);

        if (isPrecedentGoal && collectedReports.length > 0) {
          let mergedCases: any[] = [];
          for (const report of collectedReports) {
            try {
              const cleaned = report.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
              const arrMatch = cleaned.match(/\[[\s\S]*\]/);
              if (arrMatch) {
                const parsed = JSON.parse(arrMatch[0]);
                if (Array.isArray(parsed)) mergedCases.push(...parsed);
              }
            } catch {}
          }
          send({ type: "report", message: JSON.stringify(mergedCases) });
          log(`Precedent research: agent signaled done with ${mergedCases.length} collected cases.`, "agent");
          send({ type: "done", message: "Precedent research complete." });
          break;
        }

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
          await moveCursorFluidly(page, cursorX, cursorY, target.x, target.y, send, step);
          cursorX = target.x;
          cursorY = target.y;
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
          await moveCursorFluidly(page, cursorX, cursorY, target.x, target.y, send, step);
          cursorX = target.x;
          cursorY = target.y;
          await page.mouse.click(target.x, target.y);
          await page.waitForTimeout(400);
          try {
            await page.evaluate(({x, y}) => {
              const el = document.elementFromPoint(x, y) as HTMLElement;
              if (el) {
                el.style.transition = "box-shadow 0.3s ease";
                el.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.5)";
                setTimeout(() => { el.style.boxShadow = ""; }, 1500);
              }
            }, { x: target.x, y: target.y });
          } catch {}
          await page.waitForTimeout(300);
          const text = action.textToType;
          for (let i = 0; i < text.length; i++) {
            await page.keyboard.type(text[i], { delay: 220 });
            const snap = await takeScreenshot(page);
            send({ type: "screenshot", screenshot: snap, step });
          }
          await new Promise(r => setTimeout(r, 800));
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

      await new Promise(r => setTimeout(r, 2000));

      if (step === MAX_STEPS) {
        if (isPrecedentGoal && collectedReports.length > 0) {
          let mergedCases: any[] = [];
          for (const report of collectedReports) {
            try {
              const cleaned = report.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
              const arrMatch = cleaned.match(/\[[\s\S]*\]/);
              if (arrMatch) {
                const parsed = JSON.parse(arrMatch[0]);
                if (Array.isArray(parsed)) mergedCases.push(...parsed);
              }
            } catch {}
          }
          send({ type: "report", message: JSON.stringify(mergedCases) });
          log(`Precedent research: max steps reached. Delivering ${mergedCases.length} collected cases.`, "agent");
          send({ type: "done", message: "Precedent research complete (max steps reached)." });
        } else {
          send({ type: "status", message: "Reached maximum steps." });
          send({ type: "done", message: "Maximum steps reached." });
        }
      }
    }
  } catch (err: any) {
    log(`Agent error: ${err.message}`, "agent");
    send({ type: "error", message: err.message });
  } finally {
    if (localBrowser) {
      try {
        await localBrowser.close();
      } catch {}
    }
  }
}
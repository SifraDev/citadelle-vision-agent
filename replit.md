# UI Navigator Agent

A multimodal web agent application that uses the Set-of-Mark (SoM) technique with Gemini 2.5 Flash to automate web browser navigation through natural language goals.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + WebSocket (ws)
- **Browser Automation**: Playwright with system Chromium
- **AI**: Google Gemini 2.5 Flash via @google/genai SDK

## Key Files

- `server/agent.ts` - Core agent loop: marker injection, screenshot capture, Gemini vision analysis, action execution
- `server/routes.ts` - WebSocket server on `/ws` path for real-time communication
- `client/src/pages/dashboard.tsx` - Main dashboard with live viewer and logs
- `client/src/hooks/use-websocket.ts` - WebSocket client hook for agent communication
- `shared/schema.ts` - Shared TypeScript types for WebSocket messages and agent actions

## How It Works

1. User enters a URL and natural language goal
2. Playwright opens a headless browser to the URL
3. `injectMarkers()` overlays numbered red bounding boxes on interactive elements
4. Screenshot is taken and sent to Gemini 2.5 Flash with the goal
5. AI returns a JSON action (click/type/scroll/extract/done)
6. Action is executed on the page, markers removed
   - `extract` action triggers multi-agent pipeline: Harvester finds PDF (via download links, embeds, iframes) and downloads it; Lawyer agent sends the PDF natively to Gemini (application/pdf inline data) for deep legal analysis; falls back to DOM text if no PDF found; result sent as structured JSON report
7. Loop repeats until done or max steps (15)
8. All screenshots and logs stream to the frontend via WebSocket

## Frontend Features

- **Jarvis Voice UI**: Single large microphone button — no typing required. Records raw audio via MediaRecorder API and sends base64-encoded audio to the backend
- **Native Audio Parser**: Backend `jarvis-parser.ts` sends raw audio directly to Gemini's native audio understanding (inlineData) to extract URL + goal — no browser SpeechRecognition used
- **Legal Brief View**: Premium structured report UI with dark navy header (#0B132B), research query display, and case cards. Backend extracts data as structured JSON array (`[{title, court, date, docket, content}]`). Frontend parses JSON into styled cards with fallback for raw text
- **Open Full Report**: Opens a print-ready HTML report in a new browser tab with the same premium styling. Users can Print → Save as PDF for perfectly formatted documents
- **Downloads**: `.docx` export via `docx` library with structured headings and metadata for Google Docs/Word compatibility
- **Text-to-Speech**: Premium voice selection — searches for Google/Samantha/Daniel/Premium/Natural voices via `speechSynthesis.getVoices()`, with professional pitch (1.0) and rate (1.05). Fires immediately on report delivery
- **Voice Activity Detection (VAD)**: AudioContext + AnalyserNode monitors microphone volume in real-time. Auto-stops recording after 3s of silence once speech is detected. Shows reactive volume pulse and auto-submit indicator
- **Session Reset**: "New Mission" button appears after run completion to clear state and return to mic view

## Environment Variables

- `GEMINI_API_KEY` - Google Gemini API key (required)

## System Dependencies

- Chromium (via Nix) with required libraries for headless browser operation
- Playwright npm package for browser automation

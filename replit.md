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
5. AI returns a JSON action (click/type/scroll/done)
6. Action is executed on the page, markers removed
7. Loop repeats until done or max steps (15)
8. All screenshots and logs stream to the frontend via WebSocket

## Environment Variables

- `GEMINI_API_KEY` - Google Gemini API key (required)

## System Dependencies

- Chromium (via Nix) with required libraries for headless browser operation
- Playwright npm package for browser automation

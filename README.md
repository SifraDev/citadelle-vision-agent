# 🏛️ Citadelle Vision
**An Autonomous Multimodal UI Navigator for Legal Research**

Citadelle Vision is a next-generation AI agent built for the **Gemini Live Agent Challenge**. It uses Google Gemini Multimodal to "see" and navigate complex web interfaces (like CourtListener, Oyez, and YouTube), turning 5 hours of manual legal research into a 30-second exportable executive brief.

## 🚀 Features
- **Visual DOM Interaction:** Uses Playwright to inject bounding boxes into the UI, allowing Gemini to seamlessly click, type, and extract data using computer vision.
- **Autonomous Navigation:** Solves complex multi-step tasks (e.g., finding a specific precedent case) without relying on rigid API endpoints.
- **Multimodal Extraction:** Capable of reading embedded PDFs, transcribing YouTube videos, and scraping complex HTML dynamically.
- **Cloud Native:** Fully containerized and deployed on Google Cloud Run.

## 🛠️ Tech Stack
- **AI Model:** Google Gemini Multimodal (via `@google/genai` SDK)
- **Agent Framework:** Playwright (Headless Chromium)
- **Backend:** Node.js, Express, WebSockets
- **Frontend:** React, Vite, Tailwind CSS
- **Infrastructure:** Docker, Google Cloud Run

---

## 💻 Spin-up Instructions (Local Development)

To run Citadelle Vision locally, follow these steps:

### 1. Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- A valid Google Gemini API Key

### 2. Clone the Repository
```bash
git clone https://github.com/SifraDev/citadelle-vision-agent.git
cd citadelle-vision-agent
```

### 3. Install Dependencies
```bash
npm install
# Ensure Playwright browser binaries are installed
npx playwright install chromium
```

### 4. Environment Variables
Create a `.env` file in the root directory and add your Gemini API Key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 5. Start the Application
```bash
npm run dev
```
---

## ☁️ Google Cloud Deployment

This project is fully containerized and designed to run on **Google Cloud Run**. The included `Dockerfile` utilizes the official `mcr.microsoft.com/playwright:jammy` base image to ensure the headless browser has all necessary system dependencies to execute the agentic loop in a serverless environment.

**Deployment Steps:**
1. Connect this GitHub repository to Google Cloud Build.
2. Select **Dockerfile** as the build type.
3. Set the service to use **2 to 4 GiB of Memory** and **2 CPUs** (required for Playwright).
4. Add the `GEMINI_API_KEY` to the Cloud Run Environment Variables.
5. Deploy.

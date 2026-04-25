# Architecture & Data Flow Guide

Welcome to the **AI Code Assistant Platform**! This document explains how the entire codebase is structured, what each microservice does, and how data flows from the moment you hit "Send" to when the AI responds on your screen.

---

## 1. System Components (Microservices)

The application is orchestrated using Docker Compose and consists of three main services plus your host machine's Ollama instance.

### A. Frontend (`/frontend`)
- **Tech Stack**: React 18, Vite, TypeScript, Nginx.
- **Architecture**: Domain-Driven / Feature-Sliced Design (SOLID principles).
- **Responsibility**: Provides the ChatGPT-like UI. It manages state, renders markdown, handles syntax highlighting, and provides the sleek animated dark/light mode toggles.
- **Key Folders**:
  - `src/app/`: Core app bootstrapping, global CSS, and root layout.
  - `src/core/`: Application-wide types and HTTP API clients.
  - `src/features/`: Isolated domain logic (`chat` handles messaging logic; `models` handles the sidebar).
  - `src/shared/`: Generic components like buttons and the ThemeContext.

### B. Backend API Gateway (`/backend`)
- **Tech Stack**: Node.js, NestJS, TypeScript.
- **Responsibility**: Acts as the central "traffic cop" (API Gateway) for the frontend. It validates incoming requests, handles errors globally, and abstracts the AI service layer. This is where you would add authentication (e.g., JWT guards), rate limiting, and database saving in the future.
- **Key Files**: 
  - `src/modules/ai/ai.controller.ts`: The entry endpoints for `/ai/models` and `/ai/generate/stream`.
  - `src/modules/ai/ai.service.ts`: The business logic that communicates with the Python AI Service.

### C. AI Engine Service (`/ai-service`)
- **Tech Stack**: Python, FastAPI, Uvicorn.
- **Responsibility**: Strictly handles LLM (Large Language Model) orchestration. It formats system prompts, manages streaming connections, and communicates with the actual AI models. If you ever wanted to switch to OpenAI or Anthropic, you would only have to modify this service.
- **Key Files**: 
  - `app/main.py`: Exposes the FastAPI endpoints.
  - `app/services/ollama_client.py`: Handles HTTP streams directly to your local Ollama engine.

### D. Ollama (Host Machine)
- **Tech Stack**: Ollama.
- **Responsibility**: The local inference engine that actually runs the neural networks (like `deepseek-coder` or `qwen`) on your Mac's GPU/CPU.

---

## 2. The Data Flow: Step-by-Step

What exactly happens when a user types a prompt and presses submit?

1. **User Interaction (`frontend`)**
   - The user clicks submit in `ChatComposer.tsx`.
   - `useAiAssistant.ts` appends a dummy "Assistant" message with a `streaming` status to the UI.
   - It opens an HTTP connection to `/ai/generate/stream` using the native Fetch API.

2. **Nginx Reverse Proxy (`frontend/nginx.conf`)**
   - Because the React app is served by Nginx on port `8080`, the browser sends the request to `http://localhost:8080/ai/generate/stream`.
   - Nginx intercepts any request starting with `/ai/` and instantly proxies it over Docker's internal network to `http://backend:3000`.

3. **NestJS Gateway (`backend`)**
   - `ai.controller.ts` receives the POST request.
   - `ai.service.ts` converts the request into a Node stream and forwards it to `http://ai-service:8000/generate/stream`.

4. **FastAPI Engine (`ai-service`)**
   - `main.py` receives the request.
   - `ollama_client.py` makes a request to `http://host.docker.internal:11434/api/generate` (your Mac's Ollama instance).
   - As Ollama generates words (tokens) one by one, Python yields these tokens via Server-Sent Events (SSE) / NDJSON.

5. **Streaming Back Up the Chain**
   - The tokens stream backward continuously: **Ollama ➔ Python ➔ Node.js ➔ Nginx ➔ Browser**.

6. **UI Rendering (`frontend`)**
   - In `useAiAssistant.ts`, a `TextDecoder` reads the incoming stream byte-by-byte.
   - Every time a new word arrives, it updates the React state.
   - `ChatWindow.tsx` re-renders, and the new word is instantly parsed by `MarkdownRenderer.tsx` into syntax-highlighted code.
   - If the user is scrolled to the bottom, the "Smart Scroll" logic keeps pushing the view down automatically.

---

## 3. How to Extend the Codebase

**Adding a new Database (e.g., MongoDB / PostgreSQL):**
1. Add the database image to `docker-compose.yml`.
2. Connect to it strictly inside the `/backend` (NestJS) using TypeORM or Prisma.
3. Create a `messages` table/collection to save chat history.

**Adding new AI capabilities (e.g., Image Generation):**
1. Add a new endpoint in `/ai-service/app/main.py`.
2. Add a new route in `/backend/src/modules/ai/ai.controller.ts` that points to the Python service.
3. Call the backend route from a new feature in `/frontend/src/features/`.

**Adding a new UI Page:**
1. Create a new folder under `/frontend/src/features/` (e.g., `features/settings`).
2. Build the components.
3. Import them into `/app/App.tsx` and add a React Router if you need multiple URLs.

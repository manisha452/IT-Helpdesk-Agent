# Autonomous IT Helpdesk Agent

React + Tailwind frontend, Node/Express + MongoDB backend. An orchestrator runs GOAL > UNDERSTAND > RETRIEVE > PLAN > EXECUTE > OBSERVE > ADAPT > VERIFY > COMPLETE
over an allowlisted tool registry acting on a *simulated* IT environment. The LLM is **Ollama by default** (runs on your machine, no API key); Google Gemini is an optional alternative.

## Setup (Ollama, default)
1. Install Ollama from https://ollama.com/download and make sure it is running (on Windows/macOS the app starts the server; otherwise run `ollama serve`).
2. Pull a model that supports **tool calling**: `ollama pull llama3.1:8b` (about 5 GB; plan on roughly 8 GB of free RAM). `qwen2.5:7b` is another option. Very small models (3B and below) often call tools unreliably. Check https://ollama.com/search?c=tools for current tool-capable models.
3. Start MongoDB (local, or a free Atlas cluster) and copy its connection string.
4. Backend:
       cd backend && cp .env.example .env     # on Windows: copy .env.example .env
       # edit .env: MONGO_URI, JWT_SECRET, OLLAMA_MODEL (must match the model you pulled)
       npm install && npm run seed && npm start   # API on :5000
   Startup stops with a clear message if Ollama is not running, the model is not pulled, or `MONGO_URI` / `OLLAMA_MODEL` is missing.
5. Frontend (second terminal):
       cd frontend && npm install && npm run dev  # http://localhost:5173 (proxies /api to :5000)
Demo logins after seeding: alice@corp.test, bob@corp.test (employees), admin@corp.test (IT_ADMIN), password `Passw0rd!`.

Speed: every request makes several model calls. On CPU a response can take a minute or more; a GPU or a smaller model helps. `OLLAMA_TIMEOUT_MS` (default 180000) is the per-call timeout.

### Using Gemini instead
Set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` (free key: https://aistudio.google.com/apikey) and `GEMINI_MODEL` (a current Flash model with function calling, e.g. `gemini-2.5-flash`). Free-tier data may be used by Google, so use only synthetic data. The key stays in `backend/.env`.

## Tests
    cd backend && npm test        # 47 tests, no database, Ollama or API key needed (mocked LLM servers, in-memory store)
    RUN_OLLAMA_INTEGRATION=1 OLLAMA_MODEL=llama3.1:8b npm test   # also runs tests/ollama.integration.test.js against your real Ollama
    GEMINI_API_KEY=... GEMINI_MODEL=... npm test                 # also runs the real-Gemini test
`LLM_MODE=mock` is an explicit, labelled test mode (rule-based decisions, no LLM). The UI shows which provider/model drove each run.

## How the LLM is used
- `agent/ollamaLLM.js` (and `geminiLLM.js`) implement `classify()`, `plan()` (JSON-schema structured output) and `decideNext()`. Tool schemas and prompts are shared in `agent/toolDeclarations.js`.
- `decideNext` uses native tool calling (12 helpdesk tools + `ask_user`). The backend validates the call, executes it, and sends the *real* result back as a `tool` message; the model then chooses the next action. One call per turn.
- Local models sometimes answer in text instead of calling a tool: the agent nudges once, accepts a call printed as JSON text only if it names a declared function, and otherwise escalates safely.
- A model's claim is never proof: `verifyResolution` re-reads simulated state and the final message is built by the backend from that evidence.
- Limits: 8 tool executions per request; 2 retries for transient tool failures; 2 retries for transient LLM errors (Ollama unreachable/5xx/timeout, Gemini rate limit/5xx). Missing model, unsupported tool calling and invalid key are not retried. If the LLM is unavailable the agent escalates to a human and says so; it never reports a fix.
- Privileged actions (RESET_PASSWORD, GRANT_FILE_ACCESS) only create an approval request; `approvals.js` runs them after an IT_ADMIN approves. Urgency, security reports and authorization are backend rules the model cannot override.
- Retrieval uses a local hashed embedding (`agent/kb.js`), independent of the chat model. Swap `embed()` for a real embedding model (for example an Ollama embedding model) and re-index if you want one.

## Known limitations
MongoDB and real Ollama/Gemini calls were not run in the build sandbox (one MongoDB bug found by a user run is fixed and covered by a test). UI compiles but was not exercised in a browser. Small local models are less reliable than hosted ones. No login rate limiting. No architecture diagram or demo video yet.

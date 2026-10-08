# Memory Benchmark Case Creation Portal

A Google Docs-style web app where subject-matter experts write benchmark cases for agentic memory in enterprise chatbots. Each case is run against Claude; a case is **kept only if it stumps the model**. Every submission is graded by an LLM judge and logged to Google Sheets.

## Setup

### 1. Google Sheets service account

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Sheets API**.
2. Create a **Service Account**, generate a JSON key, and download it.
3. Create a Google Sheet with two tabs: **Passed** and **All submissions**.
4. Share the sheet with the service account email (Editor role).

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_SERVICE_ACCOUNT_JSON='...'   # paste the full JSON on one line, or use jq -c . key.json
SHEET_ID=                           # from the Google Sheets URL
LLM_MODE=live                       # or "mock" for local dev without API calls
APP_PASSCODE=                       # optional: locks the app behind a passcode
```

For Vercel: paste each value in the dashboard (Settings → Environment Variables). For `GOOGLE_SERVICE_ACCOUNT_JSON`, paste the raw JSON; Vercel handles multiline values.

### 3. Run locally

```bash
npm install
npm run dev          # live mode (requires API keys)
LLM_MODE=mock npm run dev   # mock mode — no API keys needed
```

Hit `http://localhost:3000/api/health` to verify credentials and Sheets access.

### 4. Run tests

```bash
LLM_MODE=mock npm test
```

All tests use mock providers and an in-memory Sheets client — no API keys or network access required.

### 5. Deploy to Vercel

Push to GitHub, import the repo in the [Vercel dashboard](https://vercel.com), and set the env vars above. The `vercel.json` declares the Next.js framework so the build is detected correctly.

**Set spend limits** in your Anthropic and OpenAI consoles before going live — the app has no built-in rate limiting.

---

## Findings

**Full-context Sonnet 5.5 solved every case tried**, including a 9-block, multi-trap PTO case designed to mislead with conflicting dates and partial information across multiple conversations.

**The 40k-character cap makes perfect recall easy.** When the model sees the entire memory verbatim, retrieval is trivially solved — there's nothing to retrieve. Cases only pass the 2-of-3 gate if the reasoning itself is hard, not if the information is hard to find.

**This is why the design routes memory through a swappable adapter.** With full-context delivery, the benchmark measures reasoning difficulty in isolation, which is useful for calibration but not for measuring real-world memory systems. The interesting failures should show up when memory is delivered through RAG or a summarization pipeline, where the model never sees everything at once and retrieval quality determines whether the right evidence is present at all.

**Next steps:**
- Raise the memory cap and test with longer haystacks to find the full-context reasoning ceiling
- Add memory adapters (RAG, sliding-window summarization) so the same cases test retrieval quality, not just reasoning
- Add AI assist to generate realistic filler conversations at scale, so experts can focus on writing the trap question rather than populating the surrounding context

---

## Decisions and tradeoffs

### Full-context memory prompt
Each test run receives the full conversation/document history as context. This maximizes recall fidelity but means the model sees everything, not a retrieval-filtered subset. RAG/retrieval adapters are deferred to P1.

### 2-of-3 rule
A case must stump the model in at least 2 of 3 independent runs to count as PASS. Single-run failures can be flukes; the threshold filters noise without needing many more API calls.

### Oracle check
A separate oracle run gives the model *only the evidence* (the lines the answer comes from). If the oracle also gets the answer wrong (FLAGGED outcome), the case is likely ambiguous or the expected answer is off — it needs human review rather than being counted as a stumper.

### ERROR outcome
Any provider timeout, API error, or judge response that's still unparseable after one retry produces ERROR rather than silently miscounting. This keeps the dataset clean at the cost of occasionally losing a case that would have passed.

### Sheets as storage
Google Sheets is the storage layer. No database means no ops overhead for an MVP, and the sheet is directly readable by the team. The tradeoff is that versioning and querying are limited — a proper database is the obvious P1 upgrade.

### Two providers
Claude (Anthropic) is the model under test. GPT (OpenAI Responses API) is the judge. Using a different provider as the judge reduces the risk that the judge is sympathetic to the model's outputs.

### What's deferred to P1
- RAG / retrieval adapters for real memory systems
- AI-assisted question type suggestion and starting-draft generation
- Similarity detection (deduplication)
- Proper accounts and per-user history
- Rate limiting and PII redaction
- Review UI (flagged cases are reviewed directly in the sheet for now)

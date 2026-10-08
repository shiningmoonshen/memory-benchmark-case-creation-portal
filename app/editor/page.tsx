"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { QuestionType } from "@/lib/schema";
import { validateCase, totalMemoryChars, type FieldErrors } from "@/lib/validate";
import { config } from "@/lib/config";
import examples from "@/seed/examples.json";

// ── Types ──────────────────────────────────────────────────────────────────

type BlockType = "conversation" | "transcript" | "document";

interface BlockDraft {
  _id: string;
  type: BlockType;
  date: string;
  title?: string;
  content: string;
}

interface DraftState {
  title: string;
  blocks: BlockDraft[];
  prompt: string;
  expectedAnswer: string;
  questionType: QuestionType;
  evidence: string;
}

interface SubmitResult {
  outcome: "PASS" | "FAIL" | "FLAGGED" | "ERROR";
  requestId?: string;
  submissionId?: string;
  testAnswers?: string[];
  testVerdicts?: { verdict: string; reason: string }[];
  wrongCount?: number;
  oracleAnswer?: string;
  oracleVerdict?: { verdict: string; reason: string } | null;
  errorInfo?: { stage: string; code: string; message?: string };
}

// ── Constants ──────────────────────────────────────────────────────────────

const EMPTY: DraftState = {
  title: "",
  blocks: [],
  prompt: "",
  expectedAnswer: "",
  questionType: "single-session recall",
  evidence: "",
};

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "single-session recall",   label: "Single fact from one conversation (single-session recall)" },
  { value: "multi-session reasoning", label: "Facts spread across multiple conversations (multi-session reasoning)" },
  { value: "knowledge update",        label: "Something changed over time (knowledge update)" },
  { value: "temporal reasoning",      label: "Depends on when things happened (temporal reasoning)" },
  { value: "preference recall",       label: "A preference the AI should apply (preference recall)" },
  { value: "abstention",              label: "Info was never given, so the AI should say it doesn't know (abstention)" },
  { value: "conflict resolution",     label: "Conflicting info that the AI has to sort out (conflict resolution)" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newBlock(type: BlockType): BlockDraft {
  return { _id: uid(), type, date: "", content: "" };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function EditorPage() {
  const router = useRouter();
  const [characterId, setCharacterId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [progressMsg, setProgressMsg] = useState("Running the AI…");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [mismatch, setMismatch] = useState<"none" | "warning" | "confirmed">("none");

  // Load character + draft
  useEffect(() => {
    const id = localStorage.getItem("characterId");
    if (!id) { router.push("/"); return; }
    setCharacterId(id);
    try {
      const saved = localStorage.getItem(`draft:${id}`);
      if (saved) setDraft(JSON.parse(saved));
    } catch {}
    setLoaded(true);
  }, []);

  // Autosave draft
  useEffect(() => {
    if (characterId && loaded) {
      localStorage.setItem(`draft:${characterId}`, JSON.stringify(draft));
    }
  }, [draft, characterId, loaded]);

  // Progress message cycle
  useEffect(() => {
    if (phase !== "running") { setProgressMsg("Running the AI…"); return; }
    const t = setTimeout(() => setProgressMsg("Checking answers…"), 9000);
    return () => clearTimeout(t);
  }, [phase]);

  const character = config.characters.find((c) => c.id === characterId) ?? config.characters[0];

  // ── Draft helpers ──

  const addBlock = (type: BlockType) =>
    setDraft((d) => ({ ...d, blocks: [...d.blocks, newBlock(type)] }));

  const updateBlock = (id: string, field: keyof BlockDraft, value: string) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b._id === id ? { ...b, [field]: value } : b)),
    }));

  const removeBlock = (id: string) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.filter((b) => b._id !== id) }));

  const handleEvidenceChange = (value: string) => {
    setDraft((d) => ({
      ...d,
      evidence: value,
      ...(value === "" ? { questionType: "abstention" as QuestionType } : {}),
    }));
    setMismatch("none");
  };

  const handleQuestionTypeChange = (value: QuestionType) => {
    setDraft((d) => ({ ...d, questionType: value }));
    if (value !== "abstention" && draft.evidence === "") setMismatch("warning");
    else setMismatch("none");
  };

  // ── Load example ──

  const handleShowExample = () => {
    const ex = examples[Math.floor(Math.random() * examples.length)];
    const inp = ex.caseInput as unknown as { title: string; memory: BlockDraft[]; prompt: string; expectedAnswer: string; questionType: string; evidence: string };
    setDraft({
      title: inp.title,
      blocks: inp.memory.map((b: any) => ({ ...b, _id: uid() })),
      prompt: inp.prompt,
      expectedAnswer: inp.expectedAnswer,
      questionType: inp.questionType as QuestionType,
      evidence: inp.evidence,
    });
    setErrors({});
    setMismatch("none");
  };

  // ── Submit ──

  const doSubmit = async (skipMismatchCheck = false) => {
    const memoryBlocks = draft.blocks.map(({ _id, ...b }) => b as any);
    const { valid, errors: fieldErrors, mismatch: hasMismatch } = validateCase({
      memory: memoryBlocks,
      prompt: draft.prompt,
      expectedAnswer: draft.expectedAnswer,
      questionType: draft.questionType,
      evidence: draft.evidence,
    });
    setErrors(fieldErrors);
    if (!valid) return;

    if (hasMismatch && mismatch !== "confirmed" && !skipMismatchCheck) {
      setMismatch("warning");
      return;
    }

    const parentSubmissionId = localStorage.getItem(`lastSubmission:${characterId}`) ?? undefined;

    const body = {
      characterId,
      title: draft.title.trim() || "Untitled",
      memory: memoryBlocks,
      prompt: draft.prompt,
      expectedAnswer: draft.expectedAnswer,
      questionType: draft.questionType,
      evidence: draft.evidence,
      ...(parentSubmissionId ? { parentSubmissionId } : {}),
    };

    setPhase("running");

    try {
      const passcode = localStorage.getItem("passcode") ?? "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (passcode) headers["x-passcode"] = passcode;

      const res = await fetch("/api/submit", { method: "POST", headers, body: JSON.stringify(body) });
      const data: SubmitResult = await res.json();

      if (data.submissionId && data.outcome !== "ERROR") {
        localStorage.setItem(`lastSubmission:${characterId}`, data.submissionId);
      }

      setResult(data);
      setPhase("done");
    } catch {
      setResult({ outcome: "ERROR", errorInfo: { stage: "network", code: "PROVIDER_TIMEOUT" } });
      setPhase("done");
    }
  };

  // ── Result actions ──

  const resetFresh = () => {
    setDraft(EMPTY);
    setResult(null);
    setPhase("idle");
    setErrors({});
    setMismatch("none");
    localStorage.removeItem(`lastSubmission:${characterId}`);
  };

  const keepEditing = () => {
    setResult(null);
    setPhase("idle");
  };

  // ── Derived ──

  const totalChars = totalMemoryChars(
    draft.blocks.map(({ _id, ...b }) => b as any)
  );

  // ── Guard ──

  if (!loaded) return null;

  // ── Progress screen ──

  if (phase === "running") {
    return (
      <div className="editor-page">
        <div className="progress-screen">
          <div className="progress-spinner" />
          <p className="progress-msg">{progressMsg}</p>
        </div>
      </div>
    );
  }

  // ── Result screen ──

  if (phase === "done" && result) {
    const firstWrongIdx = result.testVerdicts?.findIndex((v) => v.verdict === "incorrect") ?? 0;
    const firstWrongSlot = firstWrongIdx >= 0 ? firstWrongIdx : 0;
    const firstWrongAnswer = result.testAnswers?.[firstWrongSlot];
    const firstWrongReason = result.testVerdicts?.[firstWrongSlot]?.reason;

    return (
      <div className="editor-page">
        <div className="canvas-wrap">
          <div className="canvas result-canvas">
            {result.outcome === "PASS" && (
              <>
                <h2 className="result-heading result-pass">
                  Stumped in {result.wrongCount} of 3 runs
                </h2>
                <p className="result-label">The AI's wrong answer:</p>
                <blockquote className="result-answer">{firstWrongAnswer ?? "—"}</blockquote>
                {firstWrongReason && (
                  <p className="result-reason">{firstWrongReason}</p>
                )}
                <div className="result-actions">
                  <button className="btn-primary" onClick={resetFresh}>
                    Write another case
                  </button>
                  <button className="btn-link" onClick={keepEditing}>
                    Make a variation of this case
                  </button>
                </div>
              </>
            )}

            {result.outcome === "FAIL" && (
              <>
                <h2 className="result-heading result-fail">
                  Too easy — the AI got it right
                </h2>
                <p className="result-label">The AI's answer:</p>
                <blockquote className="result-answer">
                  {result.testAnswers?.[0] ?? "—"}
                </blockquote>
                {result.testVerdicts?.[0]?.reason && (
                  <p className="result-reason">{result.testVerdicts[0].reason}</p>
                )}
                <div className="result-actions">
                  <button className="btn-primary" onClick={resetFresh}>
                    Start from scratch
                  </button>
                  <button className="btn-link" onClick={keepEditing}>
                    Keep editing
                  </button>
                </div>
              </>
            )}

            {result.outcome === "FLAGGED" && (
              <>
                <h2 className="result-heading result-flagged">
                  This case may be ambiguous, or the expected answer may be off
                </h2>
                <p className="result-label">The AI's answer when shown only the relevant lines (the oracle's answer):</p>
                <blockquote className="result-answer">
                  {result.oracleAnswer ?? "—"}
                </blockquote>
                {result.oracleVerdict?.reason && (
                  <p className="result-reason">{result.oracleVerdict.reason}</p>
                )}
                <div className="result-actions">
                  <button className="btn-primary" onClick={keepEditing}>
                    Keep editing
                  </button>
                </div>
              </>
            )}

            {result.outcome === "ERROR" && (
              <>
                <h2 className="result-heading result-error">
                  Something went wrong on our end, so your case wasn't judged.
                </h2>
                {result.requestId && (
                  <p className="error-id">Error ID: {result.requestId}</p>
                )}
                {result.errorInfo && (
                  <p className="error-debug">
                    {result.errorInfo.stage} · {result.errorInfo.code}
                    {result.errorInfo.message ? ` · ${result.errorInfo.message}` : ""}
                  </p>
                )}
                <div className="result-actions">
                  <button className="btn-primary" onClick={() => setPhase("idle")}>
                    Try again
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Editor ──

  return (
    <div className="editor-page">
      {/* ── Toolbar chrome ── */}
      <div className="toolbar-chrome">
        {/* App bar */}
        <div className="appbar">
          <div className="appbar-left">
            <svg className="docs-logo" width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true">
              <path d="M2.5 0H13L19.5 6V22C19.5 23.1 18.6 24 17.5 24H2.5C1.4 24 0.5 23.1 0.5 22V2C0.5 0.9 1.4 0 2.5 0Z" fill="#4285f4"/>
              <path d="M13 0L19.5 6H13Z" fill="#a8c7fa"/>
              <rect x="3.5" y="11" width="11" height="1.4" rx="0.7" fill="white"/>
              <rect x="3.5" y="14.2" width="11" height="1.4" rx="0.7" fill="white"/>
              <rect x="3.5" y="17.4" width="7" height="1.4" rx="0.7" fill="white"/>
            </svg>
            <div className="appbar-meta">
              <span className="appbar-docname">{draft.title || "Untitled"}</span>
              <div className="menu-bar">
                {["File","Edit","View","Insert","Format","Tools","Help"].map(item => (
                  <button key={item} className="menu-item" tabIndex={-1}>{item}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="appbar-right">
            <button className="example-link" onClick={handleShowExample}>Show me an example</button>
            <div className="char-chip">
              <span className="char-avatar">{character.emoji}</span>
              <span className="char-name">{character.name}</span>
              <button className="char-switch" onClick={() => router.push("/")}>Switch</button>
            </div>
            <button className="btn-submit" onClick={() => doSubmit()} disabled={phase !== "idle"}>
              Submit
            </button>
          </div>
        </div>

        {/* Formatting toolbar (decorative — sells the Docs look) */}
        <div className="format-bar" aria-hidden="true">
          <button className="fmt-btn" tabIndex={-1} title="Undo">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M5 4C7 2 10 2 12 4C14 6 14 9.5 12 11.5C10 13.5 6.5 14 4 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M2 2.5L5.5 5.5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="fmt-btn" tabIndex={-1} title="Redo">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11 4C9 2 6 2 4 4C2 6 2 9.5 4 11.5C6 13.5 9.5 14 12 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M14 2.5L10.5 5.5L13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="fmt-btn" tabIndex={-1} title="Print">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="1.5" width="10" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="1.5" y="5.5" width="13" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="4" y="11" width="8" height="3.5" fill="white" stroke="currentColor" strokeWidth="1.1"/>
              <circle cx="13" cy="8.5" r="0.9" fill="currentColor"/>
            </svg>
          </button>
          <div className="fmt-sep"/>
          <button className="fmt-dropdown fmt-style" tabIndex={-1}>Normal text<span className="fmt-caret">▾</span></button>
          <button className="fmt-dropdown fmt-font" tabIndex={-1}>Arial<span className="fmt-caret">▾</span></button>
          <div className="fmt-size">
            <button className="fmt-size-btn" tabIndex={-1}>−</button>
            <span className="fmt-size-val">11</span>
            <button className="fmt-size-btn" tabIndex={-1}>+</button>
          </div>
          <div className="fmt-sep"/>
          <button className="fmt-btn fmt-b" tabIndex={-1} title="Bold">B</button>
          <button className="fmt-btn fmt-i" tabIndex={-1} title="Italic">I</button>
          <button className="fmt-btn fmt-u" tabIndex={-1} title="Underline">U</button>
          <button className="fmt-btn fmt-s" tabIndex={-1} title="Strikethrough">S</button>
          <div className="fmt-sep"/>
          <button className="fmt-btn" tabIndex={-1} title="Text color">
            <span className="fmt-color-a">A</span>
          </button>
          <button className="fmt-btn" tabIndex={-1} title="Highlight color">
            <span className="fmt-hl">ab</span>
          </button>
          <div className="fmt-sep"/>
          <button className="fmt-btn" tabIndex={-1} title="Insert link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 10a3.2 3.2 0 0 0 4.5 0l1.5-1.5a3.2 3.2 0 0 0-4.5-4.5L7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M9.5 6a3.2 3.2 0 0 0-4.5 0L3.5 7.5a3.2 3.2 0 0 0 4.5 4.5L9 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="fmt-sep"/>
          <button className="fmt-btn" tabIndex={-1} title="Align left">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="1.5" y="3" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1.5" y="6.5" width="8.5" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1.5" y="10" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1.5" y="13.5" width="8.5" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>
          <button className="fmt-btn" tabIndex={-1} title="Align center">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="1.5" y="3" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="3.75" y="6.5" width="8.5" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1.5" y="10" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="3.75" y="13.5" width="8.5" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>
          <button className="fmt-btn" tabIndex={-1} title="Align right">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="1.5" y="3" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="6" y="6.5" width="8.5" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1.5" y="10" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="6" y="13.5" width="8.5" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>
          <div className="fmt-sep"/>
          <button className="fmt-btn" tabIndex={-1} title="Numbered list">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <text x="1" y="6" fontSize="4.5" fill="currentColor" fontFamily="sans-serif">1.</text>
              <text x="1" y="9.5" fontSize="4.5" fill="currentColor" fontFamily="sans-serif">2.</text>
              <text x="1" y="13" fontSize="4.5" fill="currentColor" fontFamily="sans-serif">3.</text>
              <rect x="7" y="4.5" width="7.5" height="1.4" rx="0.7" fill="currentColor"/>
              <rect x="7" y="8" width="7.5" height="1.4" rx="0.7" fill="currentColor"/>
              <rect x="7" y="11.5" width="7.5" height="1.4" rx="0.7" fill="currentColor"/>
            </svg>
          </button>
          <button className="fmt-btn" tabIndex={-1} title="Bulleted list">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="3" cy="5.5" r="1.4" fill="currentColor"/>
              <circle cx="3" cy="9.5" r="1.4" fill="currentColor"/>
              <circle cx="3" cy="13.5" r="1.4" fill="currentColor"/>
              <rect x="6.5" y="4.5" width="8" height="1.4" rx="0.7" fill="currentColor"/>
              <rect x="6.5" y="8.5" width="8" height="1.4" rx="0.7" fill="currentColor"/>
              <rect x="6.5" y="12.5" width="8" height="1.4" rx="0.7" fill="currentColor"/>
            </svg>
          </button>
          <div className="fmt-sep"/>
          <button className="fmt-btn" tabIndex={-1} title="Decrease indent">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="1.5" y="2.5" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="5.5" y="6" width="9" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="5.5" y="9.5" width="9" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1.5" y="13" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <path d="M4.5 7.75L1.5 6L1.5 9.5Z" fill="currentColor"/>
            </svg>
          </button>
          <button className="fmt-btn" tabIndex={-1} title="Increase indent">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="1.5" y="2.5" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="5.5" y="6" width="9" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="5.5" y="9.5" width="9" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="1.5" y="13" width="13" height="1.5" rx="0.75" fill="currentColor"/>
              <path d="M1.5 7.75L4.5 6L4.5 9.5Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="canvas-wrap">
        <div className="canvas">
          {/* Notice */}
          <div className="notice">
            Use made-up or anonymized details. Don't paste confidential or personal info.
          </div>

          {/* Title */}
          <input
            className="title-field"
            placeholder="Case title (optional)"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />

          {/* 1 — Memory blocks */}
          <div className="section">
            <h3 className="section-heading">Past conversations and documents</h3>

            {draft.blocks.map((block) => (
              <div key={block._id} className="memory-block">
                <div className="block-header">
                  <span className="block-type-label">
                    {block.type === "conversation"
                      ? "Conversation"
                      : block.type === "transcript"
                      ? "Meeting transcript"
                      : "Document"}
                  </span>
                  <input
                    className="date-input"
                    type="date"
                    value={block.date}
                    onChange={(e) => updateBlock(block._id, "date", e.target.value)}
                  />
                  {(block.type === "transcript" || block.type === "document") && (
                    <input
                      className="title-input"
                      placeholder="Title (optional)"
                      value={block.title ?? ""}
                      onChange={(e) => updateBlock(block._id, "title", e.target.value)}
                    />
                  )}
                  <button className="remove-btn" onClick={() => removeBlock(block._id)}>
                    Remove
                  </button>
                </div>
                <textarea
                  className="block-content"
                  rows={5}
                  placeholder={
                    block.type === "conversation"
                      ? "User: …\nAgent: …"
                      : block.type === "transcript"
                      ? "Priya: …\nMarcus: …"
                      : "Document content…"
                  }
                  value={block.content}
                  onChange={(e) => updateBlock(block._id, "content", e.target.value)}
                />
              </div>
            ))}

            <div className="add-block-btns">
              <button className="add-btn" onClick={() => addBlock("conversation")}>
                + Conversation
              </button>
              <button className="add-btn" onClick={() => addBlock("transcript")}>
                + Meeting transcript
              </button>
              <button className="add-btn" onClick={() => addBlock("document")}>
                + Document
              </button>
            </div>
            {errors.memory && <p className="field-error">{errors.memory}</p>}
            {errors.memoryLength && <p className="field-error">{errors.memoryLength}</p>}
          </div>

          {/* 2 — Question */}
          <div className="section">
            <h3 className="section-heading">Your question</h3>
            <textarea
              className="field-textarea"
              rows={3}
              placeholder="Click to add your question"
              value={draft.prompt}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
            />
            {errors.prompt && <p className="field-error">{errors.prompt}</p>}
          </div>

          {/* 3 — Expected answer */}
          <div className="section">
            <h3 className="section-heading">What the AI should answer</h3>
            <textarea
              className="field-textarea"
              rows={3}
              placeholder="Click to add the answer you expect"
              value={draft.expectedAnswer}
              onChange={(e) => setDraft((d) => ({ ...d, expectedAnswer: e.target.value }))}
            />
            {draft.evidence === "" && (
              <p className="field-hint">
                e.g., I don't know / that info wasn't provided
              </p>
            )}
            {errors.expectedAnswer && (
              <p className="field-error">{errors.expectedAnswer}</p>
            )}
          </div>

          {/* 4 — Question type */}
          <div className="section">
            <h3 className="section-heading">Type of memory test</h3>
            <select
              className="field-select"
              value={draft.questionType}
              onChange={(e) => handleQuestionTypeChange(e.target.value as QuestionType)}
            >
              {QUESTION_TYPES.map((qt) => (
                <option key={qt.value} value={qt.value}>
                  {qt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 5 — Evidence */}
          <div className="section">
            <h3 className="section-heading">Where the answer comes from</h3>
            <textarea
              className="field-textarea"
              rows={4}
              placeholder={`Paste the lines the answer comes from. Leave this blank if the info was never given, and the AI should answer "I don't know."`}
              value={draft.evidence}
              onChange={(e) => handleEvidenceChange(e.target.value)}
            />
            {mismatch === "warning" && (
              <div className="mismatch-warning">
                Did you mean to leave evidence blank?{" "}
                <button
                  className="inline-btn"
                  onClick={() => { setMismatch("confirmed"); doSubmit(true); }}
                >
                  Yes, continue
                </button>
                {" · "}
                <button
                  className="inline-btn"
                  onClick={() => setMismatch("none")}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Memory counter */}
          <div className={`memory-counter${totalChars > config.maxMemoryChars ? " over-limit" : ""}`}>
            {totalChars.toLocaleString()} / {config.maxMemoryChars.toLocaleString()} chars
          </div>

          {/* Drafts note */}
          <p className="drafts-note">Drafts are saved only in this browser.</p>
        </div>
      </div>
    </div>
  );
}

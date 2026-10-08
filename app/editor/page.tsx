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
      {/* Toolbar */}
      <div className="toolbar">
        <button className="toolbar-btn" onClick={handleShowExample}>
          Show me an example
        </button>
        <div className="toolbar-right">
          <span className="char-avatar">{character.emoji}</span>
          <span className="char-name">{character.name}</span>
          <button className="toolbar-link" onClick={() => router.push("/")}>
            Switch
          </button>
          <button
            className="btn-submit"
            onClick={() => doSubmit()}
            disabled={phase !== "idle"}
          >
            Submit
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

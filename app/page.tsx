"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ConnectionModal } from "@/components/ConnectionModal";
import { SqlBlock } from "@/components/SqlBlock";
import { SAMPLE_SCHEMA } from "@/lib/sample-schema";
import type { ChatHistoryMessage, PipelineStatus } from "@/lib/prompt";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: PipelineStatus;
  analysis?: string;
  explanation?: string;
  sql?: string;
  missingFields?: string[];
  error?: boolean;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [schema, setSchema] = useState(SAMPLE_SCHEMA);
  const [schemaOpen, setSchemaOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<ChatHistoryMessage[]>(
    [],
  );
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const originalQuestionRef = useRef<string>("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  }

  function resetSession() {
    setSessionHistory([]);
    setAwaitingClarification(false);
    originalQuestionRef.current = "";
  }

  async function sendTurn(options: {
    text: string;
    isClarification: boolean;
    history: ChatHistoryMessage[];
    regenerate?: boolean;
  }) {
    const { text, isClarification, history, regenerate = false } = options;

    if (!schema.trim()) {
      showToast("Add a schema first (paste DDL or use the sample).");
      return;
    }

    setLoading(true);

    if (!regenerate) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: text },
      ]);
    }

    try {
      const res = await fetch("/api/generate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          schema,
          history,
          isClarification,
        }),
      });

      const data = (await res.json()) as {
        status?: PipelineStatus;
        analysis?: string;
        content?: string;
        explanation?: string;
        missing_fields?: string[];
        userTurn?: string;
        modelTurn?: string;
        error?: string;
      };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: data.error || "Failed to generate SQL",
            error: true,
          },
        ]);
        return;
      }

      const status: PipelineStatus =
        data.status === "sql_ready" ? "sql_ready" : "clarification_needed";
      const content = data.content?.trim() ?? "";
      const analysis = data.analysis?.trim() ?? "";
      const explanation = data.explanation?.trim() ?? "";
      const missingFields = data.missing_fields ?? [];

      const assistantMessage: ChatMessage = {
        id: uid(),
        role: "assistant",
        content,
        status,
        analysis,
        explanation: status === "sql_ready" ? explanation : undefined,
        sql: status === "sql_ready" ? content : undefined,
        missingFields:
          status === "clarification_needed" ? missingFields : undefined,
      };

      if (regenerate) {
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i -= 1) {
            if (next[i].role === "assistant" && !next[i].error) {
              next[i] = assistantMessage;
              break;
            }
          }
          return next;
        });
      } else {
        setMessages((prev) => [...prev, assistantMessage]);
      }

      const userTurn = data.userTurn ?? text;
      const modelTurn =
        data.modelTurn ??
        JSON.stringify({
          status,
          analysis,
          content,
          explanation,
          missing_fields: missingFields,
        });

      setSessionHistory([
        ...history,
        { role: "user", content: userTurn },
        { role: "assistant", content: modelTurn },
      ]);
      setAwaitingClarification(status === "clarification_needed");
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content:
            err instanceof Error ? err.message : "Network error generating SQL",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    if (awaitingClarification) {
      await sendTurn({
        text,
        isClarification: true,
        history: sessionHistory,
      });
      return;
    }

    originalQuestionRef.current = text;
    setSessionHistory([]);
    await sendTurn({
      text,
      isClarification: false,
      history: [],
    });
  }

  async function handleRegenerate() {
    const question = originalQuestionRef.current;
    if (!question || loading) return;
    resetSession();
    await sendTurn({
      text: question,
      isClarification: false,
      history: [],
      regenerate: true,
    });
  }

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && !m.error)?.id;

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            SQL Query Assistant
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Analyze → Clarify → Refine → SQL (never invents schema)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                resetSession();
              }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              New chat
            </button>
          )}
          <button
            type="button"
            onClick={() => setSchemaOpen((v) => !v)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800 lg:hidden"
          >
            {schemaOpen ? "Hide schema" : "Show schema"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${
            schemaOpen ? "flex" : "hidden"
          } w-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:flex lg:w-[380px] lg:shrink-0`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Schema</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSchema(SAMPLE_SCHEMA);
                  showToast("Loaded sample schema");
                }}
                className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                Use sample
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Load from MySQL
              </button>
            </div>
          </div>
          <textarea
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            spellCheck={false}
            placeholder="Paste CREATE TABLE statements here…"
            className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-zinc-700 outline-none dark:text-zinc-300"
          />
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Paste MySQL DDL or introspect a live database. Used only as context
            for the model.
          </p>
        </aside>

        <main
          className={`${
            schemaOpen ? "hidden lg:flex" : "flex"
          } min-w-0 flex-1 flex-col`}
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
            {messages.length === 0 && (
              <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
                <h3 className="text-base font-semibold">Ask a data question</h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  The assistant analyzes your schema first. If anything is
                  unclear it asks clarifying questions; otherwise it returns SQL
                  with a short explanation.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "Top 10 customers by total order amount",
                    "Products with stock below 20",
                    "Show revenue by region",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setInput(example)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`mx-auto flex max-w-3xl ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : message.error
                        ? "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                        : message.status === "clarification_needed"
                          ? "border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
                          : "border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {message.role === "assistant" &&
                    message.status === "clarification_needed" && (
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Clarification needed
                      </p>
                    )}

                  {message.role === "assistant" && message.analysis && (
                    <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                        Analysis:{" "}
                      </span>
                      {message.analysis}
                    </p>
                  )}

                  {!(
                    message.role === "assistant" &&
                    message.status === "sql_ready"
                  ) && (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}

                  {message.role === "assistant" &&
                    message.status === "sql_ready" &&
                    message.sql && (
                      <>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Final SQL
                        </p>
                        {message.explanation && (
                          <p className="mb-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                            {message.explanation}
                          </p>
                        )}
                        <SqlBlock
                          sql={message.sql}
                          showRegenerate={message.id === lastAssistantId}
                          regenerating={
                            loading && message.id === lastAssistantId
                          }
                          onRegenerate={() => {
                            void handleRegenerate();
                          }}
                        />
                      </>
                    )}

                  {message.missingFields && message.missingFields.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {message.missingFields.map((field) => (
                        <span
                          key={field}
                          className="rounded-md bg-amber-200/70 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mx-auto max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  {awaitingClarification
                    ? "Refining with your clarification…"
                    : "Analyzing question and schema…"}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {awaitingClarification && (
              <p className="mx-auto mb-2 max-w-3xl text-xs text-amber-700 dark:text-amber-300">
                Reply with the missing detail to refine the query. Click “New
                chat” to start over.
              </p>
            )}
            <div className="mx-auto flex max-w-3xl gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  awaitingClarification
                    ? "Answer the clarifying question…"
                    : "Ask a question about your data…"
                }
                disabled={loading}
                className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {awaitingClarification ? "Reply" : "Ask"}
              </button>
            </div>
          </form>
        </main>
      </div>

      <ConnectionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onLoaded={(loadedSchema, tableCount) => {
          setSchema(loadedSchema);
          setSchemaOpen(true);
          showToast(`Loaded ${tableCount} table${tableCount === 1 ? "" : "s"}`);
        }}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}

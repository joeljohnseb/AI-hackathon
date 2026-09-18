"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ConnectionModal } from "@/components/ConnectionModal";
import { SqlBlock } from "@/components/SqlBlock";
import { SAMPLE_SCHEMA } from "@/lib/sample-schema";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  explanation?: string;
  warnings?: string[];
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastQuestionRef = useRef<string>("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  }

  async function generateSql(question: string, regenerate = false) {
    if (!schema.trim()) {
      showToast("Add a schema first (paste DDL or use the sample).");
      return;
    }

    setLoading(true);
    lastQuestionRef.current = question;

    if (!regenerate) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: question },
      ]);
    }

    const history = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({
        role: m.role,
        content:
          m.role === "assistant"
            ? JSON.stringify({
                sql: m.sql ?? "",
                explanation: m.explanation ?? m.content,
                warnings: m.warnings ?? [],
              })
            : m.content,
      }));

    try {
      const res = await fetch("/api/generate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, schema, history }),
      });

      const data = (await res.json()) as {
        sql?: string;
        explanation?: string;
        warnings?: string[];
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

      const assistantMessage: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.explanation || "Generated SQL query.",
        sql: data.sql || "",
        explanation: data.explanation || "",
        warnings: data.warnings || [],
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
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    await generateSql(question);
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
            Natural language → MySQL (generate only — queries are not executed)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSchemaOpen((v) => !v)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800 lg:hidden"
        >
          {schemaOpen ? "Hide schema" : "Show schema"}
        </button>
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
                  Example: “Top 10 customers by revenue last quarter” or “Which
                  products have low stock?”
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "Top 10 customers by total order amount",
                    "Products with stock below 20",
                    "Monthly revenue for the last 6 months",
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
                        : "border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">
                    {message.role === "assistant"
                      ? message.explanation || message.content
                      : message.content}
                  </p>

                  {message.role === "assistant" && message.sql && (
                    <SqlBlock
                      sql={message.sql}
                      showRegenerate={message.id === lastAssistantId}
                      regenerating={
                        loading && message.id === lastAssistantId
                      }
                      onRegenerate={() => {
                        if (lastQuestionRef.current) {
                          void generateSql(lastQuestionRef.current, true);
                        }
                      }}
                    />
                  )}

                  {message.warnings && message.warnings.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-700 dark:text-amber-300">
                      {message.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mx-auto max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Generating MySQL query…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="mx-auto flex max-w-3xl gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your data…"
                disabled={loading}
                className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Ask
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

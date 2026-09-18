"use client";

import { useState } from "react";

type SqlBlockProps = {
  sql: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
  regenerating?: boolean;
};

export function SqlBlock({
  sql,
  onRegenerate,
  showRegenerate,
  regenerating,
}: SqlBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!sql) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 dark:border-zinc-700">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          MySQL
        </span>
        <div className="flex gap-2">
          {showRegenerate && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="rounded px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="rounded px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-zinc-800"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed text-emerald-100">
        <code>{sql}</code>
      </pre>
    </div>
  );
}

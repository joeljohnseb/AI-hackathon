"use client";

import { FormEvent, useState } from "react";

type ConnectionModalProps = {
  open: boolean;
  onClose: () => void;
  onLoaded: (schema: string, tableCount: number) => void;
};

export function ConnectionModal({
  open,
  onClose,
  onLoaded,
}: ConnectionModalProps) {
  const [mode, setMode] = useState<"fields" | "uri">("fields");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("3306");
  const [user, setUser] = useState("root");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [connectionUri, setConnectionUri] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload =
      mode === "uri"
        ? { connectionUri }
        : { host, port, user, password, database };

    try {
      const res = await fetch("/api/introspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        schema?: string;
        tableCount?: number;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "Failed to load schema");
      }

      onLoaded(data.schema ?? "", data.tableCount ?? 0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-modal-title"
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="connection-modal-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Load schema from MySQL
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Connection details are used only to run{" "}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
                SHOW TABLES
              </code>{" "}
              /{" "}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
                SHOW CREATE TABLE
              </code>
              . Generated SQL is never executed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("fields")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              mode === "fields"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            Host fields
          </button>
          <button
            type="button"
            onClick={() => setMode("uri")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              mode === "uri"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            Connection URI
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "uri" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">
                URI
              </span>
              <input
                value={connectionUri}
                onChange={(e) => setConnectionUri(e.target.value)}
                placeholder="mysql://user:pass@127.0.0.1:3306/dbname"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                required
              />
            </label>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block text-sm">
                  <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">
                    Host
                  </span>
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">
                    Port
                  </span>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">
                  User
                </span>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">
                  Database
                </span>
                <input
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  required
                />
              </label>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load schema"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

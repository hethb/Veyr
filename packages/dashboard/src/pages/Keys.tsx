import { useEffect, useState } from "react";
import {
  createKey,
  deleteKey,
  listKeys,
  type ApiKey,
  type CreatedApiKey,
} from "../lib/api";
import { formatDate } from "../lib/format";
import { copyToClipboard } from "../lib/clipboard";
import { Skeleton } from "../components/Skeleton";

export function Keys() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [copied, setCopied] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const list = await listKeys();
      setKeys(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const result = await createKey(createName.trim() || "Default");
      setCreatedKey(result);
      setCreateName("");
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteKey(confirmDeleteId);
      setConfirmDeleteId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    } finally {
      setDeleting(false);
    }
  }

  async function copyKey(value: string) {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use these keys with the PromptLens SDK. Each key is scoped to your account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
          }}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          Create new key
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {keys === null ? (
        <Skeleton className="h-32 w-full" />
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No API keys yet. Click <span className="font-medium">Create new key</span> to make one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Prefix</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Last used</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {k.key_prefix}…
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(k.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(k.last_used_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(k.id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Create new API key">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                htmlFor="key-name"
                className="block text-xs font-medium text-slate-700"
              >
                Name
              </label>
              <input
                id="key-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Production"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {createError && <ErrorBanner message={createError} />}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create key"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Show full key once */}
      {createdKey && (
        <Modal onClose={() => setCreatedKey(null)} title="Your new API key">
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This key will not be shown again. Copy it now.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
                {createdKey.key}
              </code>
              <button
                type="button"
                onClick={() => void copyKey(createdKey.key)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCreatedKey(null)}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} title="Delete API key?">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Any application using this key will immediately fail to authenticate. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {message}
    </div>
  );
}

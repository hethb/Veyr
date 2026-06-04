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
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
            Credentials
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            API Keys
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Use these keys with the PromptLens SDK. Each key is scoped to your account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
          }}
          className="border border-[#076EFF] bg-[#076EFF] px-3 py-2 text-sm font-medium text-white transition-colors hover:border-[#4FABFF] hover:bg-[#4FABFF]"
        >
          Create new key
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {keys === null ? (
        <Skeleton className="h-32 w-full" />
      ) : keys.length === 0 ? (
        <div className="border border-dashed border-white/20 bg-black p-8 text-center text-sm text-neutral-500">
          No API keys yet. Click <span className="font-medium text-neutral-300">Create new key</span> to make one.
        </div>
      ) : (
        <div className="overflow-hidden border border-white/10 bg-black/50 backdrop-blur-md">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Prefix</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Last used</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium text-white">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                    {k.key_prefix}…
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{formatDate(k.created_at)}</td>
                  <td className="px-4 py-3 text-neutral-400">{formatDate(k.last_used_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(k.id)}
                      className="border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10"
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

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Create new API key">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                htmlFor="key-name"
                className="block text-xs font-medium text-neutral-400"
              >
                Name
              </label>
              <input
                id="key-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Production"
                className="mt-1 block w-full border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-[#4FABFF]/50 focus:outline-none focus:ring-1 focus:ring-[#4FABFF]/30"
              />
            </div>

            {createError && <ErrorBanner message={createError} />}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="border border-white/10 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="border border-[#076EFF] bg-[#076EFF] px-3 py-2 text-sm font-medium text-white transition-colors hover:border-[#4FABFF] hover:bg-[#4FABFF] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create key"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {createdKey && (
        <Modal onClose={() => setCreatedKey(null)} title="Your new API key">
          <div className="space-y-4">
            <div className="border border-[#4FABFF]/30 bg-[#076EFF]/5 px-3 py-2 text-xs text-neutral-300">
              This key will not be shown again. Copy it now.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-xs text-[#4FABFF]">
                {createdKey.key}
              </code>
              <button
                type="button"
                onClick={() => void copyKey(createdKey.key)}
                className="border border-white/10 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/5"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCreatedKey(null)}
                className="border border-[#076EFF] bg-[#076EFF] px-3 py-2 text-sm font-medium text-white transition-colors hover:border-[#4FABFF] hover:bg-[#4FABFF]"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} title="Delete API key?">
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Any application using this key will immediately fail to authenticate. This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="border border-white/10 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="border border-red-500/50 bg-red-500/20 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md border border-white/10 bg-black p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 transition-colors hover:text-white"
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
    <div className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
      {message}
    </div>
  );
}

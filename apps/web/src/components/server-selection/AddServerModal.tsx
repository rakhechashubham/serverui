"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import type { NewServerInput, Server } from "@/src/lib/servers";

type AuthMethod = "password" | "private_key";

export function AddServerModal({
  server,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  server?: Server | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: NewServerInput) => Promise<void> | void;
}) {
  const editing = Boolean(server);
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(server?.name || "");
  const [address, setAddress] = useState(server?.address || "");
  const [port, setPort] = useState(String(server?.sshPort || 22));
  const [username, setUsername] = useState(server?.username || "");
  const [auth, setAuth] = useState<AuthMethod>(server?.authType || "password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    firstField.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const sshPort = Number(port);
    if (!name.trim() || !address.trim() || !username.trim()) {
      setLocalError("Server name, host, and username are required.");
      return;
    }
    if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
      setLocalError("SSH port must be a number between 1 and 65535.");
      return;
    }
    if (!editing && auth === "password" && !password.trim()) {
      setLocalError("Password is required.");
      return;
    }
    if (!editing && auth === "private_key" && !privateKey.trim()) {
      setLocalError("Private key is required.");
      return;
    }
    if (editing && auth !== server?.authType && !password.trim() && !privateKey.trim()) {
      setLocalError("Enter new credentials when changing the authentication method.");
      return;
    }
    setLocalError(null);
    await onSubmit({
      name: name.trim(),
      address: address.trim(),
      hostname: address.trim(),
      sshPort,
      username: username.trim(),
      authType: auth,
      password: password.trim() || undefined,
      privateKey: privateKey.trim() || undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-overlay-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[440px] overflow-hidden rounded-[22px] border border-white/12 bg-[#16181d]/92 shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-modal-in"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <h2 id={titleId} className="text-[15px] font-semibold text-white">
            {editing ? "Edit Server" : "Add Server"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="space-y-3.5 px-5 py-4">
          <Field label="Server Name">
            <input
              ref={firstField}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="sui-server-input"
              placeholder="Production"
              autoComplete="off"
            />
          </Field>
          <Field label="Host / IP">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="sui-server-input"
              placeholder="203.0.113.10"
              autoComplete="off"
            />
          </Field>
          <Field label="SSH Port">
            <input
              value={port}
              onChange={(event) => setPort(event.target.value)}
              className="sui-server-input"
              inputMode="numeric"
              placeholder="22"
            />
          </Field>
          <Field label="Username">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="sui-server-input"
              placeholder="deploy"
              autoComplete="username"
            />
          </Field>
          <fieldset>
            <legend className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
              Authentication
            </legend>
            <div className="flex gap-2">
              <AuthChoice
                selected={auth === "password"}
                onSelect={() => setAuth("password")}
                label="Password"
              />
              <AuthChoice
                selected={auth === "private_key"}
                onSelect={() => setAuth("private_key")}
                label="SSH Private Key"
              />
            </div>
          </fieldset>

          {auth === "password" ? (
            <Field label={editing ? "Password" : "Password"}>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="sui-server-input"
                placeholder={editing ? "Leave unchanged" : "••••••••••••"}
                autoComplete="new-password"
              />
            </Field>
          ) : (
            <Field label="Private Key">
              <textarea
                value={privateKey}
                onChange={(event) => setPrivateKey(event.target.value)}
                className="sui-server-input min-h-[140px] resize-y font-mono text-[12px] leading-5"
                placeholder={
                  editing
                    ? "Leave unchanged"
                    : "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
                }
                spellCheck={false}
                autoComplete="off"
              />
              <p className="mt-2 text-[12px] leading-5 text-white/52">
                Your private key is encrypted before being stored. Passphrase-protected keys are not
                supported yet.
              </p>
            </Field>
          )}

          {localError || error ? (
            <p className="text-[12px] text-red-300" role="alert">
              {localError || error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/25 disabled:text-white/50"
            >
              {busy ? "Saving…" : editing ? "Save Server" : "Add Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AuthChoice({
  selected,
  onSelect,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
        selected
          ? "border-white/30 bg-white/12 text-white"
          : "border-white/10 bg-white/4 text-white/70 hover:bg-white/8"
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
        {label}
      </span>
      {children}
    </label>
  );
}

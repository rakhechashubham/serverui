"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Loader2, PlugZap, X, XCircle } from "lucide-react";
import { testServerDraft } from "@/src/lib/api/server";
import { formatConnectionTestMessage } from "@/src/lib/errors";
import type { NewServerInput, Server } from "@/src/lib/servers";
import {
  FIELD_ORDER,
  validateServerForm,
  type AuthMethod,
  type FieldErrors,
  type ServerField,
  type ValidationScope,
} from "@/src/lib/server-validation";
import { formatApiError } from "@/src/lib/session";

type TestState = {
  /** Snapshot of the tested fields; the result is hidden once they change. */
  key: string;
  status: "testing" | "ok" | "fail";
  message?: string;
  code?: string;
  hostKeyFingerprint?: string;
  expectedHostKeyFingerprint?: string;
};

const NEUTRAL_BUTTON = "border-white/14 text-white/85 hover:bg-white/8 hover:text-white";

/** Icon and colours for each Test Connection state, shared by the button and result line. */
const TEST_UI = {
  idle: { Icon: PlugZap, line: "", button: NEUTRAL_BUTTON },
  testing: { Icon: Loader2, line: "bg-white/6 text-white/70", button: NEUTRAL_BUTTON },
  ok: {
    Icon: CheckCircle2,
    line: "bg-emerald-400/10 text-emerald-300",
    button: "border-emerald-400/45 bg-emerald-400/14 text-emerald-300 hover:bg-emerald-400/20",
  },
  fail: {
    Icon: XCircle,
    line: "bg-red-400/10 text-red-300",
    button: "border-red-400/45 bg-red-400/12 text-red-300 hover:bg-red-400/18",
  },
} as const;

export function AddServerModal({
  server,
  busy,
  error,
  connectAfterSave = false,
  onClose,
  onSubmit,
}: {
  server?: Server | null;
  busy?: boolean;
  error?: string | null;
  /** When true, primary action saves then the parent may connect immediately. */
  connectAfterSave?: boolean;
  onClose: () => void;
  onSubmit: (input: NewServerInput, options?: { connect?: boolean }) => Promise<void> | void;
}) {
  const editing = Boolean(server);
  const titleId = useId();
  const fieldId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(server?.name || "");
  const [groupName, setGroupName] = useState(server?.groupName || "");
  const [address, setAddress] = useState(server?.address || "");
  const [port, setPort] = useState(String(server?.sshPort || 22));
  const [username, setUsername] = useState(server?.username || "");
  const [auth, setAuth] = useState<AuthMethod>(server?.authType || "password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState(server?.hostKeyFingerprint || "");
  // Errors show after a field is edited and left, or for all fields on Save/Test.
  const [touched, setTouched] = useState<Set<ServerField>>(new Set());
  const [edited, setEdited] = useState<Set<ServerField>>(new Set());
  const [attempt, setAttempt] = useState<ValidationScope | null>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const testAbort = useRef<AbortController | null>(null);

  const values = { name, host: address, port, username, auth, password, privateKey };
  const context = { editing, savedAuth: server?.authType };
  const errors = validateServerForm(values, context, "save");
  const visibleErrors: FieldErrors = {};
  for (const field of FIELD_ORDER) {
    const shown =
      touched.has(field) || attempt === "save" || (attempt === "connection" && field !== "name");
    if (shown && errors[field]) visibleErrors[field] = errors[field];
  }
  const errorCount = Object.keys(visibleErrors).length;

  const fieldsKey = JSON.stringify([
    address.trim(),
    port,
    username.trim(),
    auth,
    password,
    privateKey,
  ]);
  const visibleTest = test?.key === fieldsKey ? test : null;
  const testUi = TEST_UI[visibleTest?.status ?? "idle"];
  const spin = visibleTest?.status === "testing" ? " animate-spin" : "";

  // Cancel an in-flight test when the modal closes.
  useEffect(() => () => testAbort.current?.abort(), []);

  useEffect(() => {
    firstField.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ids = (field: ServerField) => ({
    input: `${fieldId}-${field}`,
    error: `${fieldId}-${field}-error`,
  });

  /** Props that wire an input to its inline error. */
  function fieldProps(field: ServerField) {
    const message = visibleErrors[field];
    return {
      id: ids(field).input,
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? ids(field).error : undefined,
      onInput: () =>
        setEdited((current) => (current.has(field) ? current : new Set(current).add(field))),
      onBlur: () => {
        if (!edited.has(field)) return;
        setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));
      },
    };
  }

  /** Shows errors for the scope; focuses the first invalid field. Returns true when valid. */
  function check(scope: ValidationScope) {
    setAttempt((current) => (current === "save" ? current : scope));
    const found = validateServerForm(values, context, scope);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (!first) return true;
    const input = document.getElementById(ids(first).input);
    input?.focus();
    input?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    return false;
  }

  async function runTest(acceptedFingerprint?: string) {
    if (!check("connection")) return;
    testAbort.current?.abort();
    const controller = new AbortController();
    testAbort.current = controller;
    const key = fieldsKey;
    setTest({ key, status: "testing" });
    try {
      const result = await testServerDraft(
        {
          host: address.trim(),
          port: Number(port),
          username: username.trim(),
          authType: auth,
          ...(acceptedFingerprint || hostKeyFingerprint
            ? { hostKeyFingerprint: acceptedFingerprint || hostKeyFingerprint }
            : {}),
          password: auth === "password" ? password.trim() || undefined : undefined,
          privateKey: auth === "private_key" ? privateKey.trim() || undefined : undefined,
        },
        server?.id,
        { signal: controller.signal },
      );
      // The backend's failure text is already user-facing, so show it as-is.
      if (result.code === "host_key_unverified" || result.code === "host_key_changed") {
        setTest({
          key,
          status: "fail",
          code: result.code,
          hostKeyFingerprint: result.hostKeyFingerprint,
          expectedHostKeyFingerprint: result.expectedHostKeyFingerprint,
          message: result.error || "Verify the SSH host fingerprint before trusting this server.",
        });
      } else {
        setTest(
          result.ok
            ? { key, status: "ok", message: formatConnectionTestMessage(true, result.latencyMs) }
            : {
                key,
                status: "fail",
                code: result.code,
                message: result.error || "Connection failed.",
              },
        );
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setTest({
        key,
        status: "fail",
        message: formatConnectionTestMessage(false, undefined, formatApiError(err, "")),
      });
    }
  }

  async function submit(event: FormEvent, connect?: boolean) {
    event.preventDefault();
    if (!check("save")) return;
    if (!hostKeyFingerprint) {
      await runTest();
      return;
    }
    await onSubmit(
      {
        name: name.trim(),
        ...(editing || groupName.trim() ? { groupName: groupName.trim() } : {}),
        address: address.trim(),
        hostname: address.trim(),
        sshPort: Number(port),
        username: username.trim(),
        authType: auth,
        password: password.trim() || undefined,
        privateKey: privateKey.trim() || undefined,
        ...(hostKeyFingerprint ? { hostKeyFingerprint } : {}),
      },
      { connect },
    );
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
        className="sui-card flex max-h-full w-full max-w-[440px] flex-col overflow-hidden rounded-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] animate-modal-in"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-3.5">
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

        <form
          noValidate
          onSubmit={(event) => void submit(event, false)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
            {!editing ? (
              <p className="text-[13px] leading-5 text-white/62">
                Add an SSH host. ServerUI stores encrypted credentials and connects through the Go
                backend — the browser never opens SSH directly.
              </p>
            ) : null}
            <Field label="Server Name" error={visibleErrors.name} errorId={ids("name").error}>
              <input
                ref={firstField}
                {...fieldProps("name")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="sui-server-input"
                placeholder="Production"
                autoComplete="off"
              />
            </Field>
            <label className="block space-y-1.5">
              <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
                Group (optional)
              </span>
              <input
                id={`${fieldId}-group`}
                value={groupName}
                maxLength={48}
                onChange={(event) => setGroupName(event.target.value)}
                className="sui-server-input"
                placeholder="Production, Sandbox…"
                autoComplete="off"
              />
            </label>
            <Field label="Host / IP" error={visibleErrors.host} errorId={ids("host").error}>
              <input
                {...fieldProps("host")}
                value={address}
                onChange={(event) => {
                  const next = event.target.value;
                  setAddress(next);
                  if (next.trim() !== (server?.address || "")) setHostKeyFingerprint("");
                }}
                className="sui-server-input"
                placeholder="203.0.113.10"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="SSH Port" error={visibleErrors.port} errorId={ids("port").error}>
              <input
                {...fieldProps("port")}
                value={port}
                onChange={(event) => {
                  const next = event.target.value;
                  setPort(next);
                  if (Number(next) !== (server?.sshPort || 22)) setHostKeyFingerprint("");
                }}
                className="sui-server-input"
                inputMode="numeric"
                placeholder="22"
              />
            </Field>
            <Field label="Username" error={visibleErrors.username} errorId={ids("username").error}>
              <input
                {...fieldProps("username")}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="sui-server-input"
                placeholder="deploy"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
                Authentication
              </legend>
              <div className="flex gap-2" role="group" aria-label="Authentication method">
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
              <Field label="Password" error={visibleErrors.secret} errorId={ids("secret").error}>
                <input
                  {...fieldProps("secret")}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="sui-server-input"
                  placeholder={editing ? "Leave unchanged" : "••••••••••••"}
                  autoComplete="new-password"
                />
              </Field>
            ) : (
              <Field
                label="Private Key"
                error={visibleErrors.secret}
                errorId={ids("secret").error}
                hint="Your private key is encrypted before being stored. Passphrase-protected keys are not supported yet."
              >
                <textarea
                  {...fieldProps("secret")}
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
              </Field>
            )}
          </div>

          <div className="shrink-0 space-y-2.5 border-t border-white/8 px-5 py-3.5">
            {attempt && errorCount ? (
              <p className="text-[12px] text-red-300" role="alert">
                {errorCount === 1
                  ? "Fix the highlighted field to continue."
                  : `Fix the ${errorCount} highlighted fields to continue.`}
              </p>
            ) : error ? (
              <p className="text-[12px] text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            {visibleTest ? (
              <p
                role="status"
                aria-live="polite"
                className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] leading-5 ${testUi.line}`}
              >
                <testUi.Icon aria-hidden className={`mt-0.5 size-3.5 shrink-0${spin}`} />
                <span>
                  {visibleTest.status === "testing"
                    ? `Connecting to ${address.trim()}…`
                    : visibleTest.message}
                </span>
              </p>
            ) : null}

            {visibleTest?.hostKeyFingerprint ? (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-[12px] leading-5 text-amber-100/85">
                <p className="font-medium">
                  {visibleTest.code === "host_key_changed"
                    ? "The server presented a different host key. Verify it before replacing the saved fingerprint."
                    : "First connection: compare this fingerprint with the server administrator before trusting it."}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-amber-50">
                  {visibleTest.hostKeyFingerprint}
                </p>
                {visibleTest.expectedHostKeyFingerprint ? (
                  <p className="mt-2 break-all text-[11px] text-amber-100/65">
                    Saved fingerprint:{" "}
                    <span className="font-mono">{visibleTest.expectedHostKeyFingerprint}</span>
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={busy || visibleTest.status === "testing"}
                  onClick={() => {
                    setHostKeyFingerprint(visibleTest.hostKeyFingerprint!);
                    void runTest(visibleTest.hostKeyFingerprint);
                  }}
                  className="mt-2 rounded-full bg-amber-100/15 px-3 py-1.5 font-medium text-amber-50 transition hover:bg-amber-100/22 disabled:opacity-50"
                >
                  {visibleTest.code === "host_key_changed"
                    ? "Trust new fingerprint and retest"
                    : "Trust fingerprint and test"}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void runTest()}
              disabled={busy || visibleTest?.status === "testing"}
              data-result={visibleTest?.status}
              className={`flex w-full items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${testUi.button}`}
            >
              <testUi.Icon aria-hidden className={`size-3.5${spin}`} />
              {visibleTest?.status === "testing" ? "Testing…" : "Test Connection"}
            </button>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-white/70 transition hover:bg-white/8 hover:text-white"
              >
                Cancel
              </button>
              {connectAfterSave && !editing ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => void submit(event, true)}
                  className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/25 disabled:text-white/50"
                >
                  {busy ? "Saving…" : "Save & Connect"}
                </button>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed ${
                  connectAfterSave && !editing
                    ? "bg-white/12 text-white hover:bg-white/18 disabled:bg-white/8 disabled:text-white/40"
                    : "bg-white text-zinc-900 hover:bg-white/90 disabled:bg-white/25 disabled:text-white/50"
                }`}
              >
                {busy ? "Saving…" : "Save Server"}
              </button>
            </div>
            <p className="text-[11px] leading-5 text-white/45">
              Test Connection checks these details without saving them.
              {editing ? " A blank password or key uses the saved one." : null}
            </p>
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
      aria-pressed={selected}
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

function Field({
  label,
  error,
  errorId,
  hint,
  children,
}: {
  label: string;
  error?: string;
  errorId: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
          {label}
        </span>
        {children}
      </label>
      {error ? (
        <p
          id={errorId}
          className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-5 text-red-300"
        >
          <XCircle aria-hidden className="mt-[3px] size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {hint ? <p className="mt-2 text-[12px] leading-5 text-white/52">{hint}</p> : null}
    </div>
  );
}

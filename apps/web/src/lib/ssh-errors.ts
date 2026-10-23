/**
 * SSH Error Types for ServerUI
 *
 * These types correspond to the Go SSHError struct and RichErrorResponse.
 * Used for displaying actionable error messages to users.
 */

import type { Server } from "./servers";

// Machine-readable error codes for SSH connection failures
export type SSHErrorCode =
  // Key-related errors
  | "SSH_KEY_PASSPHRASE_PROTECTED"
  | "SSH_KEY_INVALID_FORMAT"
  | "SSH_KEY_INVALID_PEM"
  | "SSH_KEY_UNSUPPORTED_TYPE"
  | "SSH_KEY_EMPTY"

  // Network/connection errors
  | "SSH_DNS_RESOLUTION_FAILED"
  | "SSH_CONNECTION_TIMEOUT"
  | "SSH_CONNECTION_REFUSED"
  | "SSH_HOST_UNREACHABLE"
  | "SSH_CONNECTION_RESET"
  | "SSH_NOT_SSH_SERVER"

  // Authentication errors
  | "SSH_AUTH_FAILED"
  | "SSH_AUTH_METHOD_UNSUPPORTED"
  | "SSH_AUTH_NO_VALID_METHODS"

  // Host key / TOFU errors
  | "SSH_HOST_KEY_CHANGED"
  | "SSH_HOST_KEY_VERIFICATION_FAILED"

  // Generic/internal
  | "SSH_INTERNAL_ERROR"
  // Legacy codes (for backward compatibility)
  | "invalid_host"
  | "connection_refused"
  | "timeout"
  | "host_unreachable"
  | "connection_reset"
  | "not_ssh"
  | "auth_failed"
  | "invalid_private_key"
  | "passphrase_required"
  | "ssh_failed";

// Structured error response from the API
export interface SSHErrorResponse {
  code: SSHErrorCode;
  message: string; // User-facing message (what went wrong)
  hint?: string; // Actionable steps to fix
  docs_url?: string; // Link to documentation
  retryable: boolean; // Whether retrying might help
  host?: string; // Target host for context
  port?: number; // Target port for context
  username?: string; // Username for context
}

// Extended server type with structured error info
export interface ServerWithError extends Server {
  errorCode?: SSHErrorCode;
  errorHint?: string;
  errorDocs?: string;
  errorRetryable?: boolean;
}

// Test result with structured error info
export interface TestResultWithError extends TestResult {
  errorCode?: SSHErrorCode;
  errorHint?: string;
  errorDocs?: string;
  retryable?: boolean;
}

// Legacy test result (for backward compatibility)
export interface TestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  server: Server;
}

// Helper to check if an error is retryable
export function isRetryableError(
  error: SSHErrorResponse | TestResultWithError | TestResult,
): boolean {
  if ("retryable" in error && typeof error.retryable === "boolean") {
    return error.retryable;
  }
  // Fallback: network errors are typically retryable
  const retryableCodes: SSHErrorCode[] = [
    "SSH_DNS_RESOLUTION_FAILED",
    "SSH_CONNECTION_TIMEOUT",
    "SSH_CONNECTION_REFUSED",
    "SSH_HOST_UNREACHABLE",
    "SSH_CONNECTION_RESET",
    "timeout",
    "connection_refused",
    "host_unreachable",
    "connection_reset",
  ];
  if ("errorCode" in error && error.errorCode) {
    return retryableCodes.includes(error.errorCode);
  }
  return false;
}

// Anything carrying a code: an API error body or a test result.
type SSHErrorLike = Pick<SSHErrorResponse, "code" | "message"> | TestResultWithError;

// Helper to check if an error is authentication-related
export function isAuthError(error: SSHErrorLike): boolean {
  const authCodes: SSHErrorCode[] = [
    "SSH_AUTH_FAILED",
    "SSH_AUTH_METHOD_UNSUPPORTED",
    "SSH_AUTH_NO_VALID_METHODS",
    "auth_failed",
  ];
  if ("code" in error && error.code) {
    return authCodes.includes(error.code);
  }
  if ("errorCode" in error && error.errorCode) {
    return authCodes.includes(error.errorCode);
  }
  return false;
}

// Helper to check if an error is key-related
export function isKeyError(error: SSHErrorLike): boolean {
  const keyCodes: SSHErrorCode[] = [
    "SSH_KEY_PASSPHRASE_PROTECTED",
    "SSH_KEY_INVALID_FORMAT",
    "SSH_KEY_INVALID_PEM",
    "SSH_KEY_UNSUPPORTED_TYPE",
    "SSH_KEY_EMPTY",
    "invalid_private_key",
    "passphrase_required",
  ];
  if ("code" in error && error.code) {
    return keyCodes.includes(error.code);
  }
  if ("errorCode" in error && error.errorCode) {
    return keyCodes.includes(error.errorCode);
  }
  return false;
}

// Helper to check if an error is network-related
export function isNetworkError(error: SSHErrorLike): boolean {
  const networkCodes: SSHErrorCode[] = [
    "SSH_DNS_RESOLUTION_FAILED",
    "SSH_CONNECTION_TIMEOUT",
    "SSH_CONNECTION_REFUSED",
    "SSH_HOST_UNREACHABLE",
    "SSH_CONNECTION_RESET",
    "timeout",
    "connection_refused",
    "host_unreachable",
    "connection_reset",
  ];
  if ("code" in error && error.code) {
    return networkCodes.includes(error.code);
  }
  if ("errorCode" in error && error.errorCode) {
    return networkCodes.includes(error.errorCode);
  }
  return false;
}

// Human-readable title for each error code
export function getErrorTitle(code: SSHErrorCode): string {
  const titles: Record<SSHErrorCode, string> = {
    // Key errors
    SSH_KEY_PASSPHRASE_PROTECTED: "Passphrase-Protected Key",
    SSH_KEY_INVALID_FORMAT: "Unsupported Key Format",
    SSH_KEY_INVALID_PEM: "Invalid Key Format",
    SSH_KEY_UNSUPPORTED_TYPE: "Unsupported Key Type",
    SSH_KEY_EMPTY: "Missing Private Key",

    // Network errors
    SSH_DNS_RESOLUTION_FAILED: "Host Not Found",
    SSH_CONNECTION_TIMEOUT: "Connection Timed Out",
    SSH_CONNECTION_REFUSED: "Connection Refused",
    SSH_HOST_UNREACHABLE: "Host Unreachable",
    SSH_CONNECTION_RESET: "Connection Reset",
    SSH_NOT_SSH_SERVER: "Not an SSH Server",

    // Auth errors
    SSH_AUTH_FAILED: "Authentication Failed",
    SSH_AUTH_METHOD_UNSUPPORTED: "Unsupported Auth Method",
    SSH_AUTH_NO_VALID_METHODS: "No Valid Auth Methods",

    // Host key errors
    SSH_HOST_KEY_CHANGED: "Host Key Changed",
    SSH_HOST_KEY_VERIFICATION_FAILED: "Host Key Verification Failed",

    // Generic
    SSH_INTERNAL_ERROR: "Internal Error",

    // Legacy
    invalid_host: "Host Not Found",
    connection_refused: "Connection Refused",
    timeout: "Connection Timed Out",
    host_unreachable: "Host Unreachable",
    connection_reset: "Connection Reset",
    not_ssh: "Not an SSH Server",
    auth_failed: "Authentication Failed",
    invalid_private_key: "Invalid Private Key",
    passphrase_required: "Passphrase-Protected Key",
    ssh_failed: "SSH Connection Failed",
  };
  return titles[code] || "Connection Error";
}

// Get user-friendly description for an error code
export function getErrorDescription(code: SSHErrorCode): string {
  const descriptions: Record<SSHErrorCode, string> = {
    SSH_KEY_PASSPHRASE_PROTECTED:
      "Your private key is encrypted with a passphrase. ServerUI cannot use passphrase-protected keys.",
    SSH_KEY_INVALID_FORMAT:
      "The private key is not in a supported format. ServerUI only accepts OpenSSH (PEM) format keys.",
    SSH_KEY_INVALID_PEM:
      "The private key is not a valid PEM-encoded key. Ensure you've copied the entire key including BEGIN/END lines.",
    SSH_KEY_UNSUPPORTED_TYPE:
      "This key uses an unsupported algorithm (e.g., DSA). Generate a new Ed25519 or RSA key.",
    SSH_KEY_EMPTY:
      "No private key was provided. Paste your key or switch to password authentication.",

    SSH_DNS_RESOLUTION_FAILED:
      "The hostname could not be resolved. Check for typos or try using the IP address directly.",
    SSH_CONNECTION_TIMEOUT:
      "The connection timed out. Check the SSH port, firewall rules, and that the host is online.",
    SSH_CONNECTION_REFUSED:
      "The host is reachable but nothing is listening on the SSH port. Verify the port and that SSH is running.",
    SSH_HOST_UNREACHABLE:
      "The host cannot be reached from this network. Check the IP address and network connectivity.",
    SSH_CONNECTION_RESET:
      "The server closed the connection unexpectedly. This may be due to a firewall or connection limit.",
    SSH_NOT_SSH_SERVER:
      "The service on this port is not an SSH server. Verify you're using the correct SSH port.",

    SSH_AUTH_FAILED: "Authentication failed. Check your username, password, or private key.",
    SSH_AUTH_METHOD_UNSUPPORTED: "The authentication method is not supported by ServerUI.",
    SSH_AUTH_NO_VALID_METHODS:
      "The server rejected all authentication methods. Check server SSH configuration.",

    SSH_HOST_KEY_CHANGED:
      "The server's host key has changed. This may indicate a security issue or server reinstallation.",
    SSH_HOST_KEY_VERIFICATION_FAILED:
      "Host key verification failed. The server's identity could not be verified.",

    SSH_INTERNAL_ERROR: "An unexpected error occurred. Please try again or contact support.",

    // Legacy
    invalid_host: "The host name could not be found.",
    connection_refused: "Connection refused. Nothing is accepting SSH on this port.",
    timeout: "Connection timed out.",
    host_unreachable: "The host is unreachable from this machine.",
    connection_reset: "The server closed the connection.",
    not_ssh: "Not a compatible SSH server.",
    auth_failed: "Authentication failed.",
    invalid_private_key: "The private key is not valid.",
    passphrase_required: "Passphrase-protected keys are not supported.",
    ssh_failed: "The SSH connection failed.",
  };
  return descriptions[code] || "An unknown error occurred.";
}

// Get actionable hint for an error code
export function getErrorHint(code: SSHErrorCode): string {
  const hints: Record<SSHErrorCode, string> = {
    SSH_KEY_PASSPHRASE_PROTECTED:
      "Remove the passphrase: ssh-keygen -p -f /path/to/key -P 'old_passphrase' -N ''",
    SSH_KEY_INVALID_FORMAT:
      "Convert PuTTY .ppk keys: puttygen key.ppk -O private-openssh -o key.pem",
    SSH_KEY_INVALID_PEM:
      "Paste the full key including -----BEGIN OPENSSH PRIVATE KEY----- and -----END OPENSSH PRIVATE KEY----- lines.",
    SSH_KEY_UNSUPPORTED_TYPE: "Generate a new key: ssh-keygen -t ed25519 -f ~/.ssh/serverui_key",
    SSH_KEY_EMPTY:
      "Paste your private key in the Private Key field, or switch to Password authentication.",

    SSH_DNS_RESOLUTION_FAILED:
      "Check the Host field for typos. Try using the IP address. Verify with: nslookup <host>",
    SSH_CONNECTION_TIMEOUT:
      "Check: (1) SSH port is correct (default 22). (2) No firewall blocks the connection. (3) Host is up. Test: ssh -p <port> user@host",
    SSH_CONNECTION_REFUSED: "Verify SSH service is running on the target and the port is correct.",
    SSH_HOST_UNREACHABLE:
      "Check the IP/hostname. Test connectivity: ping <host> or traceroute <host>",
    SSH_CONNECTION_RESET:
      "Check server logs and firewall rules. The connection may have been dropped by a firewall or limit.",
    SSH_NOT_SSH_SERVER:
      "Verify the SSH port is correct (default 22). Another service may be listening on this port.",

    SSH_AUTH_FAILED:
      "Check: (1) Username is correct. (2) Password/key is correct. (3) Key matches authorized_keys on server. (4) Key permissions are 600. Test: ssh -p <port> user@host",
    SSH_AUTH_METHOD_UNSUPPORTED:
      "ServerUI supports password and private key (OpenSSH PEM) authentication only.",
    SSH_AUTH_NO_VALID_METHODS:
      "Verify the server allows password or public key auth for this user. Check /etc/ssh/sshd_config.",

    SSH_HOST_KEY_CHANGED:
      "Verify with server admin. To fix: ssh-keygen -R <host> (then re-accept the new key).",
    SSH_HOST_KEY_VERIFICATION_FAILED:
      "ServerUI currently accepts any host key (TOFU). If you see this, there's a key mismatch.",

    SSH_INTERNAL_ERROR: "Try again. If the problem persists, contact support.",

    // Legacy
    invalid_host: "Check the Host / IP field for typos.",
    connection_refused: "The host is reachable but nothing is accepting SSH on this port.",
    timeout: "Check the host, the SSH port, and any firewall in between.",
    host_unreachable: "Check the address and your network.",
    connection_reset: "SSH may be blocked by a firewall or connection limit.",
    not_ssh: "Check the SSH port.",
    auth_failed: "Check the username and password or private key.",
    invalid_private_key: "Paste the full key, including the BEGIN and END lines.",
    passphrase_required: "Passphrase-protected private keys are not supported yet.",
    ssh_failed: "Check the connection details and try again.",
  };
  return hints[code] || "Check the connection details and try again.";
}

// Get documentation URL for an error code
export function getErrorDocsUrl(code: SSHErrorCode): string {
  const baseUrl = "https://docs.serverui.app";
  const urls: Record<SSHErrorCode, string> = {
    SSH_KEY_PASSPHRASE_PROTECTED: `${baseUrl}/ssh-keys#removing-a-passphrase`,
    SSH_KEY_INVALID_FORMAT: `${baseUrl}/ssh-keys#supported-formats`,
    SSH_KEY_INVALID_PEM: `${baseUrl}/ssh-keys#pem-format`,
    SSH_KEY_UNSUPPORTED_TYPE: `${baseUrl}/ssh-keys#supported-algorithms`,
    SSH_KEY_EMPTY: `${baseUrl}/ssh-keys`,

    SSH_DNS_RESOLUTION_FAILED: `${baseUrl}/troubleshooting#dns`,
    SSH_CONNECTION_TIMEOUT: `${baseUrl}/troubleshooting#timeout`,
    SSH_CONNECTION_REFUSED: `${baseUrl}/troubleshooting#connection-refused`,
    SSH_HOST_UNREACHABLE: `${baseUrl}/troubleshooting#unreachable`,
    SSH_CONNECTION_RESET: `${baseUrl}/troubleshooting#connection-reset`,
    SSH_NOT_SSH_SERVER: `${baseUrl}/troubleshooting#not-ssh`,

    SSH_AUTH_FAILED: `${baseUrl}/troubleshooting#auth-failed`,
    SSH_AUTH_METHOD_UNSUPPORTED: `${baseUrl}/authentication`,
    SSH_AUTH_NO_VALID_METHODS: `${baseUrl}/troubleshooting#no-auth-methods`,

    SSH_HOST_KEY_CHANGED: `${baseUrl}/security#host-key-verification`,
    SSH_HOST_KEY_VERIFICATION_FAILED: `${baseUrl}/security#host-key-verification`,

    SSH_INTERNAL_ERROR: `${baseUrl}/support`,

    // Legacy - map to new URLs
    invalid_host: `${baseUrl}/troubleshooting#dns`,
    connection_refused: `${baseUrl}/troubleshooting#connection-refused`,
    timeout: `${baseUrl}/troubleshooting#timeout`,
    host_unreachable: `${baseUrl}/troubleshooting#unreachable`,
    connection_reset: `${baseUrl}/troubleshooting#connection-reset`,
    not_ssh: `${baseUrl}/troubleshooting#not-ssh`,
    auth_failed: `${baseUrl}/troubleshooting#auth-failed`,
    invalid_private_key: `${baseUrl}/ssh-keys#pem-format`,
    passphrase_required: `${baseUrl}/ssh-keys#removing-a-passphrase`,
    ssh_failed: `${baseUrl}/troubleshooting`,
  };
  return urls[code] || `${baseUrl}/troubleshooting`;
}

// Format a structured error for display
export function formatSSHError(error: SSHErrorResponse | TestResultWithError | TestResult): {
  title: string;
  detail: string;
  hint?: string;
  docsUrl?: string;
  retryable: boolean;
} {
  let code: SSHErrorCode | undefined;
  let message = "";
  let hint: string | undefined;
  let docsUrl: string | undefined;
  let retryable = false;

  if ("code" in error && error.code) {
    code = error.code;
    message = error.message;
    hint = error.hint;
    docsUrl = error.docs_url;
    retryable = error.retryable;
  } else if ("errorCode" in error && error.errorCode) {
    code = error.errorCode;
    message = error.error || "";
    hint = error.errorHint;
    docsUrl = error.errorDocs;
    retryable = error.retryable ?? false;
  } else if ("error" in error && error.error) {
    // Legacy: infer from error message
    message = error.error;
  }

  const title = code ? getErrorTitle(code) : "Connection Error";
  const description = code ? getErrorDescription(code) : message;
  const actionableHint = hint ?? (code ? getErrorHint(code) : undefined);
  const docsLink = docsUrl ?? (code ? getErrorDocsUrl(code) : undefined);

  return {
    title,
    detail: description,
    hint: actionableHint,
    docsUrl: docsLink,
    retryable,
  };
}

// Re-export Server type for convenience
export type { Server } from "./servers";

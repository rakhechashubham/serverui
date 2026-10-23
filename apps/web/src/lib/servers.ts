export type ServerStatus =
  | "online"
  | "offline"
  | "connecting"
  | "reconnecting"
  | "error"
  | "authentication_failed"
  | "unknown";

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

export type Server = {
  id: string;
  name: string;
  hostname: string;
  address: string;
  status: ServerStatus;
  /** True only while the backend holds a live SSH session for this id. */
  connected?: boolean;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  latencyMs?: number;
  metricsError?: string;
  lastSeen?: string;
  sshPort?: number;
  username?: string;
  authType?: "password" | "private_key";
  iconId?: string;
  customIcon?: boolean;
  updatedAt?: string;
  error?: string;
  errorCode?: SSHErrorCode;
  errorHint?: string;
  errorDocs?: string;
  errorRetryable?: boolean;
};

/** Live session state. A previous successful test is not a connection. */
export function connectionStatus(server: Server): ServerStatus {
  if (server.status === "connecting" || server.status === "reconnecting") return server.status;
  if (server.connected) return "online";
  if (server.status === "authentication_failed" || server.status === "error") return server.status;
  return "offline";
}

export type NewServerInput = {
  name: string;
  address: string;
  hostname?: string;
  sshPort: number;
  username: string;
  authType: "password" | "private_key";
  password?: string;
  privateKey?: string;
  iconId?: string;
  /** Data URL to store, or "" to remove a custom image. Omit to leave it unchanged. */
  iconImage?: string;
};

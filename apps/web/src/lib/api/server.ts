import { apiRequest } from "@/src/lib/api/client";

export type ServerStatus =
  "online" | "offline" | "connecting" | "error" | "authentication_failed" | "unknown";

export type ServerInfo = {
  id: string;
  name: string;
  hostname: string;
  status: ServerStatus;
  host: string;
  port?: number;
  username: string;
  authType?: "password" | "private_key";
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  uptimeSeconds: number;
  error?: string;
  lastSeen?: string;
};

export type ServerWriteInput = {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "private_key";
  password?: string;
  privateKey?: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  server: ServerInfo;
};

export function getServer(serverId: string, init?: RequestInit) {
  const query = new URLSearchParams({ serverId, _: String(Date.now()) });
  return apiRequest<ServerInfo>(`/api/server?${query.toString()}`, init);
}

export function getServerMetrics(serverId: string, init?: RequestInit) {
  const query = new URLSearchParams({ serverId, _: String(Date.now()) });
  return apiRequest<ServerInfo>(`/api/server/metrics?${query.toString()}`, init);
}

export async function listServers(init?: RequestInit) {
  const query = new URLSearchParams({ _: String(Date.now()) });
  const body = await apiRequest<{ servers: ServerInfo[] }>(
    `/api/servers?${query.toString()}`,
    init,
  );
  return body.servers || [];
}

export function createServer(input: ServerWriteInput) {
  return apiRequest<ServerInfo>("/api/servers", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 25000,
  });
}

export function updateServer(id: string, input: ServerWriteInput) {
  return apiRequest<ServerInfo>(`/api/servers/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
    timeoutMs: 25000,
  });
}

export function deleteServer(id: string) {
  return apiRequest<{ status: string }>(`/api/servers/${id}`, {
    method: "DELETE",
  });
}

export function testServerConnection(id: string) {
  return apiRequest<ConnectionTestResult>(`/api/servers/${id}/test-connection`, {
    method: "POST",
    timeoutMs: 25000,
  });
}

export function connectServer(id: string) {
  return apiRequest<ServerInfo>(`/api/servers/${id}/connect`, {
    method: "POST",
    timeoutMs: 25000,
  });
}

export function disconnectServer(id: string) {
  return apiRequest<ServerInfo>(`/api/servers/${id}/disconnect`, {
    method: "POST",
    timeoutMs: 15000,
  });
}

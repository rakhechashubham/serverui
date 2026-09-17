export type ServerStatus =
  "online" | "offline" | "connecting" | "error" | "authentication_failed" | "unknown";

export type Server = {
  id: string;
  name: string;
  hostname: string;
  address: string;
  status: ServerStatus;
  lastSeen?: string;
  sshPort?: number;
  username?: string;
  authType?: "password" | "private_key";
  error?: string;
};

export type NewServerInput = {
  name: string;
  address: string;
  hostname?: string;
  sshPort: number;
  username: string;
  authType: "password" | "private_key";
  password?: string;
  privateKey?: string;
};

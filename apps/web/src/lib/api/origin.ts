export function apiOrigin() {
  if (typeof window === "undefined") return "";
  const env = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "");
  if (env) return env;
  const { hostname, port, protocol } = window.location;
  if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "3000") {
    return `${protocol}//127.0.0.1:8080`;
  }
  return "";
}

export function apiUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiOrigin()}${path}`;
}

export function wsUrl(path: string) {
  const origin = apiOrigin();
  if (!origin) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}${path}`;
  }
  return `${origin.replace(/^http/, "ws")}${path}`;
}

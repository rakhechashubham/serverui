import { afterEach, describe, expect, it } from "vitest";
import { resolveApiOrigin, resolveWsUrl } from "@/src/lib/runtime/api";
import {
  clearInjectedDesktopConfig,
  isLoopbackHttpOrigin,
  localAuthWSProtocols,
  setInjectedDesktopConfig,
  validateDesktopConfig,
  withLocalAuthQuery,
} from "@/src/lib/runtime/config";
import { currentRuntime } from "@/src/lib/runtime/mode";

afterEach(() => {
  clearInjectedDesktopConfig();
});

describe("resolveApiOrigin", () => {
  it("prefers an explicit API base in web mode", () => {
    expect(
      resolveApiOrigin({
        runtime: "web",
        explicitBase: "https://api.example.test/",
        location: { hostname: "app.example.test", port: "443", protocol: "https:" },
      }),
    ).toBe("https://api.example.test");
  });

  it("uses the local Go API when the web UI is on localhost:3000", () => {
    expect(
      resolveApiOrigin({
        runtime: "web",
        location: { hostname: "localhost", port: "3000", protocol: "http:" },
      }),
    ).toBe("http://127.0.0.1:8080");
  });

  it("returns same-origin empty string behind a reverse proxy host", () => {
    expect(
      resolveApiOrigin({
        runtime: "web",
        location: { hostname: "serverui.example.test", port: "443", protocol: "https:" },
      }),
    ).toBe("");
  });

  it("defaults desktop mode to a local Go listen address", () => {
    expect(resolveApiOrigin({ runtime: "desktop" })).toBe("http://127.0.0.1:8080");
  });

  it("allows an injected desktop backend origin", () => {
    expect(
      resolveApiOrigin({
        runtime: "desktop",
        desktopBackendOrigin: "http://127.0.0.1:18080/",
      }),
    ).toBe("http://127.0.0.1:18080");
  });
});

describe("resolveWsUrl", () => {
  it("maps http API origins to ws without embedding tokens", () => {
    expect(resolveWsUrl("/ws/terminal", "http://127.0.0.1:8080", "localhost:3000", false)).toBe(
      "ws://127.0.0.1:8080/ws/terminal",
    );
  });
});

describe("withLocalAuthQuery", () => {
  it("appends the local token query parameter for media URLs", () => {
    expect(withLocalAuthQuery("/api/files/download?path=a", "secret-token")).toBe(
      "/api/files/download?path=a&localToken=secret-token",
    );
  });
});

describe("localAuthWSProtocols", () => {
  it("builds a websocket subprotocol carrying the token", () => {
    expect(localAuthWSProtocols("abc")).toEqual(["serverui-local.abc"]);
  });
});

describe("validateDesktopConfig", () => {
  it("requires loopback origin and token when ready", () => {
    expect(
      validateDesktopConfig({
        mode: "desktop",
        apiOrigin: "http://127.0.0.1:43127",
        localAuthToken: "tok",
        status: "ready",
      }),
    ).toBeNull();
    expect(
      validateDesktopConfig({
        mode: "desktop",
        apiOrigin: "http://203.0.113.10:8080",
        localAuthToken: "tok",
        status: "ready",
      }),
    ).toMatch(/loopback|127\.0\.0\.1/);
    expect(
      validateDesktopConfig({
        mode: "desktop",
        apiOrigin: "http://127.0.0.1:43127",
        localAuthToken: "",
        status: "ready",
      }),
    ).toMatch(/token/i);
  });

  it("detects loopback http origins", () => {
    expect(isLoopbackHttpOrigin("http://127.0.0.1:9")).toBe(true);
    expect(isLoopbackHttpOrigin("https://127.0.0.1:9")).toBe(false);
    expect(isLoopbackHttpOrigin("http://example.test")).toBe(false);
  });
});

describe("injected desktop runtime", () => {
  it("switches currentRuntime to desktop when config is injected", () => {
    setInjectedDesktopConfig({
      mode: "desktop",
      apiOrigin: "http://127.0.0.1:43127",
      localAuthToken: "launch-token",
      status: "ready",
    });
    expect(currentRuntime({})).toBe("desktop");
  });
});

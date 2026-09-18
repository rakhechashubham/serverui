export {
  apiOrigin,
  apiUrl,
  authenticatedApiUrl,
  resolveApiOrigin,
  resolveWsUrl,
  wsUrl,
  type ApiResolveInput,
  type BrowserLocation,
} from "@/src/lib/runtime/api";
export {
  bootstrapRuntime,
  watchDesktopBackend,
  type BootstrapResult,
} from "@/src/lib/runtime/bootstrap";
export {
  clearInjectedDesktopConfig,
  getInjectedDesktopConfig,
  isLoopbackHttpOrigin,
  localAuthHeaderName,
  localAuthQueryName,
  localAuthWSProtocolPrefix,
  localAuthWSProtocols,
  setInjectedDesktopConfig,
  validateDesktopConfig,
  withLocalAuthQuery,
  type DesktopRuntimeConfig,
  type DesktopRuntimeStatus,
} from "@/src/lib/runtime/config";
export { currentRuntime, isDesktopRuntime, type RuntimeMode } from "@/src/lib/runtime/mode";
export { RuntimeProvider } from "@/src/lib/runtime/RuntimeProvider";

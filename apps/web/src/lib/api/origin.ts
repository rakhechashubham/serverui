/**
 * API origin helpers.
 *
 * Implementation lives in `@/src/lib/runtime` so web and (future) desktop
 * shells share one resolution path. Existing imports keep working here.
 */
export { apiOrigin, apiUrl, wsUrl } from "@/src/lib/runtime";

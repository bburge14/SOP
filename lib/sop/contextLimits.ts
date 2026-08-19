// Shared between the client (SopWorkspace.tsx, for immediate feedback when
// attaching a file) and the server (app/api/generate/route.ts, the actual
// enforcement point) so the two can't drift out of sync.
export const MAX_CONTEXT_FILES = 10;
export const MAX_CONTEXT_TOTAL_CHARS = 150_000;

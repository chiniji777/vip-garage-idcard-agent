// Tunables for the agent. Override at install time by editing this file
// inside the installed app's resources, or via env when running from source.

export const HTTP_PORT = Number(process.env.AGENT_PORT ?? 8765);

// Origins the local agent is willing to answer for. Add internal staging
// or future branch domains here. The list goes into the CORS header.
export const ALLOWED_ORIGINS = [
  "https://chiangrai.vip-garage.org",
  "https://payao.vip-garage.org",
  // Legacy alias kept during the chiangrai/erp transition (grace period
  // until ~2026-06-22, see CLAUDE.md). Safe to remove after.
  "https://erp.vip-garage.org",
  // Development origin — needed when running `bun run dev` against the
  // agent from a local Next.js build.
  "http://localhost:3000",
];

// How long to hold the PC/SC connection open between requests. The card
// is normally pulled out between customers, so we don't keep it stale.
export const READER_TIMEOUT_MS = 8000;

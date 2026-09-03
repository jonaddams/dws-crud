# Handoff

## State
Merged to prod today: #15 BetterAuth (+Neon migration, sign-in verified), #16 `/settings`, #17 live SMS number, #18 CLAUDE.md migration-recipe fix + `pnpm db:status`/`db:migrate`.
**PR #19 open, unmerged** — branch `worktree-dws-provider`: `lib/nutrient-config.ts`, `lib/document-provider.ts`, `lib/upload-validation.ts`, `lib/with-retry.ts`; `lib/nutrient-api.ts` deleted. 426 tests, typecheck/Biome/build clean.
A2P campaign **APPROVED** (`VERIFIED`, id `C3EHCV9`). Outbound SMS unblocked but never tested.

## Next
1. Merge #19, then steps 4–6: `DocumentJob` model + `derivedFromId`, pluggable job runner (`after()` + cron sweeper), redaction as the first Processor operation. Design decisions are in memory note `dws-provider-seam` — read it, don't re-derive.
2. Run the post-approval SMS checklist in memory note `sms-next-up` (test STOP, HELP, a real mention notification). Fix the three filed fields still holding Twilio placeholder text — `opt_in_keywords` claims `VERIFY`/`VERIFICATION`, which `classifyKeyword` returns `null` for. Values in `docs/a2p-campaign-refiling.md`.
3. Then the restyle, and the impersonation-mode decision — it's load-bearing (permissions model), not cleanup.

## Context
- Bindery uses **only** the Viewer API. Zero Processor/Build calls; `NUTRIENT_PROCESSOR_API_KEY` is provisioned in Vercel and unused. That's the real gap, not "not enough features".
- Processor API is **synchronous** — no job id, no polling. The async seam is ours to build.
- AT&T throughput is **0.25 msg/sec**; `notifyPendingMentions` sends serially inline on a user-facing request.
- Migrations never run on Vercel deploy. Before `db:migrate`, read the datasource line it prints — `.env.local` overrides shell env via `prisma.config.ts`, and `vercel env pull` cannot fetch the Neon URL at all.
- Only a real sign-in in a private window proves production auth works; a 200 from the session endpoint proves nothing.
- Jon's flow: branch → push → **offer** the PR, never open unasked; merge stacked PRs with a merge commit, never squash.

# Summer’s Learning Lab

A private maths and English tutor for Summer and her parent. The current build implements **Phase 1 preparation**: baseline warm-up, fresh four-week reassessment logic, source-mapped skill samples, server-side voice routes, parent sign-in/PIN, owned progress storage and reading review.

**Summer has not been assessed. The app is not yet live-ready.** At the last connected checks, the OpenAI and Supabase keys worked, but speech returned `429 credit_balance_exhausted` and the Supabase `profiles` probe returned `404`. Add OpenAI API Billing credit and create the tables with `supabase/schema.sql`, then recheck the services. Real authentication, cross-device saves, scheduled cleanup and iPhone audio/microphone checks remain outstanding. A successful Vercel deployment is not yet verified. Normal learning sessions are Phase 2, so the four-week clock has not begun.

All sixty skill topics and year bands have been checked against current official SCSA sources: English for implementation in 2025 and Mathematics for implementation in 2026. The original questions are focused, non-standardised samples, not a complete curriculum or validated diagnostic assessment. Two skills, `english-pp-initial-sounds` and `english-pp-blend-three-sounds`, remain deferred and unassessed until their phoneme audio is checked by listening.

For the parent, start with [the plain-English connection guide](docs/SETUP-FOR-MUM.md). Database details are in [DATABASE.md](docs/DATABASE.md). The earlier three-screen preview remains in `index.html`; it is a design artefact with sample scores, not the connected app.

## Development

Use the existing isolated checkout. Do not create a Git worktree unless explicitly requested.

Use Node.js 24, matching the tested runtime and the package's engine setting. For Vercel, import this repository with the root directory `./`, the **Next.js** preset and default build/output settings. The old `67747ea` commit contained only a README and cannot build the app; deploy a commit containing this package manifest, lockfile and application source. Server environment variables must be set separately in Vercel.

```sh
export NEXT_TELEMETRY_DISABLED=1
npm ci --cache /tmp/summer-npm --no-audit --no-fund
npm test
npm run typecheck
npm run build
npm run dev
```

Copy `.env.example` to `.env.local` only if no existing local configuration needs preserving. Fill in the parent’s server configuration securely, never commit it. The supplied Supabase URL is already set in this instance’s ignored `.env.local`; credentials are not supplied in source. All live voice calls use `SUMMER_OPENAI_KEY` on the server. The app uses the public Supabase key with the authenticated parent’s token and row-level ownership policies; no service-role key is needed.

`npm run dev` and `npm start` use port3002. For a production smoke check after building, run `npm start`. Processes must restart in a new environment task. Source, dependencies and prepared outputs persist separately from running processes.

## Baseline and comparison

- Up to three short parts: maths; spelling/listening understanding; reading aloud. Each session has a twelve-minute cap and may stop earlier.
- Start easily and adapt gently; two considered errors step down, fast wrong responses are only likely guesses. Assisted, skipped and guessed answers do not create independent mastery evidence.
- Sixty source-mapped priority skills across PP–Year 4; untouched and deferred skills stay unassessed, and confidence reflects the limited authored samples. Curriculum mapping does not validate item difficulty or establish a definitive school-year level.
- Secure mastery needs at least90% independent accuracy over three real learning sessions, with at least two samples per session. Baseline parts cannot manufacture secure mastery.
- Immutable starting record. The follow-up uses different authored items for matching skills and difficulty. Report sampled skill change with confidence, not a single adaptive-total progress percentage.
- Follow-up due28days after the first completed normal learning session’s start. App visits and baseline activity do not count. Phase2 will supply actual learning evidence and completed sessions; no automatic reassessment runs or outside notifications are sent.
- Spelling targets stay server-private and are spoken but not printed as answer-revealing captions. Independent reading passages stay silent. Reading transcription is an estimate, never a graded exact-match answer.
- Reading audio and an attempt save atomically to the private database. Recordings become unreadable after720hours and are purged by a scheduled minute-based job. Parent score corrections remain separately saved after audio expiry.

## Verification status

All nineteen automated assessment/content checks, TypeScript checks and the production build passed. Schema ownership, immutable records, atomic reading saves, PIN limits and concurrent budget caps were exercised on disposable PostgreSQL17. Supabase’s real authentication and its `pg_cron` scheduler still require cloud-project validation after the tables are created. Browser checks using mocked responses do not establish live end-to-end authentication, microphone capture or voice playback; none of those has been verified with a real child assessment.

Current official OpenAI documentation was reviewed for model/request fields and endpoint retention. Speech requests may have abuse-monitoring logs retained for up to thirty days; the transcription endpoint lists no application-state or abuse-monitoring retention. Supabase backups have separate retention from the app’s thirty-day recording deletion and require project-specific review.

## Data and assets

No surname, school, address, birth date, photos, analytics or free-form answer transcripts are stored. Only reading activities request the microphone. Fonts and Microsoft Fluent Emoji3D illustrations are self-hosted with licences in `public/assets`. Next.js development telemetry is disabled through environment configuration. Model names and official SDK references are in `lib/config/models.json`; current curriculum sources, mapping limits and assessment audio caveats are in `data/curriculum-notes.md`.

# Using Summer’s Learning Lab

Phase 1 contains Summer’s starting **warm-up challenge** and a matched follow-up with fresh questions. The warm-up takes up to three visits: maths, spelling and understanding, then reading aloud. Each lasts at most twelve minutes and can stop earlier.

Daily sessions and the personalised AI tutor are not implemented yet; they belong to Phase 2. The four-week clock starts with her first completed normal learning session, not an app visit or the baseline.

## What is working

The redesign was pushed to GitHub `main` as `d902334`. The live production homepage opens and the private parent route requires sign-in. You confirmed parent sign-in, the PIN and audible voice. A fresh adult Marin voice check succeeded in about 3.3 seconds; phone timing may differ. All41 automated checks, TypeScript and the updated production build pass.

All eight Supabase tables exist and deny anonymous access; public sign-ups are disabled. The cleanup job is registered. Real iPhone microphone capture, cross-device progress and successful deletion of expired recordings remain unverified.

## Open the right app address

Use [summerlearns.vercel.app](https://summerlearns.vercel.app/) in laptop Chrome and iPhone Safari. Your Vercel Domains screen confirms it is connected to Production with a valid configuration.

The individual deployment address, `summerlearns-cdb5v6vdz-sam-stacks.vercel.app`, redirects an independent check to Vercel login because of deployment protection. The production address above opens directly.

## Check the voice, then begin when Summer is ready

1. Use the lock, your existing parent sign-in and six-digit PIN, then return Home. Summer needs no email or separate account.
2. On Home, tap the **speaker beside Hi Summer** for a harmless adult voice check. It does not start the baseline. Check the accent, pace and volume.
3. When she is ready, tap **Start warm-up** or **Continue warm-up**. Keep these questions for her own answers: the starting record cannot be reset as an adult practice run.
4. **Stop for today** keeps completed attempts. Helped and skipped answers stay separate from independent evidence.
5. For spelling, listen and type. The target stays hidden; spelling does not use the microphone.
6. For reading, allow the microphone, record her reading, stop, listen and tap **Save reading**. The app keeps the passage silent.
7. In the parent area, listen and review reading accuracy. Transcription scores are estimates. Unsampled skills should say **Not checked yet**.

After her real progress is saved, sign in on the other device and check that **Continue warm-up** and her results agree. This checks cross-device saving using her actual attempts.

## What the results mean

The 60 skills and 240 original questions sample Pre-primary to Year 4 priorities. Topic/year mappings were checked against current SCSA English (implementation 2025) and Mathematics (2026). Results describe sampled skills, not a diagnosis, complete curriculum assessment or official school-year grade.

Two skills remain **Not checked yet** until their phoneme audio is checked: `english-pp-initial-sounds` and `english-pp-blend-three-sounds`. Computer voices can say letter names instead of sounds.

The follow-up preserves the baseline and compares fresh questions for matched skills. Four weeks of actual learning will begin once Phase 2 supplies daily sessions.

## Recordings and spending

Private recordings are designed to become inaccessible after thirty days and be deleted by the cleanup job. Live deletion still needs verification; read-only checks are in `docs/DATABASE.md`. Reviewed scores remain after audio expiry. Supabase backups have separate retention settings.

OpenAI lists up to thirty days of abuse-monitoring logs for speech requests, and no application-state or abuse-monitoring retention for transcription. Processing and saved app recordings are separate.

Keep OpenAI budget alerts enabled; alerts may not stop requests. The app reserves against a US$15 voice cap per UTC month, an estimate rather than an invoice or guaranteed account limit. Hosting and database charges are separate.

## If settings need reconnecting later

The keys and database are already configured; keep them as they are.

- In this chat’s **Environment** panel, the OpenAI key belongs under **Network secrets → SUMMER_OPENAI_KEY**. Never paste it in chat or GitHub.
- **Environment variables** hold **SUPABASE_URL**, **SUPABASE_PUBLISHABLE_KEY** and **SUMMER_PARENT_EMAIL**. Keep the publishable/`anon` key and parent email binding. **NEXT_TELEMETRY_DISABLED** remains `1`.
- If a credential changes, update its Vercel server variable under **Settings → Environment Variables**, then redeploy latest `main`. App key names have no `NEXT_PUBLIC_` prefix. Keep **Application Preset → Next.js** and **Root Directory** as `./`.
- **Configure setup instructions** installs and starts the Codex workspace. Its installation and startup fields are already saved. Vercel deployment and its server variables are managed separately.

If something fails, share the error message without passwords or keys. Keep the existing database and parent account while we investigate.

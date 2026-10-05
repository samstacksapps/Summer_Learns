# Connecting Summer’s Learning Lab

The baseline is a friendly **warm-up challenge**, normally three short visits: maths, spelling and understanding, then reading aloud. Each visit stops at twelve minutes and can stop earlier. This is a starting picture of individual skills, not a diagnosis or an official school-year grade.

After four weeks of normal learning, the app offers fresh questions at the same skill and difficulty as the starting warm-up. It keeps the original record and shows the actual number of learning sessions. Daily learning starts in Phase 2; opening the app or completing the baseline does not start that four-week clock.

The supplied keys have been checked and work. Two setup steps remain: add credit in [OpenAI API Billing](https://platform.openai.com/settings/organization/billing/overview), then create the app’s Supabase tables using the steps below. A real voice request returned `credit_balance_exhausted`; the database check found that the app’s tables are missing. Summer has not started an assessment, and the app has not been deployed or pushed to GitHub.

## 1. Where the connected keys are saved

The keys are already connected. Use these steps if you need to update them later:

In this chat’s right-hand **Environment** panel:

1. Under **Network secrets**, find **SUMMER_OPENAI_KEY**, click its pencil, enter your OpenAI API key securely and save the editor. This lets the app create its computer voice and transcribe readings. Never paste the key in chat or GitHub.
2. Under **Environment variables**, click the pencil for **SUPABASE_PUBLISHABLE_KEY**. In Supabase, open your project’s **Settings → API**, or **Project Settings → API Keys**, and copy the publishable key. Use the publishable key or legacy `anon` key; do not use `service_role` or a secret key. Enter it in this field and save.
3. Enter your own parent email in **SUMMER_PARENT_EMAIL**. This must match the parent account you create below. Summer does not need an email address.
4. **SUPABASE_URL** is already set to your supplied project URL. **NEXT_TELEMETRY_DISABLED** is set to `1` to disable Next.js development telemetry.
5. When changing a value, review and save the environment changes, then tell me so I can retry the affected checks. Environment configuration and publishing the app to Vercel are separate steps.

Model names live together in `lib/config/models.json`. Current models, request fields and endpoint retention were checked against official OpenAI documentation. Before retrying voice, open API Billing and add credit; the current key’s account has no usable API balance.

## 2. Prepare your private Supabase database

Use a **new project dedicated to this app**. If your supplied project already contains another app’s data, do not run this setup there; tell me first so we can preserve it.

1. In Supabase, open the project with the URL you supplied.
2. Open **Database → Extensions** and enable **pg_cron**, if it is not enabled. This removes expired recordings automatically.
3. Open **SQL Editor → New query**.
4. Open the supplied `supabase/schema.sql` file, copy its contents, paste them into the query and click **Run**. This creates the progress tables and privacy rules. It contains no keys.
5. Open **Authentication → Users → Add user**. Create a parent account using your own email and a password you keep private. Use the same email as **SUMMER_PARENT_EMAIL**. There is no child account.
6. In **Authentication** settings, turn off public sign-ups. Only your pre-created parent account is needed.
7. Check the recording cleanup job using the two small queries in `docs/DATABASE.md`. The job must be active and have successful runs before recording Summer.

The app saves recordings privately inside its database. Audio becomes inaccessible at exactly thirty days, and a job checks every minute to delete expired rows. Your reviewed scores remain available after the audio expires. Supabase backups have separate retention; check your project’s backup settings before real recordings are used. OpenAI’s current speech endpoint may keep abuse-monitoring logs for up to thirty days; its transcription endpoint lists no application-state or abuse-monitoring retention. Processing audio through OpenAI is separate from storing the app’s recording.

## 3. Before the first real warm-up

The build has 60 skills and 240 original sample questions across Pre-primary to Year 4. Their topics and year bands have now been checked against current official SCSA sources: English for implementation in 2025 and Mathematics for implementation in 2026. They sample Summer’s priority needs; they are not a complete curriculum or a standardised assessment and do not establish a definitive school-year grade.

Two sound skills remain deferred until their audio is checked by listening: `english-pp-initial-sounds` and `english-pp-blend-three-sounds`. Computer voices can say letter names instead of speech sounds. These skills must remain **Not checked yet**, rather than turning unclear audio into an apparent learning gap.

The app has not yet passed a live Vercel check or a real iPhone audio test. Your first Vercel build used the original `67747ea` GitHub commit, which contained only a README. Deployment needs the updated app source and its `package.json` on GitHub. A working deployment lets us continue connected Phase 1 testing; Summer should start only after those checks pass.

For the Vercel deployment:

1. Import or open `samstacksapps/Summer_Learns` in Vercel. Set **Application Preset** to **Next.js**, keep **Root Directory** as `./` and use default build/output settings. The package selects the tested Node.js 24 runtime.
2. Under the project’s **Settings → Environment Variables**, enter the same four app names: **SUPABASE_URL**, **SUPABASE_PUBLISHABLE_KEY**, **SUMMER_PARENT_EMAIL**, **SUMMER_OPENAI_KEY**. These are server variables; none start with `NEXT_PUBLIC_`.
3. Set **NEXT_TELEMETRY_DISABLED** to `1` there too.
4. Deploy the updated app commit after saving variables. If a GitHub push starts a new build, check its commit; otherwise open **Deployments** and deploy the latest `main` source. Retrying the old README-only commit cannot fix the missing Next.js error. Use the HTTPS address Vercel supplies. Do not put keys in source files.

The Vercel build and live service checks still need to succeed before deployment is considered complete.

## 4. How to try Phase 1 when the connected app is ready

On your laptop, use Chrome. On your iPhone, use Safari and the same secure app address:

1. Tap the little lock, sign in as the parent, and choose a six-digit dashboard PIN. That PIN opens the results area; your parent sign-in protects the family’s data.
2. Back on Home, tap **Let’s go**. This tap starts the computer voice. Check that the words are clear and speaker replay works. Highlighting is approximate, based on playback duration, not exact speech timestamps.
3. Check a few maths answers. Use **I’m not sure yet** rather than encouraging a guess. A hint marks the answer as helped, so it will not count as independent evidence.
4. Try **Stop for today**. Reopen the app on the other device and check that her completed attempts remain saved.
5. On the spelling visit, listen to the word and sentence, then type the word. The target stays hidden on screen so the warm-up does not supply its answer. Spell-check is disabled. There is no voice input for spelling.
6. On the reading visit, tap **Start recording**, allow the microphone when Safari/Chrome asks, read the little passage and tap **Stop recording**. Listen to the clip, then tap **Save my reading**. Recordings stop after one minute. The app does not read the passage to her first, so it can observe her independent reading.
7. Unlock the parent area and listen to the recording. Look at the original passage and enter your reviewed accuracy. Transcription estimates can overstate reading accuracy, so they never automatically mark a reading skill secure.
8. Check the skill list. Unsampled skills should say **Not checked yet**, rather than receiving invented levels. Early results have low confidence. Finish the three short parts across different visits; you do not need to do them all in one sitting.

All nineteen automated checks, TypeScript checks and the production build passed. Before Summer uses it, we still need to validate the real voice, parent sign-in, cross-device saves and scheduled cleanup after API credit is added and the database script has run. No live end-to-end authentication, microphone or voice session has passed yet. Actual microphone/audio testing on your iPhone needs your help; simulated phone screens do not prove Safari audio works.

## Spending

Set an OpenAI project monthly budget and alerts in your OpenAI account, and check how that account enforces limits. Some budget settings send alerts without stopping requests. The app also has a conservative US$15-per-UTC-month voice reservation cap. This is not an invoice or a guaranteed OpenAI billing ceiling. Failures keep their reservations for safety; they are not billed amounts. The database and hosting plan charges are separate. Confirm current plan prices and limits in your own accounts before deploying.

## If something does not work

Do not delete the database or change keys in the browser. Check that the names above match exactly, values were saved, the database script ran, and the deployed app was redeployed after changing Vercel variables. Share the error message without any passwords or keys, and I can investigate.

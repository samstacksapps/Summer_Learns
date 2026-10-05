# Private family database

Create a Supabase project in an Australian region if available. In the Supabase SQL editor, run [schema.sql](../supabase/schema.sql) using the project administrator account. Enable `pg_cron` under Database → Extensions before running the last retention block. The script can be rerun for the same schema: it replaces this app's named policies and triggers and updates the named scheduled job. It is a fresh-project schema, not a migration of arbitrary existing tables. It never drops application data.

Create the parent's email/password account through the Supabase dashboard and disable public sign-ups in Authentication settings. Set `SUMMER_PARENT_EMAIL` to that account's email address. The application additionally rejects any other email address; RLS independently confines every signed-in account to its own rows. There is no child account. The app uses the Supabase public API key with the parent's signed-in access token on its server; it does not need a service-role key. Keep all configuration server-side and never store a secret in this SQL file.

## Stored information

| Table | Purpose |
| --- | --- |
| `profiles` | Fixed learner name `Summer`, parent owner, optional server-generated scrypt PIN hash and persistent PIN lockout counters. |
| `assessments` | Baseline or follow-up, start/completion times and status. |
| `assessment_sessions` | Maths, English and reading parts of an assessment, including pauses/stops. |
| `attempts` | Item/skill IDs, correctness or unknown, elapsed time, assistance/guess flags, PP–Year 4 (`0`–`4`), optional reading estimate. Free-text answers and transcripts are not stored. |
| `reading_recordings` | Private base64 audio up to five MiB decoded, MIME type, automated estimate, optional parent correction and expiry. No public bucket or transcript. |
| `reading_reviews` | Parent's percentage correction linked to the original attempt, plus a preserved original estimate. Contains no audio or transcript and survives recording deletion. |
| `learning_sessions` | Learning start and completion times, supporting later usage reporting. |
| `voice_usage` | Append-only conservative reservations in **USD cents**, kind and unique request ID. These are internal spending estimates rather than an invoice. |

UUID primary keys and ownership default automatically where appropriate. Accuracy and reading estimate fields are percentages from `0` to `100`. Composite foreign keys enforce that a session and recording/attempt belong to the same assessment and parent, even if someone submits another family's assessment or session ID. Recording MIME and base64 checks complement server-side decoded-size validation.

After transcription, the server calls `save_reading_attempt` with named arguments `p_assessment_id`, `p_session_id`, `p_item_id`, `p_skill_id`, `p_year_level`, `p_audio_base64`, `p_mime_type`, `p_reading_estimate`, `p_response_ms` and `p_assisted`. The RPC derives ownership from the authenticated parent, locks the session and assessment, and requires an active reading part within its twelve-minute deadline. It returns the recording UUID. Audio and attempt are inserted in one transaction, so an invalid or duplicate attempt cannot leave orphan audio. Reading correctness remains unknown (`null`); the transcription percentage is only an estimate. The optional estimate defaults to `null`, and the observed clip duration must be between 500 and 65,000 milliseconds.

Completed assessments cannot be changed or deleted. Their attempts and sessions also become immutable; a row lock serializes evidence saves against completion. Each parent can have at most one active and one completed assessment of each kind. An assessment can have only one active session for each part; stopped sessions remain available as history while a new session resumes that part. These unique indexes prevent simultaneous start requests from creating duplicate active runs or parts. Only the parent's reading correction may be edited on a recording, including after assessment completion; the initial automated estimate, audio and expiry cannot be rewritten. Audio can be deleted independently for privacy. Administrative deletion of all family data requires an explicit separate maintenance operation because immutable evidence also prevents accidental cascaded deletion; normal app credentials cannot bypass the protection.

Corrections are also upserted in `reading_reviews` using `(owner_id, assessment_id, item_id)`. Its insertion trigger takes `original_estimate` from the matching attempt rather than trusting the caller; that original estimate and identity become immutable. The parent may update `parent_accuracy` without altering initial evidence, and the percentage remains available after the audio expires. A review cannot refer to another owner's assessment or an item that has no original attempt.

Parent PIN failures use the atomic `record_pin_failure()` RPC. The fifth incorrect attempt locks PIN entry for ten minutes; failures after an expired lock start a new count, and requests during an active lock do not extend it. The app checks lock state before verifying the scrypt hash and resets both fields after success. The PIN supplements the parent sign-in; it is not a separate account or a database authentication boundary.

## Recording retention

The insertion trigger records the actual upload time and sets expiry to exactly **720 hours (30 days)** later. The caller cannot extend this by submitting timestamps. The read and update policies reject recordings at expiry, even before the cleanup job has run.

The named `summer-delete-expired-recordings` job runs every minute and deletes expired rows. Normal removal is on the next scheduled run, up to approximately one minute after expiry. Scheduler failures can delay deletion, so check the job and its run history before accepting real recordings, and monitor it in production. Database deletion does not establish when Supabase-managed backups or logs expire; review the chosen project's backup and provider retention settings separately. This app does not copy recordings elsewhere or store transcripts. Audio sent to OpenAI for transcription is subject to that provider's processing and retention rules, which are separate from this database policy.

Verify the job as the project administrator:

```sql
select jobid, jobname, schedule, active
from cron.job where jobname = 'summer-delete-expired-recordings';

select status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'summer-delete-expired-recordings')
order by start_time desc limit 10;
```

## Atomic voice budget

Before calling OpenAI, the server reserves a conservative cost with:

```ts
await supabase.rpc('reserve_voice_spend', {
  p_kind: 'tts', // or 'transcription'
  p_amount_cents: 1, // conservative reservation computed on the server
  p_request_id: crypto.randomUUID(),
  p_monthly_limit_cents: 1500,
});
```

The function returns `true` when a new reservation fits, or `false` when the monthly allowance is exhausted or a request ID has already been used. It serializes calls per parent and UTC calendar month. Individual reservations must be between 1 and 200 cents. The database hard ceiling is 1,500 USD cents per month; callers may lower it but cannot increase it. Signed-in users can read their own reservations but cannot directly insert, update or delete them. Failed provider calls keep reservations, intentionally reducing remaining allowance conservatively. The estimate is not a guaranteed provider billing cap; maintain suitable OpenAI project limits and monitor actual billing.

## Before using real family data

Confirm that the allowlisted parent can sign in, read only their own rows and save/resume assessment parts. Check that another authenticated user and anonymous requests cannot read family rows. Complete a disposable assessment and confirm edits to its evidence fail; verify a parent recording correction still succeeds. Confirm duplicate item submissions fail, a foreign owner's session cannot be linked, the spending reservation rejects an over-budget or duplicate request, and the retention job succeeds. These require the actual Supabase project and parent credentials; local application tests cannot establish cloud configuration or scheduler health.

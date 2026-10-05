# Daily tutor database update

The conversational tutor needs [20261006_conversational_tutor.sql](../supabase/migrations/20261006_conversational_tutor.sql) in the existing Supabase project's SQL editor. Run the whole file together. It is a transaction and is safe to run again. This is an additional migration, not a replacement for the original schema.

The migration leaves `assessments`, `assessment_sessions`, `attempts`, reading recordings and parent reading reviews unchanged. It extends `learning_sessions` and creates `learning_attempts` and `tutor_turns`. An active daily lesson has five questions with Year 2 entry and Year 1 support after two consecutive incorrect answers. Daily questions use their own private plan, separate from the baseline and follow-up question bank.

Only a completed daily lesson receives `completed_at`, together with its fifth saved grade. Stopping a lesson saves its existing grades and sets `status = 'stopped'` without a completion timestamp. The existing four-week report uses the start time of the first completed normal lesson, so opening a page or starting an unfinished lesson does not start that clock.

## What is saved

- `learning_sessions`: the private authored question plan, current question index, deterministic score, consecutive incorrect answers, whether help was received on the current question, and up to eight observation codes. Its completion summary contains counts and those codes.
- `learning_attempts`: question and skill IDs, Year 1 or Year 2, deterministic correctness, assistance, response duration and a server timestamp. It has no child answer, explanation, recording or transcript column.
- `tutor_turns`: an expiring request/reply receipt. A short AI reply may quote part of Summer's message. Receipts are hidden from parent-token reads after 24 hours and are deleted by the named cron job every ten minutes. They are not permanent chat history.
- `voice_usage`: conservative USD-cent reservations shared by tutor, speech and transcription, capped at 1,500 cents per UTC calendar month. Tutor provider calls reserve three cents. These are spending allowances, not invoices. A failed or timed-out provider call retains its allowance because the provider may have billed it.

Long-term observation values are limited to `tens-and-ones`, `counting-on`, `equal-groups`, `drawing-a-model`, `rereading-clues`, `checking-word-parts`, `explaining-a-reason` and `trying-another-way`. They describe observed strategies rather than assign a permanent learning style.

The signed-in parent can read only their own rows. Anonymous access is revoked. Direct writes to grades and reply receipts are revoked, and session updates/deletes are revoked. The server inserts the initial lesson and calls the ownership-checked RPCs using the parent's access token. The public API removes accepted answers and teaching notes from the private plan. The parent account remains trusted; this is not a separate child-account permission model.

## Atomic turn contract

`claim_tutor_turn(p_session_id, p_request_id, p_expected_revision, p_action, p_cost_cents)` returns `{claimed:true, revision}` or `{response:<saved reply>}`. Actions are `start`, `respond`, `message`, `finish` and `stop`. `start`, `respond` and `message` cost three cents; `finish` and `stop` cost zero. A session row lock serialises two tabs. A completed duplicate returns its saved reply before checking whether the lesson is still active.

A pending turn lasts 120 seconds. An identical pending request is busy, not another provider call. A failed or expired pending request can retry with the same ID only if the lesson revision has not changed; that retry reserves another provider allowance and retains the original allowance. A completed reply retry spends nothing extra. Stop can overtake pending work, including with an older browser revision, and a late response cannot restart the lesson.

`commit_tutor_turn(p_session_id, p_request_id, p_state, p_response, p_attempt, p_finish, p_stop)` atomically saves the reply, grade, state and optional completion. It returns the actual saved reply. Grades must match the private plan's current question and year, and match score/assistance transitions. A message can mark the current question as helped or leave that flag unchanged when discussing a previous answer; it cannot erase help already recorded. `fail_tutor_turn(p_session_id, p_request_id)` marks a pending request failed without erasing its spending allowance.

RPC error messages `TUTOR_BUSY`, `TUTOR_STALE`, `TUTOR_BUDGET` and `TUTOR_EXPIRED` use SQLSTATE `P0001`. Ownership failures use `42501`, malformed requests use `22023`, and state/lesson validation failures use `23514`.

## Retention verification

The original installation enabled `pg_cron` for reading recording deletion. This migration registers `summer-delete-expired-tutor-receipts`. If cron is absent, the migration warns and read expiry still applies, but scheduled deletion is not configured. Enable `pg_cron` and rerun the migration in that case.

```sql
select jobname, schedule, command, active
from cron.job
where jobname = 'summer-delete-expired-tutor-receipts';
```

Expected: one active job, `*/10 * * * *`, command `delete from public.tutor_turns where expires_at <= now();`. The project's actual job health can be checked in `cron.job_run_details`; a successful local test does not prove the production job has run.

## Verification in a disposable database

Use PostgreSQL 17 with Supabase-compatible `auth.users`, `auth.uid()`, `anon` and `authenticated` roles. Load the original schema and this migration first. Do not run test fixtures in the family's production project.

```sh
psql -v ON_ERROR_STOP=1 -f tests/tutor-schema.sql
python3 tests/tutor-schema-concurrency.py
```

Set standard `PGHOST`, `PGPORT`, `PGUSER` and `PGDATABASE` for the disposable database. Set `PSQL_BIN` if `psql` is outside `PATH`. SQL fixture changes roll back; concurrency fixtures are removed in a `finally` block.

Verification completed in PostgreSQL 17.11: 47 SQL assertions and three actual two-connection races passed. The migration was applied repeatedly without duplication. With real `pg_cron` 1.6.5, repeated migration registered exactly one purge job, and a temporary one-second test schedule executed the same deletion command and removed an expired receipt. No production DDL or family test record was created by these checks.

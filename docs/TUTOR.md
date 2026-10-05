# Conversational tutor

Daily learning uses a real `gpt-4.1-mini` reply based on the current authored question, Summer’s submitted answer, her explanation or question, a short temporary conversation, and any strategies she has previously demonstrated. Replies use Australian English and short, age-appropriate explanations. The model does not grade her: the server checks answers against authored keys. There is no canned success-message fallback if the model fails.

The practice bank covers Year 1–2 number and place value, addition/subtraction, equal groups, patterns, money, time, fractions, measurement and shapes; English includes comprehension, vocabulary, spelling patterns and grammar. Each lesson selects five tasks and starts at Year 2, offering Year 1 support after two consecutive misses. The bank is a starter set, rather than a complete coverage or assessment of every curriculum outcome. It uses different questions from both assessment forms.

Finish the starting-point check before daily lessons. The baseline and four-week check remain independent from tutoring. New unfinished baseline questions use Years 1–2; saved earlier evidence, including older levels, remains unchanged. A completed five-question normal lesson is the only new activity that starts the 28-day clock, dated from that lesson’s start. Stopped lessons save their attempted questions but do not start the clock.

## Database update

Run `supabase/migrations/20261006_conversational_tutor.sql` in the existing Supabase SQL Editor. It is transactional and can be rerun. In the app, sign in, unlock the parent area and use **Copy database update** under Daily lessons. Paste into a new SQL query and select Run; refresh the app afterwards.

The migration extends learning sessions and adds owned `learning_attempts` and `tutor_turns`. Ownership rules deny anonymous and other-family access. Direct writes to daily attempts, receipts and existing session state are denied; RPCs atomically claim, save and stop each turn. Retries use the same request ID: a saved reply returns without another mark or provider call. A failed call can retry at the same revision with another conservative reservation. Stop invalidates an unfinished reply so a late result cannot save an answer.

Only grades, assistance flags and fixed strategy observation codes are long-term memory. The browser’s conversation is temporary. A short retry receipt can include the tutor’s response and fragments it quotes; reads expire after 24 hours and the existing pg_cron extension schedules deletion every ten minutes. No daily microphone audio or transcription is saved to the database. The child checks recognised words before sending them. Parent reports show results and tentative strategies, without assigning a fixed learning style.

## Australian voice

`lib/browser-voice.ts` selects only `en-AU` voices, preferring downloaded voices. `/voice-check` lets the parent preview a voice and save its URI on that device. The actual first speech call runs directly from a tap; there is no silent audio primer or paid speech generation before it. Missing start/end events time out, cancel is bounded, and late callbacks cannot alter another question. Standard questions can be read without voice; spelling requires an available voice or can be skipped unassessed. Saved private reading clips use native audio controls after an authenticated download.

On iPhone, add a voice through Settings → Accessibility → Read & Speak (or Spoken Content) → Voices → English → Australian. Available names depend on the OS. A voice choice is per device, not a profile trait. Automated native-engine tests and mocked Chromium do not prove Safari timing or accent; listening on the actual phone remains necessary.

## Provider and spending

The server calls the documented Chat Completions endpoint with `gpt-4.1-mini`, structured output and `store:false`, using the existing `SUMMER_OPENAI_KEY`. The cloud’s supported credential proxy successfully authenticated Chat Completions and audio but rejected the Responses endpoint; the application uses the working documented endpoint. Fictional adult diagnostic cases verified replies about both sound and mistaken reasoning. No real child record was created for testing.

OpenAI’s API data is not used for training by default. `store:false` disables saved completion application state; it does not remove default abuse-monitoring logs, which may retain prompts and replies for up to 30 days. See https://developers.openai.com/api/docs/guides/your-data and https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create.

Each AI turn reserves a conservative three US cents against the shared US$15 monthly app cap; transcription also reserves its estimated cost. Native device speech does not use this API budget. A reservation is not an invoice. Failed provider calls retain their reservation because they may have been billed. The app never substitutes invented tutoring or fabricated progress for an unavailable provider.

## Verification

The usual install/typecheck/test/build commands remain unchanged. API tests exercise real handlers with isolated authentication/database/provider fixtures. `tests/tutor-schema.sql` and `tests/tutor-schema-concurrency.py` exercise a disposable PostgreSQL database; run them only against a test database prepared with the base schema and migration. They cover RLS, receipt deduplication, failed retries, reservations, completion, competing claims and Stop versus late commit. No baseline is reset or fabricated in the real family project.

Production readiness requires the database update and an authenticated family check on the phone. The stable site is https://summerlearns.vercel.app/; individual deployment URLs can open Vercel’s protection screen.

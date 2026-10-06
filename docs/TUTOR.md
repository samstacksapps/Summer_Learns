# Conversational tutor

Daily learning uses a real `gpt-4.1-mini` reply based on the current authored question, Summer’s submitted answer, her explanation or question, a short temporary conversation, and any strategies she has previously demonstrated. Replies use Australian English and short, age-appropriate explanations. The model does not grade her: the server checks answers against authored keys. There is no canned success-message fallback if the model fails.

The practice bank covers Year 1–2 number and place value, addition/subtraction, equal groups, patterns, money, time, fractions, measurement and shapes; English includes comprehension, vocabulary, spelling patterns and grammar. After the completed starting check, the Learn screen recommends twelve authored topic families from the independent baseline answers and the four most recent independent practice answers per family. Tricky answers are prioritised; unchecked topics are explicitly labelled as checks. Two recent successes invite a Year 2 challenge. A most recent Year 1 answer otherwise starts practice at Year 1. Each lesson selects five tasks around the chosen family, with a short mixed review, and offers Year 1 support after two consecutive misses. This selects authored tasks; the AI explains and discusses them rather than inventing unverified answer keys. The bank is a starter set, rather than a complete coverage or assessment of every curriculum outcome. It uses different questions from both assessment forms.

Finish the starting-point check before daily lessons. The baseline and four-week check remain independent from tutoring. New unfinished baseline questions use Years 1–2; saved earlier evidence, including older levels, remains unchanged. A completed five-question normal lesson is the only new activity that starts the 28-day clock, dated from that lesson’s start. Stopped lessons save their attempted questions but do not start the clock.

## Database update

Run `supabase/migrations/20261006_conversational_tutor.sql` in the existing Supabase SQL Editor. It is transactional and can be rerun. In the app, sign in, unlock the parent area and use **Copy database update** under Daily lessons. Paste into a new SQL query and select Run; refresh the app afterwards.

The migration extends learning sessions and adds owned `learning_attempts` and `tutor_turns`. Ownership rules deny anonymous and other-family access. Direct writes to daily attempts, receipts and existing session state are denied; RPCs atomically claim, save and stop each turn. Retries use the same request ID: a saved reply returns without another mark or provider call. A failed call can retry at the same revision with another conservative reservation. Stop invalidates an unfinished reply so a late result cannot save an answer.

Only grades, assistance flags and fixed strategy observation codes are long-term memory. The browser’s conversation is temporary. A short retry receipt can include the tutor’s response and fragments it quotes; reads expire after 24 hours and the existing pg_cron extension schedules deletion every ten minutes. No daily microphone audio or transcription is saved to the database. The child checks recognised words before sending them. Parent reports show results and tentative strategies, without assigning a fixed learning style.

## Australian voice

The app uses OpenAI-generated Coral, Nova or Shimmer audio. `/voice-check` plays real MP3 previews and saves the chosen voice on this device. Instructions request a warm young adult woman speaking General Australian English; accent and voice preference need listening verification and are not guaranteed by a prompt. No Microsoft/device voice is selected as a fallback.

Generic introductions are static MP3s that start from a tap. Actual tutor replies come from owned, completed reply receipts, and question audio from the current owned assessment. A protected same-origin media endpoint streams MP3 audio without a fetch-to-Blob delay. A private process buffer permits replays for 90 seconds with a 16-entry, 2 MiB per-entry bound; authorisation is checked before every replay. Missing playback events time out and cancelled audio cannot change later questions. Standard questions can be read without voice; spelling can be skipped unassessed if audio fails. Existing reading recordings keep their authenticated native audio controls.

## Provider and spending

The server calls the documented Chat Completions endpoint with `gpt-4.1-mini`, structured output and `store:false`, using the existing `SUMMER_OPENAI_KEY`. The cloud’s supported credential proxy successfully authenticated Chat Completions and audio but rejected the Responses endpoint; the application uses the working documented endpoint. Fictional adult diagnostic cases verified replies about both sound and mistaken reasoning. No real child record was created for testing.

OpenAI’s API data is not used for training by default. `store:false` disables saved completion application state; it does not remove default abuse-monitoring logs, which may retain prompts and replies for up to 30 days. See https://developers.openai.com/api/docs/guides/your-data and https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create.

Each AI turn reserves a conservative three US cents against the shared US$15 monthly app cap; transcription also reserves its estimated cost. Generated speech also reserves its estimated cost; public generic voice samples incur no per-play generation charge. A reservation is not an invoice. Failed provider calls retain their reservation because they may have been billed. The app never substitutes invented tutoring or fabricated progress for an unavailable provider.

## Verification

The usual install/typecheck/test/build commands remain unchanged. API tests exercise real handlers with isolated authentication/database/provider fixtures. `tests/tutor-schema.sql` and `tests/tutor-schema-concurrency.py` exercise a disposable PostgreSQL database; run them only against a test database prepared with the base schema and migration. They cover RLS, receipt deduplication, failed retries, reservations, completion, competing claims and Stop versus late commit. No baseline is reset or fabricated in the real family project.

Production readiness requires the database update and an authenticated family check on the phone. The stable site is https://summerlearns.vercel.app/; individual deployment URLs can open Vercel’s protection screen.

## Personalised lesson planning update

Apply `supabase/migrations/20261006_curated_learning.sql` after the tutor and reset migrations. Parent → Copy database update supplies just this small migration when the earlier tables are installed. The app probes `curated_learning_version()` and prevents new curated sessions before installation; existing active lessons retain their saved plans. The migration extends the atomic grading guard to respect each planned entry year while preserving ownership and reset locks. It is safe to repeat and does not rewrite results.

Only completed, active daily lessons contribute to recommendations. Archived results, assisted answers, ungraded reading observations and likely guesses are excluded. Daily responses under 1.5 seconds are conservatively withheld from recommendations. The original baseline and matched four-week reassessment remain separate. Recommendations describe practice needs, not standardised grades or secure mastery; word recognition and reading aloud still need their separate assessment and parent review rather than a substitute choice-based spelling task. `tests/curated-schema.sql` exercises Year 1 entry and rejects substituted Year 2 evidence in a disposable database.

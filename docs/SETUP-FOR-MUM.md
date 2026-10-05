# Using Summer’s Learning Lab

Open [summerlearns.vercel.app](https://summerlearns.vercel.app/) in iPhone Safari or laptop Chrome. Use your existing parent account and six-digit PIN; Summer needs no separate account.

## Enable the AI lessons

1. Tap the lock and unlock the parent area.
2. Under **Daily lessons · Years 1–2**, tap **Copy database update**.
3. Open your existing Supabase project → **SQL Editor → New query**.
4. Paste the update, tap **Run**, then refresh Summer’s app.

This adds the lesson records. It keeps the account, starting-point results and recordings. Do not delete tables or create another project. If the copy button is unavailable, use `supabase/migrations/20261006_conversational_tutor.sql` in GitHub. If Run shows an error, share its text without keys or passwords.

## Choose the Australian voice

Open [Choose Australian voice](https://summerlearns.vercel.app/voice-check). Choose a voice and tap **Try this voice**. This is a harmless preview that does not start an assessment. The app uses the selected Australian voice on that device, rather than generating another sound file each time.

If no Australian voice appears, on iPhone open Settings → Accessibility → Read & Speak (or Spoken Content) → Voices → English. Download an Australian voice and reopen the page. Check the accent and start-up speed on the actual phone. Each device keeps its own voice choice.

## Summer’s starting point and lessons

Finish the three starting-point sections first: maths, English and reading aloud. New questions start at Year 2, with Year 1 support when needed. These answers should be Summer’s own; helped and skipped answers remain separate. Previously saved results are kept.

Then choose **Maths lesson** or **English lesson** on Home. Summer can type an answer, explain how she worked it out, ask a question or use a hint. The AI creates its reply from what she says. **Talk to your tutor** records a short idea; check the recognised words and tap Send. These normal-lesson recordings are not saved. Tutor replies can also be read with voice off.

Five questions complete a lesson. A completed daily lesson starts the four-week clock from its start time. Visits and starting-point questions do not count. The later check uses fresh matched questions and keeps the original starting record unchanged.

## Parent progress

The parent area shows her starting point, daily lesson results, strategies she has explained and the four-week comparison when ready. Strategy observations are tentative; the tutor does not assign a fixed learning style or diagnose her level from one answer.

Starting-point reading recordings can be played and reviewed in the parent area. These are designed to expire after 30 days; the cleanup job’s actual operation still needs checking. Computer reading estimates are not reliable grades. Your reviews remain saved after the recording expires.

The live provider diagnostic and automated checks use fictional examples. Actual iPhone microphone capture, the new voice timing/accent and cross-device saved progress still need a family check. After Summer saves real progress, sign in on the other device and confirm the same completed lessons appear.

The existing keys and Vercel settings stay in place. **Configure setup instructions** prepares the Codex development environment; the app runs on Vercel separately. Do not paste passwords or keys into chat. Technical details and provider retention are in `docs/TUTOR.md`.

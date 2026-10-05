# Summer’s visual redesign

The connected app now follows the supplied lavender, navy and peach reference. Its assessment selection, question wording, answer marking, four-week schedule, database schema and saved baseline remain unchanged. Display-only metadata supplies section counts and the existing independently marked answers for the completion screen.

## File-by-file changes

| File | Change |
| --- | --- |
| `app/globals.css` | Replaces the old theme with shared colour, type, shape and motion tokens. Adds white background waves, rounded panels, peach actions, navy navigation, responsive grids, readable Lexend questions, AA control outlines and reduced-motion support. |
| `app/learning-lab.tsx` | Restyles welcome, home, section list, questions, reading, break, completion, progress, Me and parent screens. Adds presentation-only search and chips, real progress displays and replaceable art slots. Preserves assessment and parent handlers. Completes the earlier voice replay/cancellation work; fixes stale microphone callbacks, completion navigation after failed speech and the existing parent PIN expiry display. |
| `app/ui/presentation.tsx` | Shared two-line titles, illustration images, round arrow buttons, count rings and progress tracks. |
| `app/layout.tsx` | Updates description, app icon and browser theme colour; keeps Australian locale. |
| `app/api/state/route.ts` | Adds read-only current warm-up section counts and availability. |
| `app/api/assessment/route.ts` | Includes display counts when returning the existing next question. |
| `app/api/answer/route.ts` | Includes display counts when returning the existing next question after a saved answer. |
| `app/api/reading/route.ts` | Includes display counts after the existing reading save. Recording and transcription behaviour is unchanged. |
| `lib/progress.ts` | Adds read-only question counts and completion metadata from existing saved marks; does not change selection, marking or session limits. |
| `lib/presentation-progress.ts` | Computes factual counts, next-section availability and existing independent-answer results. Helped, skipped and likely guessed answers stay out of the completion score; reading estimates never become a child-facing grade. |
| `package.json` | Pins Lucide React for one consistent outline icon set. |
| `package-lock.json` | Records that dependency for reproducible installs. |
| `public/manifest.webmanifest` | Matches the new background, theme and icons for the installed app. |
| `public/icon.svg` | Lucide BookOpen icon in peach on navy. |
| `public/app-icon.png` | 192px raster version for the installed app and Apple icon. |
| `public/assets/plus-jakarta-sans-latin-wght-normal.woff2` | Self-hosted variable UI font, weights 200–800. |
| `public/assets/plus-jakarta-sans-latin-wght-italic.woff2` | Self-hosted italic variable font for title second lines. |
| `public/assets/plus-jakarta-sans-LICENSE` | Font’s SIL Open Font License. |
| `public/illustrations/welcome-hero.png` | Palette gradient placeholder for the welcome character. |
| `public/illustrations/avatar.png` | Palette gradient avatar placeholder. |
| `public/illustrations/trophy.png` | Palette gradient achievement placeholder. |
| `public/illustrations/section-maths.png` | Maths shortcut placeholder. |
| `public/illustrations/section-english.png` | English shortcut placeholder. |
| `public/illustrations/section-reading.png` | Reading shortcut placeholder. |
| `public/illustrations/card-maths.png` | Maths card art placeholder. |
| `public/illustrations/card-english.png` | English card art placeholder. |
| `public/illustrations/card-reading.png` | Reading card art placeholder. |
| `public/illustrations/lesson-complete.png` | Completion illustration placeholder. |
| `public/illustrations/movement-break.png` | Break illustration placeholder. |
| `public/illustrations/sidekick.png` | Companion illustration placeholder. |
| `tests/presentation-progress.test.ts` | Checks resumed counts, section order, follow-up readiness and independent-score exclusions. |
| `docs/ILLUSTRATIONS.md` | Every illustration filename, size, subject and PNG replacement instructions. |
| `docs/american-spelling-audit.md` | Audit of all 240 authored items and current fixed tutor lines; no American spellings found. |
| `docs/design-reference.json` | Reference evidence and transferable layout, type, palette and restraint rules. |
| `docs/design-signals.json` | Records the implemented visual choices and preserved constraints. |
| `docs/REDESIGN.md` | This handover, scope and verification record. |
| `README.md` | Updates development, service and asset status, removing obsolete missing-table and credit blockers. |

The separately requested voice improvement also changes:

| File | Change |
| --- | --- |
| `lib/config/models.json` | Natural speaking speed, Marin voice and explicit General Australian English instructions; versioned voice cache keys. |
| `lib/voice.ts` | Uses those configured voice settings, mature fixed UI copy and a bounded volatile cache for non-personal fixed instructions. Existing spending reservations still happen before each provider generation. |
| `lib/audio-cache.ts` | Bounded in-memory successful-audio cache; deduplicates simultaneous loads, retries failures and prevents cleared results from returning. No persistent audio storage. |
| `app/api/speech/route.ts` | Keeps authentication and current-item checks before voice playback; caches only known fixed instructions and excludes inherited object properties. |
| `tests/audio-cache.test.ts` | Covers concurrent loads, retries, cancellation/clear, memory limits, expiry and distinct spelling/voice keys. |

## Illustration inventory

See [ILLUSTRATIONS.md](ILLUSTRATIONS.md) for all 12 filenames, exact pixel dimensions and intended replacement art. Replace each PNG using the same filename. There are no required words or controls inside the decorative images.

## Reference differences

- The requested 3D clay artwork is represented by finished gradient placeholders, ready for the parent’s PNG replacements. No code-generated clay characters, emoji or clip art are used.
- The current app has three initial/follow-up assessment sections. Its lesson list displays those existing sections; daily lessons remain the next phase.
- The current assessment adapts difficulty automatically and has no manually selectable lesson levels. Subject and availability chips preserve that order; “Starting point” describes the current stage without inventing a school-year grade.
- Completion displays independently marked correct answers where available and one evidenced skill. Reading has no reliable existing child-facing grade, so its computer estimates remain in the parent area. Untested, helped and skipped items are never presented as earned scores.
- A navy progress track beneath peach fill provides stronger non-text contrast than the reference’s white track. The purple used behind white text is the requested darker `#5E60CE`.
- Only “Keep going” is supplied beside the reserved reward space. The future reward reveal is not implemented.

## Verification

- Frozen `npm ci`, 31 tests, TypeScript and production build passed.
- Browser checks passed welcome dismissal without starting an assessment; subject/search/availability filters; audio completion gates; hints marking assistance; answers; hidden spelling targets; skips; movement break; choice selection; completion and its independent score; progress and Me navigation.
- A synthetic Chromium microphone captured a recording, previewed and submitted it through mocked private routes. Cancellation while question speech was pending returned Home without reviving the session. Failed audio was retried; repeated welcome playback used one successful audio load.
- Mocked parent flows passed sign-in, PIN, subject filtering, recording playback, review save, the existing ten-minute expiry and sign-out. Actual anonymous parent and answer endpoints returned 401.
- All 14 tested screen states had zero automated WCAG A/AA violations. Controls were at least 44px and no horizontal overflow occurred at 320, 390 or 1280px. Desktop cards used three columns. Reduced-motion support was checked independently.
- Lesson JSON, assessment marking logic and database schema match their original Git versions exactly.
- A live adult diagnostic request with the new voice produced a 3.816-second MP3 in about 3.3 seconds. This confirms generation, not the perceived quality of an Australian accent; the parent should listen. Real iPhone playback/capture, cross-device saves and successful scheduled deletion remain outside the mocked browser checks.
- Node 24’s `NODE_USE_ENV_PROXY=1` allows the cloud app to use the inherited managed proxy. Node checks to Supabase and OpenAI returned 200; Supabase reported public sign-ups disabled. Startup instructions record this cloud-only setting.
- Vercel’s supplied deployment hostname is blocked by this instance’s runtime network policy. Git publication and local checks do not establish that a fresh Vercel deployment is Ready.

## American spelling

None found across the 60 skill descriptions, all 240 items (including spelling targets, passages, spoken prompts, choices and accepted answers) and the 19 current fixed tutor lines. The detailed audit is in [american-spelling-audit.md](american-spelling-audit.md). Authored lesson content was not changed.

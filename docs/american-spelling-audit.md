# American spelling audit

**No American spellings requiring an Australian replacement were found in the audited lesson, assessment and current fixed UI voice content.** This audit did not change lesson wording or accepted answers.

## Scope

Reviewed all 60 skills and 240 assessment items in `data/skill-map.json`:

| Field | Text values reviewed |
| --- | ---: |
| Skill descriptions | 60 |
| Item prompts | 240 |
| Spoken prompts | 240 |
| Reading/comprehension passages | 48 |
| Choice labels | 270 |
| Accepted answers | 240 |

These 1,098 values include every spelling target across the 36 spelling items. No target was excluded as an intentional spelling variant. The 19 current fixed child-facing tutor/UI voice lines in `lib/voice.ts` were re-read after their visual-copy update. JSON keys, IDs, model names and programming conventions were excluded from the spelling assessment.

## Findings

| American occurrence | Skill/item ID and field | Suggested Australian spelling |
| --- | --- | --- |
| None found | All content within the scope above | No change required |

No vocabulary replacement is proposed. The verdict above is a spelling finding for the explicitly listed strings.

## Method and context checks

Extracted the specified JSON text fields, reviewed their complete 874-word lexical inventory, checked common US/Australian spelling differences, and examined full sentences for ambiguous uses. Existing Australian forms include **colour**, **recognise**, **centimetres**, **labelled** and **harbour**.

The assessment contains 12 occurrences of **practised**, all correctly used as verbs. For example, `english-y3-simple-inference-baseline-1` uses “The dancer practised…” in `spokenPrompt` at `data/skill-map.json:4510` and `passage` at line 4521. The current tutor line “We can practise that one later” at `lib/voice.ts:16` also correctly uses the Australian verb **practise**. The current voice lines also use **Maths** and **Mum**. There are no occurrences of **practice**, **practiced** or **practicing** in the assessed JSON fields. **Practice** would be valid Australian spelling when used as a noun; it was not treated as automatically American.

This audit covers the checked-in strings above. It does not assess a synthesised voice’s accent or future generated content.

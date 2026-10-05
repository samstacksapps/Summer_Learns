# Summer’s source-mapped skill samples

`skill-map.json` contains 60 focused skills and 240 original assessment items:
six maths and six English skills for each teaching band from Pre-primary to
Year 4. Each skill has two baseline items and two different follow-up items.
The Year 1 starting content is deliberately accessible; an adaptive warm-up
can move towards easier or harder items without presenting all 240 items.

The topic and year-band mappings were reviewed against the currently
published official SCSA sources on **6 October 2026**:

- [Mathematics syllabus](https://k10outline.scsa.wa.edu.au/home/wa-curriculum/learning-areas/mathematics/p-10-mat-curriculum/pre-primary-to-year-10-mathematics-syllabus)
  and [Pre-primary–Year 6 scope and sequence, implementation 2026](https://k10outline.scsa.wa.edu.au/__data/assets/pdf_file/0006/1229469/Mathematics_Scope-and-sequence_P-6_For-implementation-in2026.PDF).
- [English syllabus](https://k10outline.scsa.wa.edu.au/home/wa-curriculum/learning-areas/english/p-10-english-curriculum/p-10-english-curriculum)
  and [mandated scope and sequence, implementation 2025](https://k10outline.scsa.wa.edu.au/__data/assets/word_doc/0003/1163190/English_Scope-and-sequence-of-the-mandated-curriculum_P-10-For-implementation-in-2025.DOCX).

Earlier curriculum-browser paths had failed; the current official landing
pages supplied the working syllabus and document links. English’s current
published document begins implementation in 2025, while Mathematics’s
revised document begins implementation in 2026. Each skill now records its
source document, year column, section and a paraphrased descriptor summary
in `curriculumReference`. Maths also records printed pages; PDF viewer pages
are four pages ahead of those printed numbers. No curriculum codes are
invented.

`curriculumVerified: true` means that the topic has support in the cited
teaching band. **It does not mean that these original items form a validated
assessment**, test every part of a descriptor, or establish that a child is
working at a particular school-year level. Several items are deliberate
scaffolds at the accessible end of a band.

The source review corrected these draft items before enabling the mapping:

| Stable skill ID | Supported scope now sampled | Official section and printed pages |
| --- | --- | --- |
| `maths-y1-hour-half-hour` | Full-hour digital clock times | Non-spatial measurement, p. 21 |
| `maths-y1-recognise-money-values` | Coin-value recognition and comparison, without dollar-to-cent conversion | Financial mathematics, p. 14 |
| `maths-y4-metric-and-perimeter` | Perimeter found by adding boundary lengths, without metric conversion | Two-dimensional space and structures, pp. 55–56 |
| `maths-pp-name-basic-shapes` | Naming visible shapes, without side/corner-property questions | Two-dimensional space and structures, p. 16 |
| `maths-y4-angle-size` | Comparison with a right angle, without acute/obtuse names | Two-dimensional space and structures, p. 58 |

Stable IDs retain their original slugs to avoid breaking existing references;
the descriptions and questions define the narrowed scope. Pre-primary length
questions now compare visible lines directly, and small-group arithmetic
includes visible objects. The Year 4 less-regular spelling examples were
also revised to two-syllable words to better sample that band’s complex
letter-pattern content.

This is a priority map for Summer’s starting needs, not a complete syllabus.
Maths samples counting, place value, addition and subtraction, equal groups,
multiplication and division, simple fractions, measurement, time, money and
shape. English samples sound awareness, phonics and spelling patterns,
common-word recognition, short oral reading, supported comprehension and
vocabulary. Writing and a complete statistics-and-probability programme
are outside this first focused map.

Baseline and follow-up items target the same skills with similar demands.
They are not standardised or statistically equated. Report skill-specific
evidence and its confidence, rather than converting a short warm-up into a
definitive school-year level. An unvisited skill remains unassessed. Two
samples can suggest a starting point; secure mastery still requires the
brief’s repeated evidence across at least three separate learning sessions.
For the four-week comparison, keep the evidence about matched sampled
skills separate from additional skills first observed at follow-up.

English comprehension stories are intentionally read aloud: their results
describe **supported listening comprehension**. Independent reading passages
must stay silent. Word-recognition instructions say the target word, but the
written choices must not be read aloud before the answer. Spelling items
show only the generic instruction; their target and spoken sentence stay
in server-private content and are delivered as audio. Never expose
`acceptedAnswers` in a child payload, or show spelling `spokenPrompt` as a
caption that reveals the answer.

Phoneme audio needs a listening check before child use. The affected IDs are
`english-pp-initial-sounds` and `english-pp-blend-three-sounds`; official
curriculum mapping does not verify their synthesised pronunciation. A speech synthesiser
may say letter names instead of pure sounds; unclear audio invalidates that
item. Skip it and retain an unassessed result rather than interpreting an
incorrect response as a gap. Reading-aloud scores also need a parent review:
speech recognition may replace a child’s actual pronunciation with the word
it assumes was intended. Keep those results explicitly labelled as estimates.

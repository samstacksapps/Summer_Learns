# Illustration replacement guide

Every illustration in the redesigned app has its own PNG in `public/illustrations/`. The current files are transparent, original geometric placeholders with soft gradients in the app's palette. They are intentionally abstract: the app is ready for replacement 3D artwork without imitating the reference's characters or using emoji.

Replace a PNG with your finished artwork using **the same filename**. Keep the aspect ratio and at least the pixel size below. Transparent backgrounds are recommended; leave a little transparent space around the subject so it does not meet the card edges. The layout uses `object-fit: contain`, so a larger image with the same ratio also works. Illustration files are decorative and do not contain controls or required text.

| Filename in `public/illustrations/` | Pixel size | What the replacement should show | Where it is used |
| --- | --- | --- | --- |
| `welcome-hero.png` | 800 × 900 | A capable Year 3 learner with books, in a relaxed pose; no words baked into the image. | Welcome screen hero |
| `avatar.png` | 160 × 160 | A simple portrait or personal avatar for Summer. | Home greeting and profile |
| `trophy.png` | 360 × 360 | One polished trophy or achievement object. | Home level and progress card |
| `section-maths.png` | 160 × 160 | A compact maths object, such as a few tactile number blocks. | Maths section shortcut |
| `section-english.png` | 160 × 160 | A compact English object, such as an open notebook and pencil. | English section shortcut |
| `section-reading.png` | 160 × 160 | A compact reading object, such as a book and bookmark. | Reading section shortcut |
| `card-maths.png` | 600 × 440 | A small maths scene with counting or place-value objects. | Maths section and lesson cards |
| `card-english.png` | 600 × 440 | A small writing or spelling scene with a notebook and letters. | English section and lesson cards |
| `card-reading.png` | 600 × 440 | A small reading scene with a learner and book. | Reading section and lesson cards |
| `lesson-complete.png` | 480 × 360 | One restrained achievement object or a relaxed learner after finishing. Leave reward imagery out until it is added later. | Completion screen |
| `movement-break.png` | 480 × 360 | A learner stretching or standing for a short break. | Movement break screen |
| `sidekick.png` | 480 × 480 | Summer's preferred lizard or gecko companion, with a calm expression. | Profile and companion screen |

The illustrations should use lavender, purple, peach, navy, sky and pink to match the interface. Avoid text, bright primary-colour rainbows and additional decorative icons. The app supplies headings, progress and actions separately.

The app icon is separate from those 12 illustration slots: `public/app-icon.png` is 192 × 192, generated from `public/icon.svg`. It uses the same Lucide BookOpen outline as the interface, in peach on navy. Keep the SVG and PNG in step if the app icon changes.

## Self-hosted typefaces

`public/assets/plus-jakarta-sans-latin-wght-normal.woff2` and `public/assets/plus-jakarta-sans-latin-wght-italic.woff2` are the Google Fonts Plus Jakarta Sans family, obtained through Fontsource Variable 5.3.0. Both support weights 200–800. The accompanying `public/assets/plus-jakarta-sans-LICENSE` is the SIL Open Font License 1.1. These files are served by the app; a browser does not need to connect to Google Fonts. Lexend remains the reading and question typeface.

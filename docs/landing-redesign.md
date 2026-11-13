# RoomLine landing page: design brief

## Concept: the open door

RoomLine's mark is an arched doorway with the door swung open and warm light inside. The landing page uses that image and little else. It has a calm paper ground, a deep forest panel where the doorway glows, and brass light falling from the door onto the floor. Short headlines in a warm serif carry the message.

The page is deliberately simple. There are no product mockups, no feature cards and no icons. Each section makes one point in a few words. There is one primary action, **Create workspace** (`/sign-up`), and one secondary action, **Sign in** (`/sign-in`).

The page reads in this order:

1. What it is.
2. What it does.
3. How fast you can start.
4. The call to action.

## Palette

The logo colours are unchanged. `BRAND` in `lib/brand/mark.ts` is not edited, so the PWA icons, `public/sw.js` and `tests/pwa/*` are untouched.

| Token | Hex | Use | Contrast |
| --- | --- | --- | --- |
| `--rl-paper` | `#F5F3EE` | Page ground (warm limewash) | — |
| `--rl-paper-2` | `#ECE9E1` | The setup band | — |
| `--rl-ink` | `#10241E` | Headings, primary button, door panel (brand ink) | 14.64 : 1 on paper |
| `--rl-text` | `#1E2B26` | Body text | 13.25 : 1 on paper |
| `--rl-muted` | `#55635D` | Secondary text | 5.69 : 1 on paper, 4.88 : 1 on paper-2 |
| `--rl-on-forest` | `#F3F1EA` | Text on the forest band | 14.37 : 1 |
| `--rl-on-forest-muted` | `#A9B7B0` | Secondary text on forest | 7.80 : 1 |
| `--rl-brass` | `#D8B25C` | Door light, button on forest, step marker | 8.08 : 1 vs ink |
| `--rl-line` / `--rl-line-strong` | ink at 12 % / 20 % | Hairlines | Non-text |

The door panel is exactly the brand ink, so the app-icon tile of `RoomLineMark` disappears into it and only the lit doorway shows. The mark itself is not redrawn or recoloured. The floor light is a separate SVG layer that starts below the threshold.

## Type

There are two typefaces, loaded with `next/font` in `components/landing/fonts.ts`. Both are preloaded on `/` only and scoped to `.rl-landing` through CSS variables.

- **Fraunces** (variable, with the optical-size axis) for headlines. Optical size is pinned to 60 at display sizes so the large headlines keep their warmth without hairline spikes.
- **Plus Jakarta Sans** for text and controls. The product uses the same face.

| Step | Size (360 → 1440 px) | Line height | Tracking |
| --- | --- | --- | --- |
| Display (h1, closing) | 46 → 104 px | 0.96 | −0.035em |
| H2 | 34 → 60 px | 1.02 | −0.03em |
| Feature title (h3) | 26 → 44 px | 1.08 | −0.025em |
| Lead | 18 → 20 px | 1.5 | −0.005em |
| Body | 16 → 17 px | 1.6 | 0 |
| Small | 14 px | 1.5 | 0 |

Every headline is two lines or fewer at every width.

## Grid and spacing

- 12 columns, with a max content width of 1312 px. The outer margin is `clamp(20px, 5vw, 72px)` (plus iOS safe areas) and the gutter is `clamp(16px, 2vw, 32px)`.
- The hero is asymmetric: copy spans 7 columns and the door spans 5. Feature rows put the title in columns 1–7 and the line of text in columns 8–12.
- Spacing scale (8 pt): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160. Sections are 96 px apart on phones and 160 px on desktop.
- Radii: 10 px for buttons and 16 px for the door panel.
- Depth comes from colour fields and hairlines only. There are no shadows at rest and no gradients, except the soft floor light.

## Motion

- The hero runs on CSS keyframes, with no JavaScript on the critical path. The headline lines rise in turn (0 and 90 ms), followed by the supporting line (200 ms), the actions (280 ms) and the door panel (160 ms). Each takes 600 ms on `cubic-bezier(0.23, 1, 0.32, 1)`. The floor light then fades on, as if someone turned the lights on.
- Sections use one tiny client component, `RevealObserver`, which runs one IntersectionObserver. Blocks below the fold rise 20 px and fade in once, staggered by 70 ms. Content is visible by default if the script never runs.
- Buttons scale to 0.97 when pressed, and the arrow moves 3 px on hover. Hover effects are gated behind `(hover: hover) and (pointer: fine)`.
- Only `transform` and `opacity` animate. With `prefers-reduced-motion: reduce`, the page shows the final state with no animation.

## Sections

1. **Header:** wordmark, Sign in, Create workspace.
2. **Hero:** "Run a calmer front desk.", one supporting line, the actions and the lit doorway.
3. **The whole day, on one screen:** four rows, a title and one line each (calendar, bill, booking page, night audit).
4. **Live in an afternoon:** four steps on one line.
5. **Closing:** "Your front desk, calmer by tonight." and the actions.
6. **Footer:** a single line.

There is no testimonial, logo wall or pricing section, because none of that content exists yet. There is also no placeholder content.

## Quality bar

- [Mercury](https://mercury.com): calm, warm financial software, restrained serif display type and confident whitespace.
- [Linear](https://linear.app): strict grid, typographic hierarchy, quiet motion.
- [Stripe](https://stripe.com): precision in spacing and alignment.

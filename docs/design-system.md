# RoomLine brand surfaces: design system

Covers the landing page, sign-in, sign-up, onboarding, the staff invite page, the account-status pages (`/suspended`, `/deactivated`) and the installed PWA's launch. The dashboard and guest booking pages keep their own theme.

Tokens: `app/rl-theme.css`. Account-screen layout: `app/rl-pages.css`. Landing layout: `app/landing.css`. Brand mark: `lib/brand/mark.ts`.

## Audit (before this redesign)

1. **Two palettes per surface.** Landing used warm paper and forest ink; sign-in/up used a different hard-coded cream and ink; onboarding used zinc greys; suspended used the dashboard's indigo. Nothing shared tokens.
2. **The landing page showed no product.** A logo in a dark box was the only visual, and pricing, proof and "how it works" detail were missing or one line each.
3. **Auth pages repeated themselves.** Our heading said "Welcome back", then Clerk's card said "Sign in to My Application". Two cards and two titles stacked, with Clerk's own shadowed card inside our frame.
4. **The invite page had wrong facts.** It said "Expires in 7 days" when invites last 48 hours, never said who sent the invite, showed raw error strings, and a signed-in user with another account polled forever on "Adding you…".
5. **The suspended page read as a punishment.** A red shield, "is suspended", one sentence and no reason or reassurance. Owners and staff saw the same text, the deactivated page linked support to `#`, and the support email had odd casing.
6. **The PWA launched with a colour jump.** The manifest `background_color` (#FAFAF8) did not match the dashboard (#FBFDFF), there were no iOS startup images, the scope was `/dashboard` (sign-in opened a browser bar inside the installed app), and the fixed header ignored safe-area insets.
7. **Type and spacing drifted.** Onboarding titles were 24–27 px semibold, auth titles were 32–36 px serif, and buttons were 40, 44 and pill-shaped in different places.

## Direction

**Palette.** Warm white `#FBFAF7` and near-black `#141413` carry every page. Colour comes in fields, never as gradients:

| Token | Hex | Use |
| --- | --- | --- |
| `--rl-sun` | `#FFC23D` | Marigold. The lit doorway in the logo, the hero tile, the CTA on ink |
| `--rl-laterite` | `#FF7A52` | Coral of the red earth. The showcase tile and its accent rules |
| `--rl-lagoon` | `#A9DCFF` | Atlantic sky. A benefit card; its wash is a page tone |
| `--rl-dusk` | `#D9CCFF` | Evening lilac. Its wash is a page tone |
| `--rl-muted` | `#5F5B55` | Secondary text. At least 5.8:1 on paper and every wash |
| `--rl-ok` | `#1F7A4D` | Only for "Paid" and reassurance |

Ghana shows up as warm light and red earth, plus real details: GHS amounts, MTN MoMo, Accra time, and local names alongside international ones. It never uses flag colours or kente.

**Type.** Plus Jakarta Sans only, which is also the product's face. Display text is 800 weight with −0.045em tracking (44 → 88 px). Headings are 700 weight with −0.035em (32 → 56 px), and body text is 16 px.

**Spacing and shape.** The spacing scale is 4, 8, 12, 16, 24, 32, 48, 64, 96 and 128 px. Radii are 8 for chips, 12 for fields, 16 for panels and 24 for frames and tiles; buttons are pills. Every control on account screens is 48 px tall.

**Motion.** Every curve uses `cubic-bezier(0.23, 1, 0.32, 1)`. Presses scale to 0.97 over 140 ms, hovers only change colour, reveals rise 16 px once with a 60 ms stagger, and screens enter with a 420 ms fade-rise. As the landing page scrolls, its background eases between section tones over 700 ms through a registered `--rl-tone` custom property. With reduced motion there is no travel, the films show their final frame, and tones switch instantly.

## Product films (Remotion)

`components/landing/film/`. Each scene is a pure function of `frame`, so the same markup renders in three places:

- **Remotion Player.** It loads on demand when the film scrolls into view, plays once, pauses off screen, and has one pause, play or replay control (WCAG 2.2.2).
- **Server poster.** Frame 0 is rendered as HTML and sized with container-query units (`--u`), so the frame has content before any JavaScript runs and the layout does not shift.
- **Remotion Studio.** Run `pnpm film:studio` to edit timings, or `pnpm film:render` to export an MP4.

The two films are:

| Film | Shows | Cuts |
| --- | --- | --- |
| Calendar (hero) | A booking-page booking paid with MoMo lands on the calendar, week revenue rises by GHS 1,350, and an arrival is checked in | 1280×800 from 1024 px, 520×700 below |
| Folio (showcase) | A MoMo approval takes a GHS 1,360 balance to zero, then the night audit closes the day | 480×640 |

## Account screens

`components/brand/auth-shell.tsx` frames every account screen. Phones get one column; from 1024 px an ink panel with the lit doorway sits on the left. Clerk renders the form with `components/brand/clerk-appearance.ts`, which flattens its card, hides Clerk's logo and turns off optional fields. The start-screen copy is set through `localization` on `ClerkProvider`.

- **Invite.** A card shows the hotel, who invited you (`staff_invitations.invited_by_staff_id`), your role and what it can do, and when the invite expires. Each edge state gets its own screen: incomplete link, invalid link, expired, already used, check failed, and signed in as someone else (sign out, then return to the link).
- **Suspended.** Owners and staff get different text. The page gives the reason (`after_state.reason` on the `hotel.suspend` audit row, chosen in the platform suspend dialog), states what happens to the booking page and who can restore access, and confirms that records are kept. Support and sign-out are always available.

## PWA launch

- **Icons.** `pnpm icons` builds everything from `lib/brand/mark.ts`. The 192 and 512 `any` icons are rounded tiles. The maskable icons are full-bleed with the glyph at 80% of the safe radius. The 180 px apple-touch-icon is opaque. The favicon is an SVG plus a 16/32/48 ICO.
- **Splash.** The iOS set is 30 exact-size startup images (`lib/brand/splash.ts`): every iPhone size from SE to 16 Pro Max, and iPads in both orientations. Each centres the tile at 27% of screen width on phones (capped at 200 CSS px on iPad) over `#FBFDFF`, the dashboard background. Android's splash is built from the same `background_color`, `theme_color` and icon.
- **Shell.** The page uses `viewport-fit=cover`. The header grows by `safe-area-inset-top` and respects side insets, and the content clears the home indicator. The status bar style is `default` and the theme colour equals the header.
- **Scope.** The scope is `/`, so expired sessions, onboarding and invites stay inside the app window. The `id` is unchanged (`/dashboard`), so existing installs keep their identity.

## Open items

- **Pricing and customer proof.** Both are left off the page until real numbers and customers exist. The trust section states only facts the product backs today.
- **Photography.** Commission photos of real Ghanaian guesthouses (front desks, morning light, staff at work) before adding any imagery.
- **Accept with an existing account.** Invites currently require a new account. Accepting with the signed-in account needs a server action that mirrors the Clerk webhook.

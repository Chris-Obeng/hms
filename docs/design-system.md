# Oriel brand surfaces: design system

Covers the landing page, sign-in, sign-up, onboarding, the staff invite page, the account-status pages (`/suspended`, `/deactivated`) and the installed PWA's launch. The dashboard and guest booking pages keep their own theme.

Tokens: `app/rl-theme.css`. Account-screen layout: `app/rl-pages.css`. Landing layout: `app/landing.css`. Brand mark: `lib/brand/mark.ts`.

## Name and mark

**Oriel.** An oriel is a bay window that throws light into a room. The name is short, English, and works in any market, and it gives the brand one idea: light coming in through a window.

**Mark.** A marigold sun with an arched window cut through it. It reads as the "O" of Oriel and as light seen through a window. Two shapes, so it holds at 16 px. The geometry lives in `lib/brand/mark.ts`; `OrielMark` (ink tile), `OrielGlyph` (bare) and `OrielLogo` (lockup) live in `components/brand/oriel-mark.tsx`. The wordmark is lowercase Plus Jakarta Sans 800.

Explorations are in `docs/brand/`. The chosen mark is R3 on `logo-explorations-2.png`. References used for direction: Airbnb's Bélo (one shape, one idea), Mercury and Linear (restraint, typographic confidence), and Mews (colour fields).

Internal identifiers keep the old prefix on purpose: CSS classes (`rl-*`), storage keys, the `X-RoomLine-Offline` header, the service worker cache names and the calendar UID domain. Changing them would break installed apps, saved drafts and subscribed calendars.

**Before launch:** run a trademark search for "Oriel" in hotel software in your launch markets, and confirm the support domain. `NEXT_PUBLIC_SUPPORT_EMAIL` still defaults to the existing `support@roomline.pro` mailbox.

## Audit (before this redesign)

1. **Two palettes per surface.** Landing used warm paper and forest ink; sign-in/up used a different hard-coded cream and ink; onboarding used zinc greys; suspended used the dashboard's indigo. Nothing shared tokens.
2. **The landing page showed no product.** A logo in a dark box was the only visual, and pricing, proof and "how it works" detail were missing or one line each.
3. **Auth pages repeated themselves.** Our heading said "Welcome back", then Clerk's card said "Sign in to My Application". Two cards and two titles stacked, with Clerk's own shadowed card inside our frame.
4. **The invite page had wrong facts.** It said "Expires in 7 days" when invites last 48 hours, never said who sent the invite, showed raw error strings, and a signed-in user with another account polled forever on "Adding you…".
5. **The suspended page read as a punishment.** A red shield, "is suspended", one sentence and no reason or reassurance. Owners and staff saw the same text, the deactivated page linked support to `#`, and the support email had odd casing.
6. **The PWA launched with a colour jump.** The manifest `background_color` (#FAFAF8) did not match the dashboard (#FBFAF7), there were no iOS startup images, the scope was `/dashboard` (sign-in opened a browser bar inside the installed app), and the fixed header ignored safe-area insets.
7. **Type and spacing drifted.** Onboarding titles were 24–27 px semibold, auth titles were 32–36 px serif, and buttons were 40, 44 and pill-shaped in different places.

## Direction

**Palette.** Warm white `#FBFAF7` and near-black `#141413` carry every page. Colour comes in fields, never as gradients:

| Token | Hex | Use |
| --- | --- | --- |
| `--rl-sun` | `#FFC23D` | Marigold. The lit doorway in the logo, the hero tile, the call to action on ink and the sign-in panel |
| `--rl-laterite` | `#FF7A52` | Coral of the red earth. The showcase tile and its accent rules |
| `--rl-lagoon` | `#A9DCFF` | Atlantic sky. A benefit card; its wash is a page tone |
| `--rl-dusk` | `#D9CCFF` | Evening lilac. Its wash is a page tone |
| `--rl-muted` | `#5F5B55` | Secondary text. At least 5.8:1 on paper and every wash |
| `--rl-ok` | `#1F7A4D` | Only for "Paid" and reassurance |

Ghana shows up as warm light and red earth, plus real details: GHS amounts, MTN MoMo, Accra time, and local names alongside international ones. It never uses flag colours or kente.

**Type.** Plus Jakarta Sans only, which is also the product's face. Section headings are two-tone (after Linear): the point in ink, the explanation in the same size at 42% ink. Display text is 800 weight with −0.045em tracking (44 → 88 px). Headings are 700 weight with −0.035em (32 → 56 px), and body text is 16 px.

**Spacing and shape.** The spacing scale is 4, 8, 12, 16, 24, 32, 48, 64, 96 and 128 px. Radii are 8 for chips, 12 for fields, 16 for panels and 24 for frames and tiles; buttons are pills. Every control on account screens is 48 px tall.

**Motion.** Every curve uses `cubic-bezier(0.23, 1, 0.32, 1)`. Presses scale to 0.97 over 140 ms, hovers only change colour, reveals rise 16 px once with a 60 ms stagger, and screens enter with a 420 ms fade-rise. As the landing page scrolls, its background eases between section tones over 700 ms through a registered `--rl-tone` custom property. With reduced motion there is no travel, the films show their final frame, and tones switch instantly.

## Landing page

Header, hero, product showcase (Fig. 02), three benefit cards, a direct-booking calculator, how it works, trust facts, questions, closing call to action, and a footer with a full-width wordmark.

- **Primary action:** "Set up your hotel" everywhere (`PRIMARY_ACTION` in `components/landing/action-link.tsx`).
- **Figure labels:** "Fig. 01 / The room calendar" in mono above each film, like a drawing label.
- **Calculator:** after Airbnb's earnings estimator. It is plain arithmetic on the visitor's own numbers (rooms, rate, rooms sold, commission) and shows what a booking site would take. It makes no claim about Oriel's fees.
- **Questions:** a HeroUI Accordion. Every answer states only what the product does today.

## Onboarding

One 440 px form column. From 1024 px a live preview of the guest booking page sits beside it on a marigold field and fills in as the owner types: name, type, city, rooms, phone and email. The preview is hidden on phones so the form stays fast and focused. The final step says "Finish setup". The done screen shows the booking link and three numbered next steps (rooms and rates, team, payouts).

## Product films (Remotion)

`components/landing/film/`. Each scene is a pure function of `frame`, so the same markup renders in three places:

- **Remotion Player.** It loads on demand when the film scrolls into view, plays once, pauses off screen, and has one pause, play or replay control (WCAG 2.2.2).
- **Server poster.** Frame 0 is rendered as HTML and sized with container-query units (`--u`), so the frame has content before any JavaScript runs and the layout does not shift.
- **Remotion Studio.** Run `pnpm film:studio` to edit timings, or `pnpm film:render` to export an MP4.

Booking colours in the calendar film are the product's own status palette from `app/dashboard/calendar/calendar.css`: confirmed is blue, in house is green, pending is amber, checked out is slate, and out of order is hatched. A legend sits under the wide cut. New bookings arrive as a system-style notification with the Oriel icon, not a coloured toast.

On phones and tablets the calendar is a phone screen inside a phone frame, rising out of the marigold tile and cropped at the bottom, with wider day columns that run off the edge like a scrolled calendar.

The two films are:

| Film | Shows | Cuts |
| --- | --- | --- |
| Calendar (hero) | A booking-page booking paid with MoMo lands on the calendar, week revenue rises by GHS 1,350, and an arrival is checked in | 1280×800 from 1024 px, 390×700 phone screen below |
| Folio (showcase) | A MoMo approval takes a GHS 1,360 balance to zero, then the night audit closes the day | 480×640 |

## Brand illustration

`components/brand/window-view.tsx`: an arched window (the shape in the mark) with mullion and transom, framing a lagoon sky, a marigold sun and red earth. It fills the sign-in and sign-up panel (the sun rises once on load) and stands in for photos in the onboarding preview.

## Account screens

`components/brand/auth-shell.tsx` frames every account screen. Phones get one column; from 1024 px an ink panel with the lit doorway sits on the left. Clerk renders the form with `components/brand/clerk-appearance.ts`, which flattens its card, hides Clerk's logo and turns off optional fields. The start-screen copy is set through `localization` on `ClerkProvider`.

- **Invite.** A card shows the hotel, who invited you (`staff_invitations.invited_by_staff_id`), your role and what it can do, and when the invite expires. Each edge state gets its own screen: incomplete link, invalid link, expired, already used, check failed, and signed in as someone else (sign out, then return to the link).
- **Suspended.** Owners and staff get different text. The page gives the reason (`after_state.reason` on the `hotel.suspend` audit row, chosen in the platform suspend dialog), states what happens to the booking page and who can restore access, and confirms that records are kept. Support and sign-out are always available.

## PWA launch

- **Icons.** `pnpm icons` builds everything from `lib/brand/mark.ts`. The 192 and 512 `any` icons are rounded tiles. The maskable icons are full-bleed with the glyph at 80% of the safe radius. The 180 px apple-touch-icon is opaque. The favicon is an SVG plus a 16/32/48 ICO.
- **Splash.** The iOS set is 30 exact-size startup images (`lib/brand/splash.ts`): every iPhone size from SE to 16 Pro Max, and iPads in both orientations. Each centres the tile at 27% of screen width on phones (capped at 200 CSS px on iPad) over `#FBFAF7`, the dashboard background. Android's splash is built from the same `background_color`, `theme_color` and icon.
- **Shell.** The page uses `viewport-fit=cover`. The header grows by `safe-area-inset-top` and respects side insets, and the content clears the home indicator. The status bar style is `default` and the theme colour equals the header.
- **Scope.** The scope is `/`, so expired sessions, onboarding and invites stay inside the app window. The `id` is unchanged (`/dashboard`), so existing installs keep their identity.

## Dashboard

The signed-in app uses the brand palette in a quieter form. Colour marks status and money; everything else is paper, ink and warm greys.

- **App theme.** `app/globals.css` `:root` sets the tokens HeroUI and Tailwind read. Background `#FBFAF7`, cards white, primary ink `#141413` (hover mixes in 14% white), secondary and muted `#F3F1EC`, muted text `#66625B` (6.06:1 on white), border `#E7E3DB`, input `#DCD7CD`, focus ring ink. `--sun`, `--sun-wash` and `--sun-deep` carry the marigold accent; text selection is sun. Chart colours and `--pen-accent` are unchanged. This theme applies to every dashboard page, so links and tints that were indigo are now ink and warm grey.
- **Header** (`components/layout/app-header.tsx`). Stays 56 px so sticky offsets on other pages still line up. Left: glyph, "oriel", a slash and the hotel name; below 1024 px the wordmark and slash drop, leaving the glyph and hotel name. Centre: search. Right: a pill "New booking" (a round plus button on phones), notifications and the avatar (sun-wash fallback). The menu button is hidden on phones.
- **Tab bar** (`components/layout/mobile-tab-bar.tsx`, phones only). Today, Calendar, Bookings, Rooms and More (opens the full menu). It clears the home indicator; the main area and toasts are padded to sit above it.
- **Type.** The app uses Inter (`--font-sans`, variable 100–900, latin and latin-ext). It is drawn for small, dense interface text, has true tabular figures, and latin-ext carries the cedi sign, so "GH₵" renders in one font. Before this, the app used Plus Jakarta Sans loaded with weights 400–700 and latin only, so 800 headings drew at 700 and "₵" fell back to a system font. Jakarta stays the brand face: the wordmark (`font-brand`) and the brand surfaces.
- **Today page** (`app/dashboard/dashboard-client.tsx`). No page title, greeting or summary strip: the header already names the hotel and the tab counts give the day's numbers.
  - **Controls.** One row: the date control on the left; on the right, a filter icon that opens the list filter, and refresh (desktop only; phones pull to refresh).
  - **Occupancy** (`occupancy-card.tsx`). After the Cloudbeds card: a ring with the percentage and "Occupancy" in the centre, then Available, Booked, On hold (only when there are holds), Out of service and Blocked, number first. Booked is ink, holds are hatched marigold, the free track is warm grey; rows the ring leaves out have no dot. An info button explains the figure on demand. Phones show the ring beside the list, tablets show the counts as a row of columns, and from 1280 px the card sits in a sticky side column with the ring centred above the list.
  - **Activity list.** Tabs with counts; rows with guest initials, room, stay ("3 nights · 2 guests") and a payment pill (paid green, partial amber, unpaid red). Five columns from 1024 px; on tablets the room folds under the name. On phones each row is two lines: name and room with the payment pill, then dates with the action.

## Open items

- **Name clearance.** Trademark and domain checks for Oriel, then point `NEXT_PUBLIC_SUPPORT_EMAIL` at the new domain.
- **Pricing and customer proof.** Both are left off the page until real numbers and customers exist. The trust section states only facts the product backs today.
- **Photography.** Commission photos of real Ghanaian guesthouses (front desks, morning light, staff at work) before adding any imagery.
- **Clerk branding.** "Secured by Clerk" is removed in the Clerk Dashboard (Customization, then Branding), which needs a paid Clerk plan; it is not hidden in code. "Development mode" only appears with development keys.
- **Accept with an existing account.** Invites currently require a new account. Accepting with the signed-in account needs a server action that mirrors the Clerk webhook.

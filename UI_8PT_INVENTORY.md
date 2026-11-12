# UI 8pt inventory

Generated for branch `ui/8pt-grid`. Baseline smell counts come from `ui-audit/baseline.json` (`node scripts/ui-8pt-audit.mjs`). Status values: TODO / DONE / SKIPPED (reason).

## Baseline totals

| Metric | Count |
|---|---|
| oddSteps | 1577 |
| arbitrary | 1026 |
| arbText | 584 |
| arbRounded | 146 |
| arbLeading | 7 |
| inlineStylePx | 86 |
| cssPxValues | 400 |
| cssOffGrid | 191 |

## Pages, layouts, loading, error, not-found (65)

| Page | Path | Shared components used | Baseline score | Status |
|---|---|---|---|---|
| /sign-in/[[...sign-in]] (page) | `app/(admin)/(auth)/sign-in/[[...sign-in]]/page.tsx` | - | 28 | TODO |
| /sign-up/[[...sign-up]] (page) | `app/(admin)/(auth)/sign-up/[[...sign-up]]/page.tsx` | - | 27 | TODO |
| /deactivated (page) | `app/(admin)/deactivated/page.tsx` | - | 5 | TODO |
| / (error) | `app/(admin)/error.tsx` | errors/route-error | 0 | TODO |
| /onboarding (layout) | `app/(admin)/onboarding/layout.tsx` | - | 0 | TODO |
| /onboarding (page) | `app/(admin)/onboarding/page.tsx` | ./_components/step-indicator, ./_components/onboarding-input, ./_components/onboarding-select, ./_components/room-stepper | 16 | TODO |
| /suspended (page) | `app/(admin)/suspended/page.tsx` | - | 4 | TODO |
| /[slug]/confirmation (error) | `app/[slug]/confirmation/error.tsx` | errors/use-boundary-report | 13 | TODO |
| /[slug]/confirmation (page) | `app/[slug]/confirmation/page.tsx` | booking/copy-button, booking/payment-verifier, booking/complete-payment-panel, booking/booking-progress | 128 | TODO |
| /[slug] (error) | `app/[slug]/error.tsx` | errors/use-boundary-report | 9 | TODO |
| /[slug] (layout) | `app/[slug]/layout.tsx` | - | 0 | TODO |
| /[slug] (page) | `app/[slug]/page.tsx` | ./_components/booking-wizard | 0 | TODO |
| /dashboard/availability (page) | `app/dashboard/availability/page.tsx` | - | 0 | TODO |
| /dashboard/bookings/[id] (page) | `app/dashboard/bookings/[id]/page.tsx` | - | 0 | TODO |
| /dashboard/bookings (error) | `app/dashboard/bookings/error.tsx` | errors/route-error | 0 | TODO |
| /dashboard/bookings (loading) | `app/dashboard/bookings/loading.tsx` | ui/skeleton | 12 | TODO |
| /dashboard/bookings (page) | `app/dashboard/bookings/page.tsx` | bookings/bookings-table | 0 | TODO |
| /dashboard/calendar (page) | `app/dashboard/calendar/page.tsx` | ./_components/calendar-helpers | 3 | TODO |
| /dashboard/customers (loading) | `app/dashboard/customers/loading.tsx` | ui/skeleton | 4 | TODO |
| /dashboard/customers (page) | `app/dashboard/customers/page.tsx` | customers/customers-table | 0 | TODO |
| /dashboard (error) | `app/dashboard/error.tsx` | errors/route-error | 0 | TODO |
| /dashboard (layout) | `app/dashboard/layout.tsx` | ui/sidebar, layout/app-sidebar-overlay, layout/app-header, pwa/dashboard-pwa-shell, observability/sentry-staff-context | 0 | TODO |
| /dashboard (loading) | `app/dashboard/loading.tsx` | ui/skeleton | 25 | TODO |
| /dashboard/night-audit (page) | `app/dashboard/night-audit/page.tsx` | - | 1 | TODO |
| /dashboard (not-found) | `app/dashboard/not-found.tsx` | ui/button-styles | 1 | TODO |
| /dashboard (page) | `app/dashboard/page.tsx` | - | 0 | TODO |
| /dashboard/payments (error) | `app/dashboard/payments/error.tsx` | errors/route-error | 0 | TODO |
| /dashboard/payments/outstanding (page) | `app/dashboard/payments/outstanding/page.tsx` | - | 0 | TODO |
| /dashboard/payments (page) | `app/dashboard/payments/page.tsx` | - | 0 | TODO |
| /dashboard/payments/transactions (page) | `app/dashboard/payments/transactions/page.tsx` | - | 0 | TODO |
| /dashboard/reports (page) | `app/dashboard/reports/page.tsx` | ./_components/report-utils | 0 | TODO |
| /dashboard/rooms/directory (page) | `app/dashboard/rooms/directory/page.tsx` | - | 0 | TODO |
| /dashboard/rooms (page) | `app/dashboard/rooms/page.tsx` | - | 0 | TODO |
| /dashboard/rooms/pricing (page) | `app/dashboard/rooms/pricing/page.tsx` | - | 0 | TODO |
| /dashboard/rooms/types/[id] (not-found) | `app/dashboard/rooms/types/[id]/not-found.tsx` | - | 1 | TODO |
| /dashboard/rooms/types/[id] (page) | `app/dashboard/rooms/types/[id]/page.tsx` | - | 0 | TODO |
| /dashboard/rooms/types/new (page) | `app/dashboard/rooms/types/new/page.tsx` | - | 0 | TODO |
| /dashboard/rooms/types (page) | `app/dashboard/rooms/types/page.tsx` | - | 0 | TODO |
| /dashboard/settings/audit-log (page) | `app/dashboard/settings/audit-log/page.tsx` | - | 15 | TODO |
| /dashboard/settings (error) | `app/dashboard/settings/error.tsx` | errors/route-error | 0 | TODO |
| /dashboard/settings/hotel (page) | `app/dashboard/settings/hotel/page.tsx` | - | 0 | TODO |
| /dashboard/settings (layout) | `app/dashboard/settings/layout.tsx` | - | 3 | TODO |
| /dashboard/settings (loading) | `app/dashboard/settings/loading.tsx` | ui/skeleton | 2 | TODO |
| /dashboard/settings/notifications (page) | `app/dashboard/settings/notifications/page.tsx` | ui/button, ui/switch, ui/card, ui/separator | 21 | TODO |
| /dashboard/settings (page) | `app/dashboard/settings/page.tsx` | - | 0 | TODO |
| /dashboard/settings/payments (page) | `app/dashboard/settings/payments/page.tsx` | - | 0 | TODO |
| /dashboard/staff (page) | `app/dashboard/staff/page.tsx` | - | 1 | TODO |
| /dashboard/staff/pending (page) | `app/dashboard/staff/pending/page.tsx` | ui/button | 7 | TODO |
| / (error) | `app/error.tsx` | errors/route-error | 0 | TODO |
| / (global-error) | `app/global-error.tsx` | errors/use-boundary-report | 12 | TODO |
| /join/[[...rest]] (page) | `app/join/[[...rest]]/page.tsx` | - | 4 | TODO |
| / (layout) | `app/layout.tsx` | toast-provider, ui/tooltip, providers | 0 | TODO |
| / (page) | `app/page.tsx` | landing/site-header, landing/site-footer, landing/hero, landing/showcase, landing/deep-dive, landing/how, landing/demo-cta | 0 | TODO |
| /platform/dashboard (page) | `app/platform/(protected)/dashboard/page.tsx` | - | 0 | TODO |
| /platform (error) | `app/platform/(protected)/error.tsx` | errors/route-error | 0 | TODO |
| /platform/hotels/[hotelId] (page) | `app/platform/(protected)/hotels/[hotelId]/page.tsx` | - | 14 | TODO |
| /platform (layout) | `app/platform/(protected)/layout.tsx` | ui/sidebar | 0 | TODO |
| /platform (loading) | `app/platform/(protected)/loading.tsx` | - | 7 | TODO |
| /platform (page) | `app/platform/(protected)/page.tsx` | ./_components/types, ./_components/oversight-table | 8 | TODO |
| /platform/settings (page) | `app/platform/(protected)/settings/page.tsx` | - | 2 | TODO |
| /platform/auth/error (page) | `app/platform/auth/error/page.tsx` | ui/card | 0 | TODO |
| /platform (error) | `app/platform/error.tsx` | errors/route-error | 0 | TODO |
| /platform/forgot-password (page) | `app/platform/forgot-password/page.tsx` | ./_components/forgot-password-form | 0 | TODO |
| /platform/sign-in (page) | `app/platform/sign-in/page.tsx` | ./_components/login-form | 0 | TODO |
| /platform/update-password (page) | `app/platform/update-password/page.tsx` | ./_components/update-password-form | 0 | TODO |

## Overlays and form components (31)

| Component | Path | Baseline score | Status |
|---|---|---|---|
| onboarding-select | `app/(admin)/onboarding/_components/onboarding-select.tsx` | 0 | TODO |
| booking-wizard | `app/[slug]/_components/booking-wizard.tsx` | 400 | TODO |
| block-detail-drawer | `app/dashboard/calendar/_components/block-detail-drawer.tsx` | 26 | TODO |
| block-room-sheet | `app/dashboard/calendar/_components/block-room-sheet.tsx` | 19 | TODO |
| room-type-form | `app/dashboard/rooms/_components/room-type-form.tsx` | 27 | TODO |
| oversight-table | `app/platform/(protected)/_components/oversight-table.tsx` | 25 | TODO |
| status-chip | `app/platform/(protected)/_components/status-chip.tsx` | 0 | TODO |
| platform-header | `app/platform/(protected)/dashboard/_components/platform-header.tsx` | 10 | TODO |
| platform-sidebar | `app/platform/(protected)/dashboard/_components/platform-sidebar.tsx` | 10 | TODO |
| _sign-out | `app/platform/(protected)/dashboard/_sign-out.tsx` | 0 | TODO |
| _hotel-tabs | `app/platform/(protected)/hotels/[hotelId]/_hotel-tabs.tsx` | 1 | TODO |
| _lifecycle-actions | `app/platform/(protected)/hotels/[hotelId]/_lifecycle-actions.tsx` | 3 | TODO |
| _mfa-card | `app/platform/(protected)/settings/_mfa-card.tsx` | 14 | TODO |
| settings-client | `app/platform/(protected)/settings/settings-client.tsx` | 13 | TODO |
| forgot-password-form | `app/platform/forgot-password/_components/forgot-password-form.tsx` | 2 | TODO |
| login-form | `app/platform/sign-in/_components/login-form.tsx` | 7 | TODO |
| update-password-form | `app/platform/update-password/_components/update-password-form.tsx` | 3 | TODO |
| booking-date-range-picker | `components/booking/booking-date-range-picker.tsx` | 43 | TODO |
| guest-picker-popover | `components/booking/guest-picker-popover.tsx` | 31 | TODO |
| booking-detail-drawer | `components/bookings/booking-detail-drawer.tsx` | 32 | TODO |
| new-booking-modal | `components/bookings/new-booking-modal.tsx` | 0 | TODO |
| guest-detail-sheet | `components/customers/guest-detail-sheet.tsx` | 104 | TODO |
| toast-provider | `components/toast-provider.tsx` | 0 | TODO |
| country-select | `components/ui/country-select.tsx` | 1 | TODO |
| dialog | `components/ui/dialog.tsx` | 0 | TODO |
| dropdown-menu | `components/ui/dropdown-menu.tsx` | 8 | TODO |
| hero-select | `components/ui/hero-select.tsx` | 3 | TODO |
| popover | `components/ui/popover.tsx` | 3 | TODO |
| sheet | `components/ui/sheet.tsx` | 11 | TODO |
| sonner | `components/ui/sonner.tsx` | 0 | TODO |
| tooltip | `components/ui/tooltip.tsx` | 7 | TODO |

## Other components and client modules (129)

| Component | Path | Baseline score | Status |
|---|---|---|---|
| onboarding-input | `app/(admin)/onboarding/_components/onboarding-input.tsx` | 0 | TODO |
| room-stepper | `app/(admin)/onboarding/_components/room-stepper.tsx` | 0 | TODO |
| step-indicator | `app/(admin)/onboarding/_components/step-indicator.tsx` | 0 | TODO |
| activity-list | `app/dashboard/_components/activity-list.tsx` | 111 | TODO |
| activity-tabs | `app/dashboard/_components/activity-tabs.tsx` | 15 | TODO |
| dashboard-search | `app/dashboard/_components/dashboard-search.tsx` | 22 | TODO |
| date-card | `app/dashboard/_components/date-card.tsx` | 53 | TODO |
| occupancy-card | `app/dashboard/_components/occupancy-card.tsx` | 27 | TODO |
| occupancy-donut | `app/dashboard/_components/occupancy-donut.tsx` | 17 | TODO |
| quick-stats | `app/dashboard/_components/quick-stats.tsx` | 6 | TODO |
| availability-matrix-client | `app/dashboard/availability/availability-matrix-client.tsx` | 53 | TODO |
| booking-deep-link-client | `app/dashboard/bookings/[id]/booking-deep-link-client.tsx` | 123 | TODO |
| calendar-toolbar | `app/dashboard/calendar/_components/calendar-toolbar.tsx` | 66 | TODO |
| timeline-calendar | `app/dashboard/calendar/_components/timeline/timeline-calendar.tsx` | 6 | TODO |
| calendar-client | `app/dashboard/calendar/calendar-client.tsx` | 66 | TODO |
| dashboard-client | `app/dashboard/dashboard-client.tsx` | 65 | TODO |
| night-audit-client | `app/dashboard/night-audit/night-audit-client.tsx` | 65 | TODO |
| outstanding-client | `app/dashboard/payments/outstanding/outstanding-client.tsx` | 11 | TODO |
| payments-client | `app/dashboard/payments/payments-client.tsx` | 49 | TODO |
| transactions-client | `app/dashboard/payments/transactions/transactions-client.tsx` | 5 | TODO |
| collections-card | `app/dashboard/reports/_components/bi/collections-card.tsx` | 6 | TODO |
| export-button | `app/dashboard/reports/_components/bi/export-button.tsx` | 1 | TODO |
| footer-cards | `app/dashboard/reports/_components/bi/footer-cards.tsx` | 13 | TODO |
| guests-card | `app/dashboard/reports/_components/bi/guests-card.tsx` | 12 | TODO |
| occupancy-trend-card | `app/dashboard/reports/_components/bi/occupancy-trend-card.tsx` | 19 | TODO |
| revenue-card | `app/dashboard/reports/_components/bi/revenue-card.tsx` | 28 | TODO |
| room-type-card | `app/dashboard/reports/_components/bi/room-type-card.tsx` | 15 | TODO |
| rooms-sold-card | `app/dashboard/reports/_components/bi/rooms-sold-card.tsx` | 17 | TODO |
| sources-card | `app/dashboard/reports/_components/bi/sources-card.tsx` | 13 | TODO |
| sparkline | `app/dashboard/reports/_components/bi/sparkline.tsx` | 2 | TODO |
| shells | `app/dashboard/reports/_components/shells.tsx` | 3 | TODO |
| reports-client | `app/dashboard/reports/reports-client.tsx` | 9 | TODO |
| pricing-client | `app/dashboard/rooms/pricing/pricing-client.tsx` | 155 | TODO |
| rooms-client | `app/dashboard/rooms/rooms-client.tsx` | 80 | TODO |
| edit-room-type-client | `app/dashboard/rooms/types/[id]/edit-room-type-client.tsx` | 2 | TODO |
| audit-log-client | `app/dashboard/settings/audit-log/audit-log-client.tsx` | 89 | TODO |
| hotel-client | `app/dashboard/settings/hotel/hotel-client.tsx` | 47 | TODO |
| templates-client | `app/dashboard/settings/notifications/templates-client.tsx` | 13 | TODO |
| payments-client | `app/dashboard/settings/payments/payments-client.tsx` | 34 | TODO |
| pending-client | `app/dashboard/staff/pending/pending-client.tsx` | 19 | TODO |
| staff-client | `app/dashboard/staff/staff-client.tsx` | 40 | TODO |
| join-signup | `app/join/[[...rest]]/join-signup.tsx` | 27 | TODO |
| processing-invite | `app/join/[[...rest]]/processing-invite.tsx` | 3 | TODO |
| opengraph-image | `app/opengraph-image.tsx` | 18 | TODO |
| booking-progress | `components/booking/booking-progress.tsx` | 26 | TODO |
| complete-payment-panel | `components/booking/complete-payment-panel.tsx` | 2 | TODO |
| copy-button | `components/booking/copy-button.tsx` | 6 | TODO |
| numeric-stepper | `components/booking/numeric-stepper.tsx` | 11 | TODO |
| payment-verifier | `components/booking/payment-verifier.tsx` | 0 | TODO |
| room-gallery | `components/booking/room-gallery.tsx` | 100 | TODO |
| booking-action-bar | `components/bookings/_components/booking-action-bar.tsx` | 10 | TODO |
| booking-detail-card | `components/bookings/_components/booking-detail-card.tsx` | 3 | TODO |
| booking-folio-print | `components/bookings/_components/booking-folio-print.tsx` | 3 | TODO |
| booking-guest-panel | `components/bookings/_components/booking-guest-panel.tsx` | 3 | TODO |
| booking-notes-panel | `components/bookings/_components/booking-notes-panel.tsx` | 21 | TODO |
| booking-overview-panel | `components/bookings/_components/booking-overview-panel.tsx` | 47 | TODO |
| booking-panel-boundary | `components/bookings/_components/booking-panel-boundary.tsx` | 1 | TODO |
| booking-payment-row | `components/bookings/_components/booking-payment-row.tsx` | 17 | TODO |
| booking-payments-panel | `components/bookings/_components/booking-payments-panel.tsx` | 42 | TODO |
| booking-status-pill | `components/bookings/_components/booking-status-pill.tsx` | 9 | TODO |
| booking-stepper | `components/bookings/booking-stepper.tsx` | 7 | TODO |
| bookings-table | `components/bookings/bookings-table.tsx` | 51 | TODO |
| reservation-filters | `components/bookings/reservation-filters.tsx` | 0 | TODO |
| availability-step | `components/bookings/steps/availability-step.tsx` | 45 | TODO |
| dates-step | `components/bookings/steps/dates-step.tsx` | 4 | TODO |
| summary-step | `components/bookings/steps/summary-step.tsx` | 36 | TODO |
| customers-table | `components/customers/customers-table.tsx` | 13 | TODO |
| route-error | `components/errors/route-error.tsx` | 0 | TODO |
| action-link | `components/landing/action-link.tsx` | 0 | TODO |
| deep-dive | `components/landing/deep-dive.tsx` | 0 | TODO |
| demo-cta | `components/landing/demo-cta.tsx` | 0 | TODO |
| hero | `components/landing/hero.tsx` | 0 | TODO |
| how | `components/landing/how.tsx` | 0 | TODO |
| logo | `components/landing/logo.tsx` | 0 | TODO |
| reveal | `components/landing/reveal.tsx` | 0 | TODO |
| showcase | `components/landing/showcase.tsx` | 0 | TODO |
| site-footer | `components/landing/site-footer.tsx` | 0 | TODO |
| site-header | `components/landing/site-header.tsx` | 0 | TODO |
| app-header | `components/layout/app-header.tsx` | 12 | TODO |
| app-sidebar-overlay | `components/layout/app-sidebar-overlay.tsx` | 27 | TODO |
| notification-center | `components/notifications/notification-center.tsx` | 67 | TODO |
| sentry-staff-context | `components/observability/sentry-staff-context.tsx` | 0 | TODO |
| payout-status-badge | `components/payouts/payout-status-badge.tsx` | 0 | TODO |
| payouts-panel | `components/payouts/payouts-panel.tsx` | 32 | TODO |
| providers | `components/providers.tsx` | 0 | TODO |
| dashboard-pwa-shell | `components/pwa/dashboard-pwa-shell.tsx` | 0 | TODO |
| offline-indicator | `components/pwa/offline-indicator.tsx` | 1 | TODO |
| push-opt-in-prompt | `components/pwa/push-opt-in-prompt.tsx` | 4 | TODO |
| pwa-install-prompt | `components/pwa/pwa-install-prompt.tsx` | 7 | TODO |
| sw-register | `components/pwa/sw-register.tsx` | 0 | TODO |
| accordion-section | `components/ui/accordion-section.tsx` | 0 | TODO |
| avatar | `components/ui/avatar.tsx` | 2 | TODO |
| badge | `components/ui/badge.tsx` | 5 | TODO |
| button | `components/ui/button.tsx` | 0 | TODO |
| calendar | `components/ui/calendar.tsx` | 7 | TODO |
| card | `components/ui/card.tsx` | 0 | TODO |
| contact-row | `components/ui/contact-row.tsx` | 12 | TODO |
| entity-filters | `components/ui/entity-filters.tsx` | 15 | TODO |
| hero-table-pagination | `components/ui/hero-table-pagination.tsx` | 0 | TODO |
| image-upload | `components/ui/image-upload.tsx` | 11 | TODO |
| input-group | `components/ui/input-group.tsx` | 11 | TODO |
| input | `components/ui/input.tsx` | 1 | TODO |
| mini-stat | `components/ui/mini-stat.tsx` | 5 | TODO |
| notes-disclosure | `components/ui/notes-disclosure.tsx` | 8 | TODO |
| notes-editor | `components/ui/notes-editor.tsx` | 4 | TODO |
| notification-bell | `components/ui/notification-bell.tsx` | 10 | TODO |
| number-stepper | `components/ui/number-stepper.tsx` | 2 | TODO |
| page-header | `components/ui/page-header.tsx` | 7 | TODO |
| payment-date-field | `components/ui/payment-date-field.tsx` | 0 | TODO |
| donut-ring | `components/ui/pen/donut-ring.tsx` | 1 | TODO |
| pen-card | `components/ui/pen/pen-card.tsx` | 4 | TODO |
| pen-kpi | `components/ui/pen/pen-kpi.tsx` | 20 | TODO |
| pen-table | `components/ui/pen/pen-table.tsx` | 5 | TODO |
| range-control | `components/ui/pen/range-control.tsx` | 20 | TODO |
| room-images-upload | `components/ui/room-images-upload.tsx` | 9 | TODO |
| section-card | `components/ui/section-card.tsx` | 1 | TODO |
| segmented-donut | `components/ui/segmented-donut.tsx` | 8 | TODO |
| segmented-tab | `components/ui/segmented-tab.tsx` | 3 | TODO |
| separator | `components/ui/separator.tsx` | 0 | TODO |
| sidebar | `components/ui/sidebar.tsx` | 17 | TODO |
| skeleton | `components/ui/skeleton.tsx` | 0 | TODO |
| stat-strip | `components/ui/stat-strip.tsx` | 1 | TODO |
| stay-range-calendar | `components/ui/stay-range-calendar.tsx` | 3 | TODO |
| switch | `components/ui/switch.tsx` | 0 | TODO |
| table-search-field | `components/ui/table-search-field.tsx` | 4 | TODO |
| table | `components/ui/table.tsx` | 0 | TODO |
| tabs | `components/ui/tabs.tsx` | 8 | TODO |
| textarea | `components/ui/textarea.tsx` | 1 | TODO |
| view-mode-toggle | `components/ui/view-mode-toggle.tsx` | 3 | TODO |

## Stylesheets

| File | Baseline score | Status |
|---|---|---|
| `app/(admin)/onboarding/onboarding.css` | 178 | TODO |
| `app/[slug]/booking.css` | 77 | TODO |
| `app/dashboard/availability/availability.css` | 59 | TODO |
| `app/dashboard/calendar/calendar.css` | 180 | TODO |
| `app/globals.css` | 14 | TODO |
| `app/landing.css` | 83 | TODO |

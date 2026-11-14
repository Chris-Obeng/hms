/**
 * Brand illustration: the view through an oriel window. An arched window
 * (the shape in the logo) frames a lagoon sky, a marigold sun and red earth.
 * Built only from the mark's vocabulary: arch, disc, flat colour.
 *
 * Decorative. The sun rises once on load (CSS, `rl-window-sun`); reduced
 * motion shows it in place.
 */
export function WindowView({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 520" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="rl-window-glass">
          <path d="M60 520V220a140 140 0 0 1 280 0v300z" />
        </clipPath>
      </defs>

      {/* Frame */}
      <path d="M40 520V220a160 160 0 0 1 320 0v300z" fill="#141413" />

      {/* View */}
      <g clipPath="url(#rl-window-glass)">
        <rect x="0" y="0" width="400" height="520" fill="#A9DCFF" />
        <g className="rl-window-sun">
          <circle cx="200" cy="350" r="78" fill="#FFC23D" />
        </g>
        <path d="M0 372c70-22 140-30 200-30s130 8 200 30v148H0z" fill="#FF7A52" />
        <path d="M0 420c80-16 150-22 200-22s120 6 200 22v100H0z" fill="#E8603A" />
      </g>

      {/* Mullion and transom */}
      <rect x="194" y="80" width="12" height="440" fill="#141413" />
      <rect x="60" y="248" width="280" height="12" fill="#141413" />

      {/* Sill */}
      <rect x="16" y="500" width="368" height="20" rx="10" fill="#141413" />
    </svg>
  );
}

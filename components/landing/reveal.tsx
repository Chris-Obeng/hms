"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { motion } from "motion/react";

/*
 * Motion kit for the landing page, on motion/react. One law survives the
 * rewrite: content is visible by default and only hides once JS arms it, so
 * no-JS visitors and crawlers read everything. A reveal plays on load when it
 * opens near the fold and on scroll when it sits below it. Arming is a keyed
 * remount inside a layout effect, so the hidden start is committed before
 * paint and the entrance never flashes. Reduced motion stays static.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function useReveal<T extends HTMLElement = HTMLElement>(amount = 0.18, margin = "0px 0px -8% 0px") {
  const ref = useRef<T | null>(null);
  const [armed, setArmed] = useState(false);
  const [play, setPlay] = useState(false);

  // Arm before paint: commits the hidden start and, near the fold, plays at once.
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setArmed(true);
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
      setPlay(true);
    }
  }, []);

  // Watch the *armed* node, not the pre-arm one. Arming is a keyed remount, so
  // the observer must re-bind after it or it ends up on a detached node that
  // never intersects — which strands every below-fold reveal at opacity 0.
  useEffect(() => {
    if (!armed || play) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setPlay(true);
      },
      { threshold: amount, rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed, play, amount, margin]);

  return { ref, armed, play };
}

const RISE = {
  hide: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
} as const;

export function Reveal({
  as,
  delay = 0,
  className,
  children,
  y = 8,
  duration = 0.62,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
  /** Rise distance in px — the brief fixes this at 8. */
  y?: number;
  duration?: number;
}) {
  const { ref, armed, play } = useReveal();
  const M = motion[(as ?? "div") as keyof typeof motion] as ElementType;
  return (
    <M
      ref={ref}
      key={armed ? "on" : "off"}
      className={className}
      variants={{
        hide: { opacity: 0, y },
        show: { opacity: 1, y: 0 },
      }}
      initial={armed ? "hide" : false}
      animate={!armed || play ? "show" : "hide"}
      transition={{ duration, ease: EASE, delay: delay / 1000 }}
    >
      {children}
    </M>
  );
}

/* Stagger group: fade + 8px rise, ~60ms per child — the brief motion law.
 * Visible by default; arms the hidden start only in JS, like Reveal. */
export function Stagger({
  className,
  children,
  delay = 0,
  step = 60,
}: {
  className?: string;
  children: ReactNode;
  delay?: number;
  /** Stagger gap in ms between children. */
  step?: number;
}) {
  const { ref, armed, play } = useReveal<HTMLDivElement>(0.12);
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={armed ? "hide" : false}
      animate={!armed || play ? "show" : "hide"}
      variants={{
        hide: {},
        show: { transition: { staggerChildren: step / 1000, delayChildren: delay / 1000 } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hide: { opacity: 0, y: 8 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.62, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/* Magnetic hover for the primary CTA: the button leans toward the cursor
 * (max ~6px) and eases home on leave. Pointer-only; touch stays static. */
export function Magnetic({
  className,
  children,
  strength = 6,
}: {
  className?: string;
  children: ReactNode;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={className}
      style={{ display: "inline-block" }}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        if (window.matchMedia?.("(hover: none)").matches) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const nx = Math.max(-0.5, Math.min(0.5, dx / r.width));
        const ny = Math.max(-0.5, Math.min(0.5, dy / r.height));
        el.style.transform = `translate(${Number((nx * strength * 2).toFixed(2))}px, ${Number((ny * strength * 2).toFixed(2))}px)`;
        el.style.transition = "transform 120ms cubic-bezier(0.16,1,0.3,1)";
      }}
      onMouseLeave={() => {
        const el = ref.current;
        if (!el) return;
        el.style.transition = "transform 420ms cubic-bezier(0.16,1,0.3,1)";
        el.style.transform = "translate(0px, 0px)";
      }}
    >
      {children}
    </div>
  );
}

/* Line-by-line mask reveal for headlines. Each line rides up from behind a
 * clip; .lp-mask supplies the overflow clip and optical padding. */
export function MaskLines({
  lines,
  className,
  delay = 0,
  step = 88,
}: {
  lines: string[];
  className?: string;
  delay?: number;
  step?: number;
}) {
  const { ref, armed, play } = useReveal(0.3);
  return (
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      className={className}
      style={{ display: "block" }}
    >
      {lines.map((line, i) => (
        <span key={`${i}-${line}`} className="lp-mask">
          <motion.span
            key={armed ? `on-${line}` : `off-${line}`}
            className="lp-mask__inner"
            initial={armed ? { y: "112%" } : false}
            animate={!armed || play ? { y: "0%" } : { y: "112%" }}
            transition={{
              duration: 0.82,
              ease: EASE,
              delay: (delay + i * step) / 1000,
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* Count-up on a real figure. Renders the final value for SSR/no-JS, then, when
 * scrolled into view, snaps to the start and eases up. rAF keeps it free of any
 * import-path ambiguity; reduced motion holds the final value. */
export function CountUp({
  to,
  from = 0,
  duration = 1200,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(from + (to - from) * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      setValue(from);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [from, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

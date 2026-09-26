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

function useReveal(amount = 0.18, margin = "0px 0px -8% 0px") {
  const ref = useRef<HTMLElement | null>(null);
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
  hide: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
} as const;

export function Reveal({
  as,
  delay = 0,
  className,
  children,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const { ref, armed, play } = useReveal();
  const M = motion[(as ?? "div") as keyof typeof motion] as ElementType;
  return (
    <M
      ref={ref}
      key={armed ? "on" : "off"}
      className={className}
      variants={RISE}
      initial={armed ? "hide" : false}
      animate={!armed || play ? "show" : "hide"}
      transition={{ duration: 0.62, ease: EASE, delay: delay / 1000 }}
    >
      {children}
    </M>
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

"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Off-main-thread CSS entrance. SSR-visible by default so no-JS visitors
 * never hit empty space.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"ssr" | "pending" | "shown">("ssr");

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.94) {
      setState("pending");
      const raf = requestAnimationFrame(() => setState("shown"));
      return () => cancelAnimationFrame(raf);
    }
    setState("pending");
  }, []);

  useEffect(() => {
    if (state !== "pending") return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [state]);

  const style: CSSProperties | undefined =
    delay > 0 ? ({ "--rl-delay": `${delay}ms` } as CSSProperties) : undefined;

  return (
    <div
      ref={ref}
      data-reveal={state === "ssr" ? undefined : state}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Masked two-line headline reveal (signature hero move).
 */
export function MaskedLines({ lines }: { lines: readonly [string, string] }) {
  const [state, setState] = useState<"ssr" | "pending" | "shown">("ssr");

  useIsoLayoutEffect(() => {
    if (reducedMotion()) return;
    setState("pending");
    const raf = requestAnimationFrame(() => setState("shown"));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span data-line-state={state === "ssr" ? undefined : state}>
      {lines.map((line, i) => (
        <span
          key={`${i}-${line}`}
          className="rl-mask-line"
          style={
            i > 0
              ? ({ "--rl-delay": `${i * 95}ms` } as CSSProperties)
              : undefined
          }
        >
          <span className="rl-mask-inner">{line}</span>
        </span>
      ))}
    </span>
  );
}

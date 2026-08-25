"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Reveal-on-scroll wrapper: 16px rise + fade, once. Content is visible
 * by default and only hidden after hydration IF it sits below the
 * viewport — so no-JS users and crawlers always see everything.
 * prefers-reduced-motion honored via CSS (see landing.css).
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top >= window.innerHeight) {
      setHidden(true);
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
      );
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={hidden ? "" : undefined}
      data-shown={shown ? "true" : undefined}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={className}
    >
      {children}
    </div>
  );
}

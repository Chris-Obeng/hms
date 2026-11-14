import { cn } from "@/lib/utils";

/**
 * Initials on a soft colour, picked from the name so a guest keeps the same
 * colour everywhere. Washes from the brand family; ink text on all of them.
 */
const WASHES = ["#FFF1CC", "#E4F3FF", "#F0EBFF", "#FFE6DC", "#DDF5E6", "#F3F1EC"] as const;

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function GuestAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold tracking-tight text-foreground",
        size === "sm" ? "size-8 text-2xs" : "size-10 text-xs",
        className,
      )}
      style={{ backgroundColor: WASHES[hash(name) % WASHES.length] }}
    >
      {initialsOf(name)}
    </span>
  );
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * URL-safe slug: lowercased, accent-stripped, non-alphanumerics collapsed to
 * single hyphens.
 *
 * @param maxLength Truncates the slug (used for generated hotel slugs).
 */
export function slugify(text: string, maxLength?: number): string {
  const slug = text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return maxLength ? slug.slice(0, maxLength) : slug
}

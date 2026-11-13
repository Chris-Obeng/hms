"use client";

import * as React from "react";
import Image from "next/image";
import { Upload, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@heroui/react";
import { cn } from "@/lib/utils";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface ImageUploadProps {
  /** Current image URL (from DB) */
  currentUrl?: string | null;
  /** Storage path prefix, e.g. `hotels/abc123/branding` */
  storagePath: string;
  /** Called with the public URL after successful upload */
  onUpload: (url: string) => Promise<void>;
  /** Called when user removes the image */
  onRemove?: () => Promise<void>;
  className?: string;
  /** aspect ratio class, e.g. "aspect-square" or "aspect-video" */
  aspect?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export function ImageUpload({
  currentUrl, storagePath, onUpload, onRemove,
  className, aspect = "aspect-video", label, hint, disabled = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (disabled) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.danger("Use a JPEG, PNG, WebP, or AVIF image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.danger("Image must be under 5 MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const path = `${storagePath}/${filename}`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("hotel-assets")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("hotel-assets").getPublicUrl(path);
      await onUpload(publicUrl);
      toast.success("Image uploaded");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.danger(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/50 transition-colors",
          disabled ? "cursor-default opacity-70" : "hover:border-border cursor-pointer",
          aspect
        )}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
      >
        {currentUrl ? (
          <>
            <Image src={currentUrl} alt={label ?? "Uploaded image"} fill className="object-cover" />
            {/* Overlay controls */}
            {!disabled && (
              <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  className="flex items-center gap-2 bg-white/90 text-foreground text-xs font-medium px-3 py-2 rounded-lg"
                >
                  <Upload className="size-3" /> Replace
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="flex items-center gap-2 bg-destructive text-destructive-foreground text-xs font-medium px-3 py-2 rounded-lg"
                  >
                    <X className="size-3" /> Remove
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            {uploading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="size-5 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground/70">{disabled ? "No image" : "Upload"}</p>
              </>
            )}
          </div>
        )}

        {uploading && currentUrl && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        )}
      </div>

      {hint && <p className="text-2xs text-muted-foreground/50">{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={disabled}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

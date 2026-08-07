"use client";

import * as React from "react";
import Image from "next/image";
import { Upload, X, Loader2, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@heroui/react";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface RoomImage {
  url: string;
  caption: string;
  order: number;
}

interface RoomImagesUploadProps {
  hotelId: string;
  roomTypeId: string;
  images: RoomImage[];
  onChange: (images: RoomImage[]) => void;
  maxImages?: number;
}

export function RoomImagesUpload({
  hotelId, roomTypeId, images, onChange, maxImages = 10,
}: RoomImagesUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // drag state
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  async function handleFiles(files: FileList) {
    const remaining = maxImages - images.length;
    if (remaining <= 0) { toast.danger(`Maximum ${maxImages} images`); return; }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const supabase = createClient();
      const uploaded: RoomImage[] = [];
      for (const file of toUpload) {
        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
          toast.danger(`${file.name}: use JPEG, PNG, WebP, or AVIF`);
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) { toast.danger(`${file.name} exceeds 5 MB`); continue; }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `hotels/${hotelId}/room-types/${roomTypeId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("hotel-assets").upload(path, file, { contentType: file.type });
        if (error) { toast.danger(`${file.name}: ${error.message}`); continue; }
        const { data: { publicUrl } } = supabase.storage.from("hotel-assets").getPublicUrl(path);
        uploaded.push({ url: publicUrl, caption: "", order: images.length + uploaded.length });
      }
      if (uploaded.length) onChange([...images, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  function removeImage(idx: number) {
    const next = images.filter((_, i) => i !== idx).map((img, i) => ({ ...img, order: i }));
    onChange(next);
  }

  function updateCaption(idx: number, caption: string) {
    onChange(images.map((img, i) => i === idx ? { ...img, caption } : img));
  }

  // Simple drag-and-drop reorder
  function handleDrop(targetIdx: number) {
    if (dragIndex === null || dragIndex === targetIdx) return;
    const next = [...images];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next.map((img, i) => ({ ...img, order: i })));
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="space-y-3">
      {/* Thumbnails grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img, idx) => (
            <div
              key={img.url}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(idx); }}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
              className={`relative group rounded-xl overflow-hidden bg-muted border-2 transition-all ${
                overIndex === idx ? "border-foreground scale-[1.02]" : "border-transparent"
              }`}
            >
              <div className="aspect-[4/3]">
                <Image src={img.url} alt={img.caption || `Image ${idx + 1}`} fill className="object-cover" />
              </div>
              {/* Drag handle */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                <GripVertical className="size-3.5 text-white drop-shadow" />
              </div>
              {/* Remove */}
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity size-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-destructive"
              >
                <X className="size-3" />
              </button>
              {idx === 0 && (
                <div className="absolute bottom-1 left-1 bg-foreground/80 text-background text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                  Cover
                </div>
              )}
              {/* Caption input */}
              <input
                type="text"
                value={img.caption}
                onChange={(e) => updateCaption(idx, e.target.value)}
                placeholder="Caption…"
                className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity placeholder:text-white/50 outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {images.length < maxImages && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-20 rounded-xl border-2 border-dashed border-border/60 hover:border-border transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Upload className="size-4" />
              <span className="text-xs">Add photos · {images.length}/{maxImages}</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

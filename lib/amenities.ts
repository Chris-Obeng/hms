// Shared amenities list for room type forms.
// Keep in sync with the PRD amenities section.

export const AMENITIES_LIST = [
  { icon: "wifi", label: "WiFi" },
  { icon: "air-vents", label: "Air Conditioning" },
  { icon: "tv", label: "TV" },
  { icon: "fridge", label: "Mini Bar" },
  { icon: "shower", label: "Private Bathroom" },
  { icon: "coffee", label: "Coffee Maker" },
  { icon: "safe", label: "In-Room Safe" },
  { icon: "balcony", label: "Balcony" },
  { icon: "bathtub", label: "Jacuzzi / Bathtub" },
  { icon: "breakfast", label: "Breakfast Included" },
  { icon: "desk", label: "Work Desk" },
  { icon: "phone", label: "Direct Dial Phone" },
  { icon: "key-card", label: "Electronic Key Card" },
  { icon: "pet", label: "Pet Friendly" },
  { icon: "wheelchair", label: "Wheelchair Accessible" },
] as const;

export type Amenity = (typeof AMENITIES_LIST)[number];

/**
 * Converts selected amenity labels into stored `{ icon, label }` objects.
 * Known amenities keep their icon; custom staff-added ones fall back to a
 * generic icon (icons are not rendered on guest-facing pages today).
 */
export function toAmenityObjects(labels: string[]): { icon: string; label: string }[] {
  return labels.map((label) => {
    const known = AMENITIES_LIST.find(
      (a) => a.label.toLowerCase() === label.toLowerCase()
    );
    return { icon: known?.icon ?? "check", label: known?.label ?? label };
  });
}

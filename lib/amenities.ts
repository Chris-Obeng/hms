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
  { icon: "sea", label: "Ocean View" },
  { icon: "mountain", label: "Mountain View" },
  { icon: "bathtub", label: "Jacuzzi / Bathtub" },
  { icon: "breakfast", label: "Breakfast Included" },
  { icon: "desk", label: "Work Desk" },
  { icon: "phone", label: "Direct Dial Phone" },
  { icon: "iron", label: "Iron & Ironing Board" },
  { icon: "hair-dryer", label: "Hair Dryer" },
  { icon: "key-card", label: "Electronic Key Card" },
  { icon: "smoking", label: "Smoking Allowed" },
  { icon: "pet", label: "Pet Friendly" },
  { icon: "wheelchair", label: "Wheelchair Accessible" },
] as const;

export type Amenity = (typeof AMENITIES_LIST)[number];

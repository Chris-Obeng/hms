"use client";

import * as React from "react";
import { Building2 } from "lucide-react";
import { Select, Label, ListBox, Avatar, Badge } from "@heroui/react";
import type { HotelOption } from "@/types/platform-integrations";
import { formatRelativeTime } from "@/lib/format";

interface HotelSelectorProps {
  hotels: HotelOption[];
  value: string;
  onChange: (hotelId: string) => void;
  isLoading?: boolean;
}

/**
 * HotelSelector Component
 * 
 * Dropdown selector for choosing which hotel to manage integrations for.
 * Shows hotel name, status badge, and connection status.
 */
export function HotelSelector({
  hotels,
  value,
  onChange,
  isLoading = false,
}: HotelSelectorProps) {
  const selectedHotel = hotels.find((h) => h.id === value);

  return (
    <div className="space-y-2">
      <Select
        value={value || null}
        onChange={(key) => {
          if (key) onChange(String(key));
        }}
        isDisabled={isLoading}
        className="max-w-md"
        placeholder="Choose a hotel to manage"
      >
        <Label>Select Hotel</Label>
        <Select.Trigger>
          <Select.Value>
            {selectedHotel ? (
              <div className="flex items-center gap-2">
                <Avatar size="sm" color="default">
                  <Avatar.Fallback>
                    <Building2 className="size-3.5" />
                  </Avatar.Fallback>
                </Avatar>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedHotel.name}</span>
                  {selectedHotel.beds24Configured && (
                    <Badge color="success" variant="soft" size="sm">
                      Connected
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              "Choose a hotel"
            )}
          </Select.Value>
          <Select.Indicator />
        </Select.Trigger>
        
        <Select.Popover>
          <ListBox>
            {hotels.map((hotel) => (
              <ListBox.Item key={hotel.id} id={hotel.id} textValue={hotel.name}>
                <div className="flex items-center justify-between w-full gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar size="sm" color="default">
                      <Avatar.Fallback>
                        <Building2 className="size-3.5" />
                      </Avatar.Fallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{hotel.name}</p>
                      <p className="text-xs text-foreground/55 truncate">
                        {hotel.slug}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    {hotel.beds24Configured ? (
                      <Badge color="success" variant="soft" size="sm">
                        Connected
                      </Badge>
                    ) : (
                      <Badge color="default" variant="soft" size="sm">
                        Not configured
                      </Badge>
                    )}
                    
                    {hotel.status === "active" ? (
                      <Badge color="success" variant="soft" size="sm">
                        Active
                      </Badge>
                    ) : hotel.status === "suspended" ? (
                      <Badge color="danger" variant="soft" size="sm">
                        Suspended
                      </Badge>
                    ) : (
                      <Badge color="warning" variant="soft" size="sm">
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {selectedHotel && selectedHotel.lastSyncAt && (
        <p className="text-xs text-foreground/55">
          Last sync: {formatRelativeTime(selectedHotel.lastSyncAt)}
        </p>
      )}
    </div>
  );
}


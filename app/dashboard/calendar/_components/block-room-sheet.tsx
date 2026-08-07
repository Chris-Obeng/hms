"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "@heroui/react";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { HeroSelectField } from "@/components/ui/hero-select";
import { createAvailabilityBlock } from "../actions";
import { BLOCK_REASONS } from "./calendar-helpers";

interface BlockRoomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Array<{ id: string; roomNumber: string; roomTypeName: string }>;
  prefillRoomId?: string;
  prefillStartDate?: Date;
  prefillEndDate?: Date;
  onSuccess?: () => void;
}

export function BlockRoomSheet({
  open,
  onOpenChange,
  rooms,
  prefillRoomId,
  prefillStartDate,
  prefillEndDate,
  onSuccess,
}: BlockRoomSheetProps) {
  const [selectedRoomId, setSelectedRoomId] = React.useState<string>("");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [reason, setReason] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Initialize and apply pre-fill values when sheet opens or pre-fills change
  React.useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        setSelectedRoomId(prefillRoomId || "");
        setDateRange({
          from: prefillStartDate || undefined,
          to: prefillEndDate || undefined,
        });
        setReason("");
        setNotes("");
        setErrors({});
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [open, prefillRoomId, prefillStartDate, prefillEndDate]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedRoomId) newErrors.roomId = "Room is required";
    if (!dateRange?.from || !dateRange?.to) {
      newErrors.dates = "Start and end dates are required";
    }
    if (!reason) newErrors.reason = "Reason is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    const startStr = format(dateRange!.from!, "yyyy-MM-dd");
    const endStr = format(dateRange!.to!, "yyyy-MM-dd");

    const result = await createAvailabilityBlock(
      selectedRoomId,
      startStr,
      endStr,
      reason,
      notes.trim() || null
    );

    if (result.success) {
      toast.success("Room blocked successfully", {
        description: `Blocked from ${format(dateRange!.from!, "MMM dd")} to ${format(dateRange!.to!, "MMM dd, yyyy")}`,
      });
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } else {
      toast.danger(result.error || "Failed to block room");
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 gap-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <SheetTitle className="text-lg">Block Room Dates</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Prevent reservations for maintenance, cleaning, or owner use.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Room Picker */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Select Room
              </label>
              <HeroSelectField value={selectedRoomId} onValueChange={setSelectedRoomId} options={rooms.map((room) => ({value:room.id,label:`Room ${room.roomNumber} (${room.roomTypeName})`}))} placeholder="Choose room..." isInvalid={!!errors.roomId} ariaLabel="Room" />
              {errors.roomId && (
                <p className="text-xs text-destructive mt-1">{errors.roomId}</p>
              )}
            </div>

            {/* Date Range Picker */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Date Range
              </label>
              <div className="border border-border/50 rounded-xl p-2 bg-background">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={1}
                  className="mx-auto"
                />
              </div>
              {dateRange?.from && dateRange?.to && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <CalendarIcon className="size-3" />
                  <span>
                    {format(dateRange.from, "MMM dd")} → {format(dateRange.to, "MMM dd, yyyy")}
                  </span>
                </div>
              )}
              {errors.dates && (
                <p className="text-xs text-destructive mt-1">{errors.dates}</p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Reason
              </label>
              <HeroSelectField value={reason} onValueChange={setReason} options={BLOCK_REASONS} placeholder="Choose reason..." isInvalid={!!errors.reason} ariaLabel="Block reason" />
              {errors.reason && (
                <p className="text-xs text-destructive mt-1">{errors.reason}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Internal Notes (Optional)
              </label>
              <Textarea
                placeholder="Details about maintenance, service description, etc..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl min-h-[80px] text-sm resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border/40 bg-muted/10 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-xl px-5"
              disabled={loading}
            >
              {loading ? "Saving..." : "Block Dates"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import * as React from "react";
import { Check, ChevronDown, X, User, Users, Baby } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  HousekeepingRoom,
  CleaningStatus,
  RoomOccupancyStatus,
} from "@/app/actions/housekeeping";

// ── Cleaning Status Config ─────────────────────────────────────────

export interface CleaningStatusOption {
  value: CleaningStatus;
  label: string;
  color: string;
  bg: string;
  border: string;
  textColor: string;
}

export const CLEANING_STATUS_OPTIONS: CleaningStatusOption[] = [
  {
    value: "available",
    label: "Clean",
    color: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800/40",
    textColor: "text-emerald-700 dark:text-emerald-400",
  },
  {
    value: "checkout_pending",
    label: "Dirty",
    color: "bg-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/20",
    border: "border-rose-200 dark:border-rose-800/40",
    textColor: "text-rose-700 dark:text-rose-400",
  },
  {
    value: "cleaning",
    label: "Cleaning",
    color: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800/40",
    textColor: "text-amber-700 dark:text-amber-400",
  },
  {
    value: "occupied",
    label: "Occupied",
    color: "bg-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800/40",
    textColor: "text-blue-700 dark:text-blue-400",
  },
  {
    value: "maintenance",
    label: "Maintenance",
    color: "bg-zinc-500",
    bg: "bg-zinc-50 dark:bg-zinc-950/20",
    border: "border-zinc-200 dark:border-zinc-800/40",
    textColor: "text-zinc-700 dark:text-zinc-400",
  },
  {
    value: "out_of_service",
    label: "Out of Service",
    color: "bg-red-600",
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-800/40",
    textColor: "text-red-700 dark:text-red-400",
  },
];

export function getCleaningStatusOption(
  status: CleaningStatus
): CleaningStatusOption {
  return (
    CLEANING_STATUS_OPTIONS.find((o) => o.value === status) ??
    CLEANING_STATUS_OPTIONS[0]
  );
}

// ── Occupancy Status Label ────────────────────────────────────────

const OCCUPANCY_LABELS: Record<RoomOccupancyStatus, string> = {
  occupied: "Occupied",
  check_in_only: "Check-in only",
  check_out_only: "Check-out only",
  check_in_out: "Check-in/out",
  unoccupied: "Unoccupied",
};

export function getOccupancyLabel(status: RoomOccupancyStatus): string {
  return OCCUPANCY_LABELS[status] ?? "Unoccupied";
}

// ── Guest Count Icon ─────────────────────────────────────────────

function AdultIcon({ className }: { className?: string }) {
  return <User className={className} aria-hidden="true" />;
}

function ChildIcon({ className }: { className?: string }) {
  return <Users className={className} aria-hidden="true" />;
}

function InfantIcon({ className }: { className?: string }) {
  return <Baby className={className} aria-hidden="true" />;
}

// ── Cleaning Status Dropdown ──────────────────────────────────────

interface CleaningStatusDropdownProps {
  value: CleaningStatus;
  roomId: string;
  onUpdate: (roomId: string, status: CleaningStatus) => void;
  isPending?: boolean;
}

export function CleaningStatusDropdown({
  value,
  roomId,
  onUpdate,
  isPending = false,
}: CleaningStatusDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const current = getCleaningStatusOption(value);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        disabled={isPending}
        aria-label={`Cleaning status: ${current.label}. Click to change.`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1",
          "text-xs font-medium transition-all duration-150",
          "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "print:hidden",
          current.bg,
          current.border,
          current.textColor
        )}
      >
        <span
          className={cn("size-1.5 rounded-full shrink-0", current.color)}
          aria-hidden="true"
        />
        {current.label}
        <ChevronDown
          className={cn(
            "size-3 transition-transform duration-150 text-current/60",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select cleaning status"
          className={cn(
            "absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border/60",
            "bg-popover shadow-lg shadow-black/5 py-1",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
        >
          {CLEANING_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              type="button"
              onClick={() => {
                onUpdate(roomId, opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-xs font-medium",
                "transition-colors duration-100",
                "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                opt.value === value
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn("size-2 rounded-full shrink-0", opt.color)}
                aria-hidden="true"
              />
              <span className="flex-1 text-left">{opt.label}</span>
              {opt.value === value && (
                <Check className="size-3 text-foreground" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline Note Editor ────────────────────────────────────────────

interface InlineNoteEditorProps {
  roomId: string;
  currentNote: string | null;
  onSave: (roomId: string, note: string) => void;
  isPending?: boolean;
}

export function InlineNoteEditor({
  roomId,
  currentNote,
  onSave,
  isPending = false,
}: InlineNoteEditorProps) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(currentNote ?? "");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Sync if note changes externally (e.g., optimistic rollback)
  React.useEffect(() => {
    if (!editing) setValue(currentNote ?? "");
  }, [currentNote, editing]);

  // Focus on open
  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleSave() {
    onSave(roomId, value.trim());
    setEditing(false);
  }

  function handleCancel() {
    setValue(currentNote ?? "");
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-0 print:hidden">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 500))}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder="Add a note…"
          rows={2}
          maxLength={500}
          className={cn(
            "w-full resize-none rounded-md border border-input bg-background",
            "px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50"
          )}
          aria-label="Room note"
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className={cn(
              "rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background",
              "hover:bg-foreground/90 transition-colors disabled:opacity-50"
            )}
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums">
            {value.length}/500
          </span>
        </div>
      </div>
    );
  }

  if (currentNote) {
    return (
      <div className="group flex items-start gap-1.5 min-w-0">
        <p
          className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1 min-w-0 print:line-clamp-none"
          title={currentNote}
        >
          {currentNote}
        </p>
        <div className="flex items-center gap-0.5 shrink-0 print:hidden">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
            aria-label="Edit note"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onSave(roomId, "")}
            className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
            aria-label="Clear note"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors print:hidden"
      aria-label={`Add note for room`}
    >
      Add note
    </button>
  );
}

// ── Housekeeping Table Row ────────────────────────────────────────

interface HousekeepingTableRowProps {
  room: HousekeepingRoom;
  onStatusChange: (roomId: string, status: CleaningStatus) => void;
  onNoteChange: (roomId: string, note: string) => void;
  isPendingStatus?: boolean;
  isPendingNote?: boolean;
}

export function HousekeepingTableRow({
  room,
  onStatusChange,
  onNoteChange,
  isPendingStatus = false,
  isPendingNote = false,
}: HousekeepingTableRowProps) {
  const occupancyLabel = getOccupancyLabel(room.occupancyStatus);
  const isOccupied = room.occupancyStatus !== "unoccupied";

  return (
    <tr
      className={cn(
        "border-b border-border/40 transition-colors duration-100",
        "hover:bg-muted/30",
        "[&>td]:px-4 [&>td]:py-3"
      )}
    >
      {/* Room number */}
      <td>
        <span className="text-sm font-semibold text-foreground">
          {room.roomNumber}
        </span>
      </td>

      {/* Room type */}
      <td>
        <span className="text-sm text-muted-foreground">
          {room.roomTypeName}
        </span>
      </td>

      {/* Room / occupancy status */}
      <td>
        <span
          className={cn(
            "text-sm",
            isOccupied ? "text-foreground font-medium" : "text-muted-foreground"
          )}
        >
          {occupancyLabel}
          {/* Show guest count in parens if occupied like Little Hotelier "Occupied - (2)" */}
          {isOccupied && (room.adults > 0 || room.children > 0) && (
            <span className="text-muted-foreground font-normal">
              {" "}
              -&nbsp;({room.adults + room.children})
            </span>
          )}
        </span>
      </td>

      {/* Guests — adults / children / infants icons */}
      <td>
        <div className="flex items-center gap-2.5">
          <GuestCountPill
            Icon={AdultIcon}
            count={room.adults}
            label="adults"
          />
          <GuestCountPill
            Icon={ChildIcon}
            count={room.children}
            label="children"
          />
          <GuestCountPill
            Icon={InfantIcon}
            count={room.infants}
            label="infants"
          />
        </div>
      </td>

      {/* Room notes */}
      <td className="max-w-[240px]">
        <InlineNoteEditor
          roomId={room.id}
          currentNote={room.notes}
          onSave={onNoteChange}
          isPending={isPendingNote}
        />
      </td>

      {/* Cleaning status dropdown */}
      <td>
        <CleaningStatusDropdown
          value={room.cleaningStatus}
          roomId={room.id}
          onUpdate={onStatusChange}
          isPending={isPendingStatus}
        />
      </td>
    </tr>
  );
}

// ── Guest Count Pill ─────────────────────────────────────────────

interface GuestCountPillProps {
  Icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
}

function GuestCountPill({ Icon, count, label }: GuestCountPillProps) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="tabular-nums font-medium">{count}</span>
    </span>
  );
}

// ── Sortable Column Header ────────────────────────────────────────

export type SortDirection = "asc" | "desc" | null;

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  direction: SortDirection;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableHeader({
  label,
  sortKey,
  currentSortKey,
  direction,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = currentSortKey === sortKey;

  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold text-foreground whitespace-nowrap",
        "select-none cursor-pointer group print:cursor-default",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
          isActive ? "text-foreground" : "text-muted-foreground",
          "print:hidden"
        )}
        aria-label={`Sort by ${label}${isActive ? (direction === "asc" ? ", sorted ascending" : ", sorted descending") : ""}`}
      >
        {label}
        <SortIcon direction={isActive ? direction : null} />
      </button>
      {/* Print-only: plain label without button */}
      <span className="hidden print:inline">{label}</span>
    </th>
  );
}

function SortIcon({ direction }: { direction: SortDirection }) {
  return (
    <span
      className="inline-flex flex-col gap-px opacity-60"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 6 4"
        className={cn(
          "size-1.5 fill-current",
          direction === "asc" ? "opacity-100" : "opacity-30"
        )}
      >
        <path d="M3 0L6 4H0L3 0z" />
      </svg>
      <svg
        viewBox="0 0 6 4"
        className={cn(
          "size-1.5 fill-current",
          direction === "desc" ? "opacity-100" : "opacity-30"
        )}
      >
        <path d="M3 4L0 0H6L3 4z" />
      </svg>
    </span>
  );
}

"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Loader2, SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-2xl! bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search or run a command…",
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string
  description?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          // Top-anchored sheet on mobile, floating panel on desktop
          "top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 w-[calc(100%-1rem)] max-w-lg! translate-y-0 sm:top-[15vh]",
          "gap-0 rounded-2xl! p-0",
          // Layered, soft elevation
          "shadow-[0_1px_1px_rgba(0,0,0,0.04),0_12px_32px_-8px_rgba(0,0,0,0.16),0_32px_80px_-16px_rgba(0,0,0,0.26)]",
          "dark:shadow-[0_1px_1px_rgba(0,0,0,0.35),0_12px_32px_-8px_rgba(0,0,0,0.5),0_32px_80px_-16px_rgba(0,0,0,0.65)]",
          // Premium top hairline
          "before:pointer-events-none before:absolute before:inset-x-10 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent dark:before:via-white/15",
          className
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-muted-foreground">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  value,
  loading = false,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  /** Shows an inline spinner in place of the Esc hint while a search runs */
  loading?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const hasValue = typeof value === "string" && value.length > 0

  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground/60" />
      <CommandPrimitive.Input
        ref={inputRef}
        value={value}
        data-slot="command-input"
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      {loading ? (
        <Loader2
          aria-label="Searching"
          className="size-4 shrink-0 animate-spin text-muted-foreground/70"
        />
      ) : hasValue ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Clear search"
          onClick={() => {
            props.onValueChange?.("")
            inputRef.current?.focus()
          }}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted-foreground/15 text-muted-foreground transition-colors hover:bg-muted-foreground/25 hover:text-foreground"
        >
          <XIcon className="size-3" />
        </button>
      ) : (
        <kbd className="hidden h-5 items-center rounded-md border border-border/60 bg-muted/40 px-1.5 font-sans text-[10px] font-medium text-muted-foreground/70 sm:flex">
          Esc
        </kbd>
      )}
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar min-h-0 flex-1 scroll-py-2 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2 outline-none",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-10 text-center text-sm", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground",
        "**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground/60",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 my-1 h-px bg-border/50", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-default select-none items-center gap-3 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:bg-muted",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
    </CommandPrimitive.Item>
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto font-sans text-[11px] tracking-wide text-muted-foreground/60 group-data-selected/command-item:text-foreground/70",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}

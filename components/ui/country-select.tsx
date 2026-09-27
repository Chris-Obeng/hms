"use client";

import {
  Autocomplete,
  EmptyState,
  ListBox,
  SearchField,
  useFilter,
} from "@heroui/react";
import { COUNTRIES } from "@/lib/countries-data";

// Formatted for this component's option shape (static trimmed dataset).
export const countryOptions = COUNTRIES.map((country) => ({
  value: country.name,
  label: country.name,
  flag: country.flag,
  code: country.code,
  dialCode: country.dialCode,
}));

export function getCountryDialCode(countryName: string): string | undefined {
  return countryOptions.find((country) => country.value === countryName)?.dialCode || undefined;
}

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CountrySelect({
  value,
  onChange,
  placeholder = "Select country...",
  className = "",
  disabled = false,
}: CountrySelectProps) {
  const { contains } = useFilter({ sensitivity: "base" });
  const selected = value ? countryOptions.find((c) => c.value === value) : undefined;

  return (
    <Autocomplete
      aria-label="Nationality"
      className={className}
      fullWidth
      isDisabled={disabled}
      placeholder={placeholder}
      selectionMode="single"
      value={value || null}
      onChange={(key) => onChange(String(key ?? ""))}
    >
      <Autocomplete.Trigger className="min-h-11 rounded-xl border border-border/60 bg-background px-3 text-sm shadow-none transition-colors hover:border-border data-[focus-visible=true]:border-ring">
        <Autocomplete.Value>
          {({ defaultChildren, isPlaceholder }) =>
            !isPlaceholder && selected ? (
              <span className="flex w-full items-center gap-2">
                <span className="text-base leading-none" aria-hidden="true">{selected.flag}</span>
                <span className="truncate">{selected.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{selected.dialCode}</span>
              </span>
            ) : (
              defaultChildren
            )
          }
        </Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus name="country-search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search country…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            className="max-h-64 overflow-y-auto"
            renderEmptyState={() => <EmptyState>No countries found</EmptyState>}
          >
            {countryOptions.map((country) => (
              <ListBox.Item
                key={country.value}
                id={country.value}
                textValue={`${country.label} ${country.code} ${country.dialCode}`}
              >
                <span className="mr-1 text-base leading-none" aria-hidden="true">{country.flag}</span>
                <span className="font-medium">{country.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{country.dialCode}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

"use client";

import countries from "world-countries";
import { ComboBox, Input, ListBox } from "@heroui/react";

// Format countries data for react-select
export const countryOptions = countries.map((country) => ({
  value: country.name.common,
  label: country.name.common,
  flag: country.flag,
  code: country.cca2,
  dialCode: country.idd.root
    ? `${country.idd.root}${country.idd.suffixes?.[0] ?? ""}`
    : "",
})).sort((a, b) => a.label.localeCompare(b.label));

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

export function CountrySelect({ value, onChange, placeholder = "Select country...", className = "", disabled = false }: CountrySelectProps) {
  return (
    <ComboBox className={`w-full ${className}`} selectedKey={value || null} onSelectionChange={(key) => onChange(String(key ?? ""))} isDisabled={disabled} menuTrigger="input">
      <ComboBox.InputGroup className="min-h-11 rounded-lg border border-input bg-background px-3 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <Input placeholder={placeholder} className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus:ring-0" />
        <ComboBox.Trigger className="shrink-0 text-muted-foreground" />
      </ComboBox.InputGroup>
      <ComboBox.Popover className="z-[100] w-[var(--trigger-width)] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl">
        <ListBox className="max-h-64 overflow-y-auto" renderEmptyState={() => <div className="px-3 py-4 text-sm text-muted-foreground">No countries found</div>}>
          {countryOptions.map((country) => (
            <ListBox.Item key={country.value} id={country.value} textValue={`${country.label} ${country.code}`} className="min-h-10 rounded-lg px-3 py-2">
              <span className="mr-2 text-lg" aria-hidden="true">{country.flag}</span>
              <span className="font-medium">{country.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{country.dialCode}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

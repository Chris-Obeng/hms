"use client";

import { Autocomplete, EmptyState, ListBox, SearchField, useFilter } from "@heroui/react";

import { COUNTRIES, type CountryOption } from "@/lib/countries-data";

/** Countries a phone number can belong to: those with a calling code. */
export const PHONE_COUNTRIES: CountryOption[] = COUNTRIES.filter((c) => c.dialCode);

export function findPhoneCountry(code: string): CountryOption {
  return PHONE_COUNTRIES.find((c) => c.code === code) ?? PHONE_COUNTRIES[0];
}

interface PhoneCountryPickerProps {
  /** ISO 3166-1 alpha-2 of the phone number's country. */
  value: string;
  onChange: (code: string) => void;
}

/**
 * Dialling-code picker that sits inside the phone field, separate from
 * nationality: a guest's number does not have to match their passport.
 * Searchable by country name, ISO code or dialling code ("233").
 */
export function PhoneCountryPicker({ value, onChange }: PhoneCountryPickerProps) {
  const { contains } = useFilter({ sensitivity: "base" });
  const selected = findPhoneCountry(value);

  return (
    <Autocomplete
      aria-label={`Phone country code, ${selected.name} ${selected.dialCode}`}
      selectionMode="single"
      value={selected.code}
      onChange={(key) => {
        if (key != null) onChange(String(key));
      }}
      className="shrink-0"
    >
      <Autocomplete.Trigger className="flex h-full items-center gap-1 min-h-0 rounded-none border-0 border-r border-[#DEDEE0] bg-[#F5F5F5] ps-3 pe-8 py-0 text-xs font-medium text-[#3F3F46] shadow-none outline-none hover:bg-[#EBEBEC] focus-visible:bg-[#EBEBEC] cursor-pointer">
        <Autocomplete.Value className="text-xs sm:text-xs">
          {() => (
            <span className="tabular-nums">
              {selected.code} {selected.dialCode}
            </span>
          )}
        </Autocomplete.Value>
        <Autocomplete.Indicator className="size-4 text-[#71717A]" />
      </Autocomplete.Trigger>
      <Autocomplete.Popover
        placement="bottom start"
        className="booking-portal w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-1 bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_12px_28px_rgb(0_0_0/0.12)] z-50 text-[#18181B]"
      >
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus aria-label="Search countries" name="phone-country-search" variant="secondary" className="p-1">
            <SearchField.Group className="h-10 rounded-xl">
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Country or code" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            className="max-h-64 overflow-y-auto"
            renderEmptyState={() => <EmptyState>No countries found</EmptyState>}
          >
            {PHONE_COUNTRIES.map((c) => (
              <ListBox.Item
                key={c.code}
                id={c.code}
                textValue={`${c.name} ${c.code} ${c.dialCode}`}
                className="text-sm ps-3 pe-8 py-2 rounded-lg cursor-pointer hover:bg-[#F5F5F5] flex items-center gap-3 text-[#18181B]"
              >
                <span className="flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-[#71717A]">{c.dialCode}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

"use client";

import * as React from "react";
import Select, { StylesConfig, components, SingleValueProps, OptionProps } from "react-select";
import countries from "world-countries";

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

// Custom SingleValue component to show flag
const SingleValue = (props: SingleValueProps<typeof countryOptions[0]>) => (
  <components.SingleValue {...props}>
    <div className="flex items-center gap-2.5">
      <span className="text-xl leading-none">{props.data.flag}</span>
      <span className="text-sm font-medium">{props.data.label}</span>
    </div>
  </components.SingleValue>
);

// Custom Option component to show flag
const Option = (props: OptionProps<typeof countryOptions[0]>) => (
  <components.Option {...props}>
    <div className="flex items-center gap-2.5">
      <span className="text-xl leading-none">{props.data.flag}</span>
      <span className="text-sm">{props.data.label}</span>
    </div>
  </components.Option>
);

export function CountrySelect({ value, onChange, placeholder = "Select country...", className = "", disabled = false }: CountrySelectProps) {
  const selectedOption = countryOptions.find((opt) => opt.value === value) || null;

  const customStyles: StylesConfig<typeof countryOptions[0], false> = {
    control: (provided, state) => ({
      ...provided,
      minHeight: "44px",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: state.isFocused 
        ? "hsl(var(--ring))" 
        : "hsl(var(--input))",
      boxShadow: state.isFocused ? "0 0 0 2px hsl(var(--ring) / 0.2)" : "none",
      "&:hover": {
        borderColor: "hsl(var(--ring) / 0.5)",
      },
      backgroundColor: "hsl(var(--background))",
      borderRadius: "0.5rem",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "border-color 0.2s, box-shadow 0.2s",
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: "hsl(var(--popover))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "0.5rem",
      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      zIndex: 10001,
      marginTop: "4px",
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isFocused
        ? "hsl(var(--accent))"
        : state.isSelected
        ? "hsl(var(--primary))"
        : "transparent",
      color: state.isSelected 
        ? "hsl(var(--primary-foreground))" 
        : "hsl(var(--popover-foreground))",
      cursor: "pointer",
      padding: "10px 12px",
      fontSize: "14px",
      "&:active": {
        backgroundColor: "hsl(var(--primary) / 0.9)",
      },
    }),
    input: (provided) => ({
      ...provided,
      color: "hsl(var(--foreground))",
      fontSize: "14px",
    }),
    singleValue: (provided) => ({
      ...provided,
      color: "hsl(var(--foreground))",
      fontSize: "14px",
      fontWeight: "500",
    }),
    placeholder: (provided) => ({
      ...provided,
      color: "hsl(var(--muted-foreground))",
      fontSize: "14px",
    }),
    menuList: (provided) => ({
      ...provided,
      maxHeight: "220px",
      overflowY: "auto",
      padding: "4px",
    }),
    menuPortal: (provided) => ({
      ...provided,
      zIndex: 10001,
    }),
    dropdownIndicator: (provided) => ({
      ...provided,
      color: "hsl(var(--muted-foreground))",
      "&:hover": {
        color: "hsl(var(--foreground))",
      },
    }),
    indicatorSeparator: (provided) => ({
      ...provided,
      backgroundColor: "hsl(var(--border))",
    }),
  };

  return (
    <Select
      value={selectedOption}
      onChange={(newValue) => onChange(newValue?.value || "")}
      options={countryOptions}
      placeholder={placeholder}
      className={className}
      isDisabled={disabled}
      isSearchable
      isClearable={false}
      menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
      menuPosition="fixed"
      menuPlacement="auto"
      menuShouldScrollIntoView={false}
      maxMenuHeight={220}
      styles={customStyles}
      components={{ SingleValue, Option }}
      noOptionsMessage={() => "No countries found"}
    />
  );
}

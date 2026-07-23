"use client";

import { Toast } from "@heroui/react";

/**
 * Toast Provider Wrapper
 * 
 * Client component wrapper for HeroUI Toast.Provider
 * to be used in the root layout.
 */
export function ToastProvider() {
  return <Toast.Provider />;
}

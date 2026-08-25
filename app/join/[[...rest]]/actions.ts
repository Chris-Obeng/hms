"use server";

import { cookies } from "next/headers";

export async function setInviteTokenCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set("invite_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60, // 1 hour
    path: "/",
  });
}

export async function getInviteTokenCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("invite_token")?.value ?? null;
}

import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const lastCheckMap = new Map<string, number>();
const RATE_LIMIT_MS = 500; // Max 2 requests/sec per user

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ isMember: false, error: "Not authenticated" }, { status: 401 });
    }

    // Rate limit per user
    const now = Date.now();
    const lastCheck = lastCheckMap.get(userId);
    if (lastCheck && now - lastCheck < RATE_LIMIT_MS) {
      return NextResponse.json({ isMember: false, error: "Rate limited" }, { status: 429 });
    }
    lastCheckMap.set(userId, now);

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    
    if (!orgId) {
      return NextResponse.json({ isMember: false, error: "Missing orgId" }, { status: 400 });
    }

    const clerk = await clerkClient();
    const memberships = await clerk.users.getOrganizationMembershipList({ userId });
    const isMember = memberships.data.some(m => m.organization.id === orgId);

    return NextResponse.json({ isMember });
  } catch (err) {
    console.error("Membership check error:", err);
    return NextResponse.json({ isMember: false, error: "Check failed" }, { status: 500 });
  }
}

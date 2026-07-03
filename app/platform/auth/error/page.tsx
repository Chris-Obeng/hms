import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformAuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1C1917] p-6">
      <div className="w-full max-w-sm">
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-xl text-white">Something went wrong</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/50">
              {error ? decodeURIComponent(error) : "An unexpected error occurred. Please try signing in again."}
            </p>
            <a
              href="/platform/sign-in"
              className="inline-block mt-4 text-sm text-white/70 hover:text-white underline underline-offset-2 transition-colors"
            >
              Back to sign in
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

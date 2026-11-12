import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-screen bg-[#FDFCFA] flex flex-col">
      <header className="border-b border-[#E9E2D6] bg-[#FDFCFA]/80 backdrop-blur">
        <div className="mx-auto w-full max-w-[80rem] px-6 lg:px-8 flex h-18 items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-[#0F1D1A]" style={{ fontFamily: "var(--font-fraunces)" }}>
            <span className="flex items-end gap-[3px] skew-y-[-10deg]"><span className="block w-[6px] h-4 bg-[#0F1D1A] rounded-[1px]" /><span className="block w-[6px] h-6 bg-[#C8A96A] rounded-[1px]" /><span className="block w-[6px] h-5 bg-[#0F1D1A] rounded-[1px]" /></span>
            <span className="text-[1.25rem] font-bold tracking-[-0.04em]">RoomLine<span className="text-[#C8A96A]">.</span></span>
          </Link>
          <Link href="/sign-in" className="text-sm font-medium text-[#6B7571] hover:text-[#0F1D1A]">Sign in</Link>
        </div>
      </header>
      <div className="flex-1 grid lg:grid-cols-[1.05fr_.95fr] min-h-0">
        <div className="hidden lg:flex flex-col justify-between bg-[#0F1D1A] text-[#FFFCF8] p-10 xl:p-12">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B5B0]">Create your workspace</p>
            <h1 className="mt-3 text-[2rem] xl:text-[2.25rem] font-medium leading-[1.05] tracking-[-0.04em]" style={{ fontFamily: "var(--font-fraunces)" }}>
              More room<br />for hospitality.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#A8B5B0]">One calm system for reservations, rooms, and revenue. Set up in minutes.</p>
          </div>
          <p className="text-xs text-[#A8B5B0]">Hospitality in focus. Operations in order.</p>
        </div>
        <div className="flex items-center justify-center p-6 sm:p-10 bg-[#FDFCFA]">
          <div className="w-full max-w-md">
            <div className="lg:hidden mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-[#0F1D1A]" style={{ fontFamily: "var(--font-fraunces)" }}>Create your workspace</h1>
              <p className="mt-1 text-sm text-[#6B7571]">Start with your account. Then set up your property.</p>
            </div>
            <SignUp
              appearance={{
                elements: {
                  card: "shadow-none border border-[#E9E2D6] rounded-[16px] bg-white",
                  headerTitle: "text-[#0F1D1A]",
                  formButtonPrimary: "bg-[#0F1D1A] hover:bg-[#1C2E2B] rounded-full",
                },
              }}
            />
            <p className="mt-4 text-center text-xs text-[#8A9692]">By continuing you agree to our Terms and Privacy.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

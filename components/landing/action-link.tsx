import Link from "next/link";
import { buttonVariants } from "@heroui/styles";
import { ArrowRight } from "lucide-react";

/** Native route navigation with HeroUI's server-safe button styling. */
export function ActionLink() {
  return (
    <Link href="/sign-up" prefetch={false} className={`${buttonVariants({ variant: "primary", size: "lg" })} rl-button`}>
      Get started <ArrowRight aria-hidden="true" size={17} />
    </Link>
  );
}

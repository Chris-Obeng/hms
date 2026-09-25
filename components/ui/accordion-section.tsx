"use client";

import * as React from "react";
import { Accordion } from "@heroui/react";
import { ChevronDown } from "lucide-react";

// Shared accordion section: an icon + title trigger with a chevron indicator,
// wrapping the panel body. Renders Accordion.Item as its root so it must sit
// directly inside a HeroUI <Accordion>. Expansion is keyed by `id`.

interface AccordionSectionProps {
  id: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}

export function AccordionSection({ id, icon, title, children, bodyClassName }: AccordionSectionProps) {
  return (
    <Accordion.Item id={id}>
      <Accordion.Heading>
        <Accordion.Trigger className="gap-2 text-sm font-semibold">
          {icon}
          {title}
          <Accordion.Indicator>
            <ChevronDown aria-hidden />
          </Accordion.Indicator>
        </Accordion.Trigger>
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body className={bodyClassName}>{children}</Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

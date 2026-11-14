"use client";

import { Accordion } from "@heroui/react";

/** Questions a hotel owner asks before switching. Answers state only what Oriel does today. */
const QUESTIONS = [
  {
    q: "Do I need new computers or hardware?",
    a: "No. Oriel runs in the browser on the phones, tablets and laptops you already have, and can be added to a phone's home screen like an app.",
  },
  {
    q: "Which payments can guests use?",
    a: "Mobile money and cards online through Paystack, plus cash, card and bank transfer at the desk. Every payment lands on the guest's bill in GHS.",
  },
  {
    q: "Where does online booking money go?",
    a: "Paystack settles online payments to the bank account or mobile money wallet you connect in Oriel.",
  },
  {
    q: "Can my staff use it on their own phones?",
    a: "Yes. Each person gets their own sign-in and a role: owner, manager, front desk or view only. The audit log records who changed what.",
  },
  {
    q: "How do guests find my booking page?",
    a: "Every property gets its own booking link. Share it on WhatsApp, Instagram and Google Maps, or add it to your website.",
  },
] as const;

export function Faq() {
  return (
    <section id="questions" data-tone="paper" className="rl-section" aria-labelledby="faq-heading">
      <div className="rl-wrap rl-faq-grid">
        <div data-reveal="">
          <h2 id="faq-heading" className="rl-h2 rl-r">
            Questions, answered.
          </h2>
        </div>
        <div data-reveal="">
          <Accordion className="rl-faq rl-r" allowsMultipleExpanded={false}>
            {QUESTIONS.map((item) => (
              <Accordion.Item key={item.q} className="rl-faq-item">
                <Accordion.Heading>
                  <Accordion.Trigger className="rl-faq-trigger">
                    {item.q}
                    <Accordion.Indicator className="rl-faq-indicator">
                      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                      </svg>
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="rl-faq-body">{item.a}</Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

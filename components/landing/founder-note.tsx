export function FounderNote() {
  return (
    <section className="scroll-mt-20">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20 lg:px-8">
        <figure>
          <blockquote className="text-xl font-medium leading-relaxed tracking-tight text-ivory/85 sm:text-2xl sm:leading-relaxed">
            “Hotel software was built for big chains with IT departments. The
            guesthouse down the road runs on a notebook and a phone. RoomLine is
            the one screen between those two — bookings, mobile money and night
            audit that actually match how you already work.”
          </blockquote>
          <figcaption className="mt-5 flex items-center gap-3">
            <span
              className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#e5c158] to-gold text-sm font-bold text-forest"
              aria-hidden="true"
            >
              CO
            </span>
            <span className="text-sm text-ivory/45">
              Built in Accra, for hotels across Africa.
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

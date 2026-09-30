import { ArrowUpRight } from "lucide-react";

export function How() {
  return (
    <section id="getting-started" className="lp-section lp-getting-started" aria-labelledby="getting-started-heading">
      <div className="lp-container"><div className="lp-section-heading"><div><p className="lp-eyebrow">A considered start</p><h2 id="getting-started-heading">Your next chapter.<br />A clear path forward.</h2></div><a className="lp-text-link" href="#demo">Let’s talk about your property<ArrowUpRight size={18} aria-hidden="true" /></a></div>
        <ol className="lp-onboarding-steps"><li><span>01</span><h3>See it in context</h3><p>Walk through your daily operation with us. See where RoomLine fits your team and your property.</p></li><li><span>02</span><h3>Make it your own</h3><p>Set up your room types, rates, and team access, with the details that make your hotel yours.</p></li><li><span>03</span><h3>Welcome what’s next</h3><p>Bring your reservations together and start running the day with a clearer view of your hotel.</p></li></ol>
      </div>
    </section>
  );
}

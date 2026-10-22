import Image from "next/image";
import { Check, Users } from "lucide-react";

export function DeepDive() {
  return (
    <section className="rl-container rl-outcome" aria-labelledby="hospitality-heading">
      <div className="rl-hospitality">
        <div className="rl-hospitality-photo">
          <Image src="/images/landing/hotel-suite.jpg" alt="A carefully prepared guest room with warm wood finishes and a view into a green courtyard" fill sizes="(max-width: 800px) 90vw, (max-width: 1440px) 45vw, 656px" />
          <div className="rl-room-tag" aria-hidden="true">
            <span>Room 104</span><div><b>Ready for the next welcome.</b><small>Good operations stay behind the scenes.</small></div>
          </div>
        </div>
        <div className="rl-hospitality-copy">
          <p className="rl-eyebrow">The outcome</p>
          <h2 id="hospitality-heading" className="rl-heading">Keep the systems clear. Keep the welcome human.</h2>
          <p>You already know what good hospitality feels like. RoomLine gives the work behind it a steadier rhythm, so your team can stay present with the people in front of them.</p>
          <div className="rl-hospitality-details">
            <span><Check size={15} aria-hidden="true" /> Figures in Ghana cedis</span>
            <span><Users size={15} aria-hidden="true" /> A shared view for your team</span>
          </div>
        </div>
      </div>
    </section>
  );
}

import { ActionLink } from "./action-link";

export function DemoCta() {
  return (
    <section className="rl-final" aria-labelledby="final-heading">
      <div className="rl-container rl-final-inner">
        <div>
          <p className="rl-eyebrow">Make room for the welcome</p>
          <h2 id="final-heading" className="rl-heading">Give your property a clearer day.</h2>
          <p>Bring reservations, rooms, and payments into one place.</p>
        </div>
        <div className="rl-final-action"><ActionLink /><small>Start with RoomLine.</small></div>
      </div>
    </section>
  );
}

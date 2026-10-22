const steps = [
  { number: "01", title: "Book the stay", copy: "Capture the guest, dates, room, and rate in one reservation." },
  { number: "02", title: "Prepare the welcome", copy: "See what is arriving, what is ready, and what your team needs next." },
  { number: "03", title: "Close the day", copy: "Review charges, payments, and the handover before the next shift begins." },
] as const;

export function How() {
  return (
    <section id="how-it-works" className="rl-section" aria-labelledby="how-heading">
      <div className="rl-container rl-process">
        <div className="rl-process-intro">
          <p className="rl-eyebrow">One stay, start to finish</p>
          <h2 id="how-heading" className="rl-heading">A calmer day starts with a clearer handover.</h2>
          <p className="rl-description">Simple enough to pick up between guests. Clear enough to keep every shift moving together.</p>
        </div>
        <ol className="rl-process-list">
          {steps.map((step) => (
            <li key={step.number}>
              <span className="rl-process-number">{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.copy}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

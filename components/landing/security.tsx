import { Fingerprint, History, UserRoundCheck } from "lucide-react";

export function Security() {
  return (
    <section id="security" className="lp-section lp-security" aria-labelledby="security-heading">
      <div className="lp-container lp-security-grid">
        <div><p className="lp-eyebrow">Confidence, built in</p><h2 id="security-heading">Your property.<br />Your people.<br /><span>Your control.</span></h2><p className="lp-security-intro">Good hospitality depends on trust. Your operating system should earn it, too.</p></div>
        <div className="lp-security-points"><article><UserRoundCheck size={23} strokeWidth={1.5} aria-hidden="true" /><div><h3>The right access for every role</h3><p>Give owners, managers, and front-desk staff permissions suited to their responsibilities.</p></div></article><article><History size={23} strokeWidth={1.5} aria-hidden="true" /><div><h3>A record you can follow</h3><p>Trace operational changes through the audit log, with staff activity attached to the work.</p></div></article><article><Fingerprint size={23} strokeWidth={1.5} aria-hidden="true" /><div><h3>Clear accountability at close of day</h3><p>Review arrivals, departures, and balances before closing the business day with night audit.</p></div></article></div>
      </div>
    </section>
  );
}

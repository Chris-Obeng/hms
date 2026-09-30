import { ProductPreview } from "./product-preview";

export function Showcase() {
  return (
    <section id="platform" className="lp-section lp-platform" aria-labelledby="platform-heading">
      <div className="lp-container">
        <div className="lp-section-heading"><div><p className="lp-eyebrow">The whole picture</p><h2 id="platform-heading">A clear view.<br />A better-run hotel.</h2></div><p>From the first reservation to the final receipt, give every part of your operation the same source of truth.</p></div>
        <ProductPreview />
        <p className="lp-preview-footnote"><span>Explore at your own pace.</span> This interactive preview uses sample data. Nothing here changes a real property.</p>
      </div>
    </section>
  );
}

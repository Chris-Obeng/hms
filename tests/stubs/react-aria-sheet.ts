// Test-only stub for `react-aria-components/Sheet`.
// HeroUI 3.2.7's sheet component imports this RAC subpath, but the installed
// react-aria-components build does not ship it. Next tree-shakes the unused
// module; Vitest's dependency prebundle does not, so tests alias it here.
const sheetStub = {};
export default sheetStub;

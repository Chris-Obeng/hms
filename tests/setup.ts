import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * React Testing Library auto-registers its cleanup only when a GLOBAL
 * `afterEach` exists (see @testing-library/react/dist/index.js). Vitest here
 * runs with `globals: false`, so that hook never fires and rendered trees pile
 * up in the document — `getByRole` then finds the element from the previous
 * test too. Registering it explicitly is the documented workaround.
 *
 * Safe for the node-environment (lib/domain) files: `cleanup()` only walks its
 * own mounted containers, so with none it never touches `document`.
 */
afterEach(cleanup);

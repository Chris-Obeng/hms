# Local development

Use the pnpm version pinned in `package.json`: **10.32.1**. Run commands from the
repository root so pnpm can select that version. Both your terminal and coding
tools must use the same version; do not alternate pnpm majors against the same
`node_modules` directory or run overlapping installs.

## First setup or dependency changes

```sh
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

The version command should report `10.32.1`. The package-manager pin lets pnpm
select that version, while the engine requirement rejects an incompatible
version if automatic selection is disabled. No global pnpm change is required.

Stop the server with Ctrl+C. For subsequent sessions, simply run `pnpm dev`.
The existing Webpack development mode is unchanged.

## Missing `next` or dependency-validation errors

`'next' is not recognized` can mean the local `node_modules/.bin` command shims
or the installed Next package are missing. During diagnosis, pnpm 10.32.1 and
12.3.4 were observed rebuilding this directory, and interrupted registry
downloads left it incomplete. Installing Next globally does not repair it.

1. Let any existing install finish; stop dev/test processes before repairing.
2. Confirm `pnpm --version` reports the pinned version.
3. Run `pnpm install --frozen-lockfile` and wait for a successful exit.
4. Run `pnpm dev` again.

For a slow or unreliable registry connection, retry the explicit install with:

```sh
pnpm install --frozen-lockfile --network-concurrency=2 --fetch-timeout=300000
```

`verifyDepsBeforeRun: error` checks dependency state without silently launching
an install from `pnpm dev`, `pnpm test`, or `pnpm exec`. After intentional
dependency changes, run an explicit install before starting those commands.
This keeps simultaneous sessions from starting automatic repair installs; it
does not prevent someone from manually launching two installs.

Dependency build scripts remain blocked. `allowBuilds` replaces the deprecated
ignore list without enabling scripts or changing dependency versions. Review
any future script approval separately; do not enable all builds to silence an
installation warning.

## Startup regression check

```sh
pnpm test:tooling
```

This runs isolated temporary fixtures using the selected pnpm version. Missing
and stale dependencies must stop startup without installing; a valid fixture
must run twice. The fixtures use an offline empty install for setup and a local
network trap to detect unintended registry access. They do not change this
project's installed dependencies or start the application server.

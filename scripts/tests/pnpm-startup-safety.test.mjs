import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";

const workspace = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8");
const safetySetting = workspace.match(/^verifyDepsBeforeRun:[^\r\n]*/m)?.[0] ?? "";
const { packageManager } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const expectedVersion = packageManager?.match(/^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/)?.[1];
assert.ok(expectedVersion, "Pin an exact pnpm version in package.json");
const windows = process.platform === "win32";
// A pnpm-launched test must reuse its launcher, not another major from PATH.
const pnpm = process.env.PNPM_TEST_BIN ?? process.env.npm_execpath ?? (process.env.PATH ?? "")
  .split(delimiter)
  .flatMap((directory) => (windows ? ["pnpm.exe", "pnpm.cmd"] : ["pnpm"])
    .map((name) => join(directory, name)))
  .find(existsSync);
assert.ok(pnpm, "Install pnpm or set PNPM_TEST_BIN to an existing pnpm executable");

test("pnpm validates startup without silently installing dependencies", { timeout: 180_000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "roomline-pnpm-startup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let requests = 0;
  const registry = createServer((_request, response) => {
    response.writeHead(404).end("Unexpected registry access");
  });
  registry.on("connection", () => { requests += 1; });
  registry.listen(0, "127.0.0.1");
  await once(registry, "listening");
  t.after(() => { registry.closeAllConnections(); registry.close(); });
  const registryUrl = `http://127.0.0.1:${registry.address().port}/`;
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(npm_|pnpm_|corepack_|node_options$|path$)|_proxy$/i.test(key)));
  Object.assign(env, {
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
    CI: "true", NO_COLOR: "1", COREPACK_ENABLE_NETWORK: "0",
    HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: root,
    XDG_DATA_HOME: root, XDG_CACHE_HOME: root, XDG_STATE_HOME: root,
    APPDATA: root, LOCALAPPDATA: root,
    HTTP_PROXY: registryUrl, HTTPS_PROXY: registryUrl, ALL_PROXY: registryUrl,
    NO_PROXY: "127.0.0.1,localhost",
  });

  async function run(directory, command) {
    // Scoped to the fixture process: never download/delegate to another pnpm.
    const args = ["--config.manage-package-manager-versions=false",
      "--config.update-notifier=false", "--config.fetch-retries=0", ...command];
    const cmdShim = windows && /\.(cmd|bat)$/i.test(pnpm);
    const jsCli = /\.[cm]?js$/i.test(pnpm);
    const child = spawn(cmdShim ? (process.env.ComSpec ?? "cmd.exe") : jsCli ? process.execPath : pnpm,
      cmdShim ? ["/d", "/s", "/c", `""${pnpm}" ${args.map((arg) => `"${arg}"`).join(" ")}"`]
        : jsCli ? [pnpm, ...args] : args,
      { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
        windowsVerbatimArguments: cmdShim });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    const [code, signal] = await once(child, "close");
    assert.equal(signal, null, `pnpm timed out or was killed: ${output}`);
    assert.equal(requests, 0, `pnpm attempted registry/proxy access: ${output}`);
    return { code, output };
  }

  const versionResult = await run(root, ["--version"]);
  assert.equal(versionResult.code, 0, versionResult.output);
  const version = versionResult.output.trim();
  assert.equal(version, expectedVersion,
    `Selected ${pnpm} reports ${version}; use the pinned pnpm via test:tooling or PNPM_TEST_BIN`);
  t.diagnostic(`Testing pnpm ${version} (${pnpm})`);

  function fixture(name, dependencies = {}) {
    const directory = join(root, name);
    mkdirSync(directory);
    writeFileSync(join(directory, "pnpm-workspace.yaml"), `${safetySetting}\n`);
    writeFileSync(join(directory, ".npmrc"), `registry=${registryUrl}\n`);
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      name, version: "1.0.0", private: true, packageManager: `pnpm@${version}`, dependencies,
      scripts: { dev: "node probe.cjs dev", preinstall: "node probe.cjs install" },
    }));
    writeFileSync(join(directory, "probe.cjs"),
      'require("node:fs").appendFileSync(process.argv[2] + ".ran", "ran\\n");');
    return directory;
  }

  // Let the selected pnpm generate its own metadata, offline, with zero dependencies.
  async function emptyInstall(directory) {
    const { code, output } = await run(directory,
      ["install", "--offline", "--no-frozen-lockfile", "--store-dir", join(root, "store")]);
    assert.equal(code, 0, output);
    assert.equal(readFileSync(join(directory, "install.ran"), "utf8"), "ran\n", output);
    rmSync(join(directory, "install.ran"));
    return readFileSync(join(directory, "pnpm-lock.yaml"), "utf8");
  }

  async function dev(directory) {
    const { code, output } = await run(directory, ["dev"]);
    assert.equal(existsSync(join(directory, "install.ran")), false, output);
    assert.doesNotMatch(output, /(?:Progress: resolved|Downloading|verify-deps-before-run-install)/, output);
    return { code, output };
  }

  await t.test("missing dependencies fail before dev", async () => {
    const directory = fixture("missing", { "roomline-startup-missing": "1.0.0" });
    const { code, output } = await dev(directory);
    assert.notEqual(code, 0, output);
    assert.match(output, /ERR_PNPM_VERIFY_DEPS_BEFORE_RUN/, output);
    assert.equal(existsSync(join(directory, "dev.ran")), false, output);
    assert.equal(existsSync(join(directory, "node_modules")), false, output);
    assert.equal(existsSync(join(directory, "pnpm-lock.yaml")), false, output);
  });

  await t.test("stale dependency state fails before dev", async () => {
    const directory = fixture("stale");
    const lockfile = await emptyInstall(directory);
    const manifestPath = join(directory, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dependencies = { "roomline-startup-missing": "2.0.0" };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const newer = new Date(Date.now() + 2_000);
    utimesSync(manifestPath, newer, newer);
    const { code, output } = await dev(directory);
    assert.notEqual(code, 0, output);
    assert.match(output, /ERR_PNPM_VERIFY_DEPS_BEFORE_RUN/, output);
    assert.doesNotMatch(output, /Cannot check whether dependencies are outdated/, output);
    assert.equal(existsSync(join(directory, "dev.ran")), false, output);
    assert.equal(readFileSync(join(directory, "pnpm-lock.yaml"), "utf8"), lockfile);
  });

  await t.test("a no-dependency project can run repeatedly", async () => {
    const directory = fixture("valid");
    const lockfile = await emptyInstall(directory);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { code, output } = await dev(directory);
      assert.equal(code, 0, output);
    }
    assert.equal(readFileSync(join(directory, "dev.ran"), "utf8"), "ran\nran\n");
    assert.equal(readFileSync(join(directory, "pnpm-lock.yaml"), "utf8"), lockfile);
  });
});

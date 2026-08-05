const path = require("path");

const GENESIS_ROOT = path.resolve(__dirname, "..", "..");

const ACTIVE_CORE = "ACTIVE_CORE";

const OLD_BSC_BRIDGE_MACHINERY = Object.freeze([
  "TendermintLightClient",
  "TokenHub",
  "RelayerIncentivize",
  "RelayerHub",
  "TokenManager",
  "CrossChain",
  "Staking",
  "TokenRecoverPortal",
  "NativeGiltBridge",
]);

const OLD_BSC_BRIDGE_KEYS = Object.freeze(
  OLD_BSC_BRIDGE_MACHINERY.map((name) => name.charAt(0).toLowerCase() + name.slice(1)),
);

const LEGACY_SOURCE_MUTATING_LAUNCH_SCRIPTS = Object.freeze([
  "scripts/generate-genesis.js",
  "scripts/generate.py",
]);

const LEGACY_SCRIPT_MESSAGE =
  "old source-mutating launch scripts are disabled for production Gold Chain launch. Use npm run launch:core:testnet or npm run launch:core:mainnet.";

function normalizeName(value) {
  return String(value || "").toLowerCase();
}

function normalizeScriptPath(scriptPath, cwd = GENESIS_ROOT) {
  const raw = String(scriptPath || "").replace(/\\/g, "/");
  if (!raw) {
    return "";
  }
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  return path.relative(GENESIS_ROOT, absolute).replace(/\\/g, "/").toLowerCase();
}

function oldBscBridgeNames() {
  return new Set(OLD_BSC_BRIDGE_MACHINERY.map(normalizeName));
}

function oldBscBridgeKeys() {
  return new Set(OLD_BSC_BRIDGE_KEYS.map(normalizeName));
}

function isOldBscBridgeMachinery(entry, key) {
  const contract = normalizeName(entry?.contract || entry?.contractName);
  const name = normalizeName(entry?.name || entry?.key || key);
  return oldBscBridgeNames().has(contract) || oldBscBridgeKeys().has(name);
}

function launchSurfaceEntries(surface) {
  if (Array.isArray(surface)) {
    return surface.map((entry) => ({ key: entry?.name || entry?.key || entry?.contract, entry }));
  }
  if (surface && typeof surface === "object") {
    return Object.entries(surface).map(([key, entry]) => ({ key, entry: { ...entry, key } }));
  }
  return [];
}

function assertNoActiveCoreOldBscBridgeMachinery(surface, label = "launch surface") {
  for (const { key, entry } of launchSurfaceEntries(surface)) {
    if (entry?.classification !== ACTIVE_CORE || !isOldBscBridgeMachinery(entry, key)) {
      continue;
    }
    const contract = entry.contract || entry.contractName || key;
    throw new Error(`old BSC bridge machinery ${contract} must not be ACTIVE_CORE on ${label}`);
  }
}

function legacyLaunchScriptMatch(scriptPath, cwd = GENESIS_ROOT) {
  const normalized = normalizeScriptPath(scriptPath, cwd);
  return LEGACY_SOURCE_MUTATING_LAUNCH_SCRIPTS.find((legacyScript) => normalized === legacyScript);
}

function assertNotLegacySourceMutatingLaunchScript(scriptPath, cwd = GENESIS_ROOT) {
  const legacyScript = legacyLaunchScriptMatch(scriptPath, cwd);
  if (legacyScript) {
    throw new Error(`${legacyScript}: ${LEGACY_SCRIPT_MESSAGE}`);
  }
}

function assertNoLegacySourceMutatingLaunchInvocation(command, args = [], cwd = GENESIS_ROOT) {
  const candidates = [command, ...args].filter((value) => typeof value === "string");
  for (const candidate of candidates) {
    assertNotLegacySourceMutatingLaunchScript(candidate, cwd);
  }
}

module.exports = {
  LEGACY_SCRIPT_MESSAGE,
  LEGACY_SOURCE_MUTATING_LAUNCH_SCRIPTS,
  OLD_BSC_BRIDGE_KEYS,
  OLD_BSC_BRIDGE_MACHINERY,
  assertNoActiveCoreOldBscBridgeMachinery,
  assertNoLegacySourceMutatingLaunchInvocation,
  assertNotLegacySourceMutatingLaunchScript,
};

/**
 * electron-builder configuration for Enlarger.
 *
 * Code signing (Azure Artifact Signing / Trusted Signing) is OFF by default so
 * that a plain `npm run dist` works on any machine with no credentials. It
 * switches on automatically when BOTH halves are present:
 *
 *   1. The three non-secret identifiers below (or their env overrides).
 *   2. The three Entra ID credentials in the environment:
 *      AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *
 * electron-builder authenticates via Azure's EnvironmentCredential, which reads
 * those three variables itself -- we never pass them through this file, so they
 * cannot leak into build logs.
 *
 * See docs/signing.md for the full provisioning walkthrough.
 */

// ---------------------------------------------------------------------------
// Azure Artifact Signing identifiers. NOT secrets -- committing them is fine
// and intended. They identify the account; they grant no access to it.
//
// Each can be overridden by the matching environment variable, which is how a
// second signing account (a test profile, say) can be used without editing
// this file.
// ---------------------------------------------------------------------------

/** Region-scoped signing endpoint. West US per the account's region. */
const AZURE_SIGNING_ENDPOINT =
  process.env.AZURE_SIGNING_ENDPOINT || 'https://wus.codesigning.azure.net';

/** Artifact Signing account resource name. */
const AZURE_CODE_SIGNING_ACCOUNT = process.env.AZURE_CODE_SIGNING_ACCOUNT || 'upscaler-desktop';

/** Certificate profile name; its subject CN is the publisher users see. */
const AZURE_CERTIFICATE_PROFILE = process.env.AZURE_CERTIFICATE_PROFILE || 'upscaler-desktop';

// ---------------------------------------------------------------------------

const identifiers = {
  endpoint: AZURE_SIGNING_ENDPOINT,
  codeSigningAccountName: AZURE_CODE_SIGNING_ACCOUNT,
  certificateProfileName: AZURE_CERTIFICATE_PROFILE,
};

const credentialVars = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];

const missingIdentifiers = Object.entries(identifiers)
  .filter(([, v]) => !v)
  .map(([k]) => k);
const missingCredentials = credentialVars.filter((v) => !process.env[v]);

const signingEnabled = missingIdentifiers.length === 0 && missingCredentials.length === 0;

if (signingEnabled) {
  console.log(`[enlarger] Code signing ENABLED via ${identifiers.endpoint}`);
} else {
  // `npm run dist -- --publish never` on a dev box lands here. That is fine and
  // expected; only a release build is required to be signed.
  const why = [
    missingIdentifiers.length ? `unset identifiers: ${missingIdentifiers.join(', ')}` : null,
    missingCredentials.length ? `unset credentials: ${missingCredentials.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('; ');
  console.log(`[enlarger] Code signing DISABLED (${why}) -- producing an UNSIGNED installer`);

  if (process.env.ENLARGER_REQUIRE_SIGNING === 'true') {
    // The release workflow sets this so a misconfigured secret fails the build
    // loudly instead of silently shipping an unsigned installer.
    throw new Error(
      `Signing was required (ENLARGER_REQUIRE_SIGNING=true) but is not configured: ${why}`,
    );
  }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.bradhinkel.enlarger',
  productName: 'Enlarger',
  copyright: `Copyright (c) ${new Date().getFullYear()} Brad Hinkel`,
  directories: {
    buildResources: 'build',
    output: 'release',
  },
  files: ['out/**/*'],
  win: {
    target: 'nsis',
    ...(signingEnabled ? { azureSignOptions: identifiers } : {}),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Enlarger',
  },
  extraResources: [
    { from: 'resources/bin', to: 'bin' },
    { from: 'resources/models', to: 'models' },
    { from: 'resources/lpips.onnx', to: 'lpips.onnx' },
    { from: 'resources/lpips.onnx.data', to: 'lpips.onnx.data' },
  ],
};

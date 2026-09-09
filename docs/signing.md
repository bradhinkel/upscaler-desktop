# Code signing — Azure Artifact Signing

How Enlarger's Windows installer gets signed, and exactly what to paste where.

**Status:** framework wired, credentials not yet provisioned. Builds today are
unsigned by design; nothing breaks, and the release workflow says so out loud.

---

## Why this matters

An unsigned NSIS installer downloaded from the web triggers a full-screen
SmartScreen "Windows protected your PC — Unknown publisher" block. Most people
stop there. Signing replaces "Unknown publisher" with a real name in the UAC
prompt, which is the single biggest trust difference for a stranger downloading
an alpha.

Azure Artifact Signing (formerly Trusted Signing) is used instead of a
traditional OV/EV certificate because there is no hardware token to manage, it
is ~$9.99/mo rather than several hundred a year, and the short-lived
certificates it issues chain to a Microsoft root.

---

## One-time provisioning (Brad, in the Azure portal)

1. **Create the signing account.** Azure Portal → Trusted Signing / Artifact
   Signing → create account, **Basic** tier. Pick a region and remember it —
   the signing endpoint is region-scoped.
2. **Identity validation.** Individual validation, government-ID based. This is
   the long-pole step; everything else is minutes.
3. **Certificate profile.** Create one of type **Public Trust** under the
   account. Its subject CN is the publisher string users see in the UAC prompt
   — this should read `Enlarger` or `Brad Hinkel`, whichever reads better on a
   consent dialog.
4. **Service principal.** Microsoft Entra ID → App registrations → new
   registration → Certificates & secrets → new client secret. Copy the secret
   value immediately; it is shown once.
5. **Role assignment.** On the *certificate profile* resource, assign the
   service principal the **Trusted Signing Certificate Profile Signer** role.
   Assigning at the account level instead is a common cause of 403s at sign
   time.

---

## What to paste into GitHub

GitHub repo → **Settings → Secrets and variables → Actions**.

### Tab: Variables (these are not secrets — they are also fine to commit)

| Name | Value | Where it comes from |
|---|---|---|
| `AZURE_SIGNING_ENDPOINT` | `https://<region>.codesigning.azure.net` | Region of the signing account, e.g. `eus`, `wus2`, `neu` |
| `AZURE_CODE_SIGNING_ACCOUNT` | account name | Step 1 |
| `AZURE_CERTIFICATE_PROFILE` | profile name | Step 3 |

### Tab: Secrets

| Name | Value | Where it comes from |
|---|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID | Entra ID app registration overview |
| `AZURE_CLIENT_ID` | Application (client) ID | Entra ID app registration overview |
| `AZURE_CLIENT_SECRET` | client secret **value** (not the secret ID) | Step 4 |

That is the whole handoff. No code change is required — `electron-builder.config.js`
reads all six from the environment.

### Optional: hardcode the three identifiers

If you would rather not keep the non-secret values in Actions variables, paste
them directly into the marked **PASTE ZONE** at the top of
`electron-builder.config.js` and drop the three `vars.*` lines from
`.github/workflows/release.yml`. Committing them is safe — they identify the
account, they do not grant access to it.

---

## How the switch works

`electron-builder.config.js` enables signing only when all three identifiers and
all three credentials are present. Otherwise it prints:

```
[enlarger] Code signing DISABLED (unset identifiers: ...) -- producing an UNSIGNED installer
```

and builds anyway, so `npm run dist` keeps working on a dev box with no
credentials.

The release workflow sets `ENLARGER_REQUIRE_SIGNING` to true **once
`AZURE_CLIENT_ID` exists as a secret**. From that point a misconfiguration is a
hard build failure rather than a silently unsigned installer. The `Verify
signature` step independently re-checks with `Get-AuthenticodeSignature` and
enforces the 400 MB size budget.

Credentials are never passed through the config file. electron-builder
authenticates through Azure's `EnvironmentCredential`, which reads the three
`AZURE_*` variables from the process environment directly.

---

## Local signed build (rarely needed)

```powershell
$env:AZURE_SIGNING_ENDPOINT      = "https://<region>.codesigning.azure.net"
$env:AZURE_CODE_SIGNING_ACCOUNT  = "<account>"
$env:AZURE_CERTIFICATE_PROFILE   = "<profile>"
$env:AZURE_TENANT_ID             = "<tenant-id>"
$env:AZURE_CLIENT_ID             = "<client-id>"
$env:AZURE_CLIENT_SECRET         = "<client-secret>"
npm run dist
```

Verify:

```powershell
Get-AuthenticodeSignature "release\Enlarger Setup 0.1.0.exe" | Format-List Status, SignerCertificate
signtool verify /pa /v "release\Enlarger Setup 0.1.0.exe"
```

`Status: Valid` and a `signtool` chain terminating in a Microsoft root is the
pass condition.

**Never put these in `.env`, a shell profile, or a commit.** They live in
GitHub Actions secrets, and in a terminal session only when hand-verifying.

---

## Cutting a release

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag push runs quality gates → builds → signs → verifies → publishes a
GitHub Release. `v0.*` tags are marked **pre-release** automatically, which is
what keeps the alpha labelled as an alpha.

---

## Known sharp edges

- **SmartScreen reputation is separate from signing.** Signing removes the
  Unknown-publisher block. Reputation is also download-volume-based, so a brand
  new publisher identity can still draw a milder "not commonly downloaded"
  interstitial for a while. Do not treat that as a signing failure.
- **Client secrets expire** (24 months maximum, often defaulted to 6). A release
  that suddenly fails auth a year from now is usually this.
- **Role scope.** The signer role must be on the certificate profile, not just
  the account.
- **Region mismatch.** The endpoint region must match where the account was
  created, or signing 404s.

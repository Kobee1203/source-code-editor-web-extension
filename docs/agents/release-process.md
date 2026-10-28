# Release Process & Store Submissions

This document outlines the complete process for cutting releases, configuring GitHub secrets, and publishing **Source Code Editor** to web stores via GitHub Actions.

---

## 1. Required GitHub Secrets

The release workflow ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)) performs two main tasks:

1. Creates a **GitHub Release** and attaches packaged `.zip` artifacts (`chrome`, `firefox`, `edge`).
2. Submits extension packages to **Chrome Web Store**, **Firefox Add-ons (AMO)**, and **Microsoft Edge Add-ons** using `wxt submit`.

### A. GitHub Release Only (No Store Submission)

- **No repository secrets are required.**
- GitHub Actions uses the built-in `GITHUB_TOKEN` (`GH_TOKEN: ${{ github.token }}`).
- **Required Repository Setting**:
  - In **Settings > Actions > General > Workflow permissions**, select **"Read and write permissions"** and click **Save**.
- If store secrets are omitted, the workflow automatically skips store uploads without failing the build.

### B. Automated Web Store Submissions

To enable automated store submissions, add the following secrets under **Settings > Secrets and variables > Actions > Repository secrets**:

| Store                | Secret Name                           | Description / Source                                                                                     |
| :------------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------------- |
| **Chrome Web Store** | `CHROME_EXTENSION_ID`                 | Extension ID from the Chrome Web Store Developer Dashboard.                                              |
|                      | `CHROME_PUBLISHER_ID`                 | Publisher ID from the Developer Dashboard URL (`/devconsole/<publisher-id>`).                            |
|                      | `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | Service Account email address (`client_email` from Google Cloud JSON key).                               |
|                      | `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`  | Service Account private key (`private_key` from Google Cloud JSON key).                                  |
| **Firefox AMO**      | `FIREFOX_EXTENSION_ID`                | Extension UUID/ID (`source-code-editor@kobee1203.github.io`) registered on Firefox Add-on Developer Hub. |
|                      | `FIREFOX_JWT_ISSUER`                  | JWT Issuer (API Key) from AMO API Credentials.                                                           |
|                      | `FIREFOX_JWT_SECRET`                  | JWT Secret from AMO API Credentials.                                                                     |
| **Edge Add-ons**     | `EDGE_PRODUCT_ID`                     | Product ID from Microsoft Partner Center dashboard.                                                      |
|                      | `EDGE_CLIENT_ID`                      | Azure AD / Partner Center Client ID.                                                                     |
|                      | `EDGE_API_KEY`                        | Partner Center API Key / Client Secret.                                                                  |

> [!TIP]
> You can generate all of these store credentials locally by running:
>
> ```bash
> pnpm wxt submit init
> ```
>
> This creates a local `.env.submit` file (ignored by Git) containing all values ready to be copied into GitHub Repository Secrets.

---

## 2. Step-by-Step Release Workflow

### Step 1: Bump Version in `package.json`

Update the `"version"` field in [`package.json`](../../package.json) to the target version (e.g., `0.2.0`):

```json
"version": "0.2.0",
```

### Step 2: Update `CHANGELOG.md`

1. Open [`CHANGELOG.md`](../../CHANGELOG.md).
2. Replace `## [Unreleased]` with the version and release date (ISO `YYYY-MM-DD`):
   ```markdown
   ## [0.2.0] - 2026-10-28
   ```
3. Add a fresh, empty `## [Unreleased]` section above it for subsequent work.

### Step 3: Local Verification

Run the verification suite locally before committing:

```bash
pnpm lint
pnpm lint:css
pnpm format:check
pnpm compile
pnpm test
pnpm metadata:check
pnpm build
```

### Step 4: Commit, Tag, and Push

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): bump version to 0.2.0"
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

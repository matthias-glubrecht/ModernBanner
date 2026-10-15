# ModernBanner

Framework-free SPFx **1.4.1 Application Customizer** for **SharePoint Server 2019** and
**SharePoint Server Subscription Edition (SE)**. Supported browsers: current **Edge and Chrome**.
SharePoint 2016, IE11 and classic pages are not supported.

Displays a scrolling plain-text announcement in the **Top placeholder** of supported modern pages.
The source solution at `C:\Source\BannerMitLaufschrift` remains independent and unchanged.
No React, Microsoft Graph, external CDN, or extra runtime library is needed.

## Build

Use **Node 8.17.0 via fnm**, pinned in [.nvmrc](.nvmrc), with npm 6:

```powershell
Set-Location C:\Source\ModernBanner
fnm exec --using 8.17.0 cmd /d /c "node -v & npm -v"
fnm exec --using 8.17.0 cmd /d /c "npm ci"
fnm exec --using 8.17.0 cmd /d /c "npm test"
fnm exec --using 8.17.0 cmd /d /c "npm run package"
```

`cmd /d` disables cmd AutoRun hooks that might otherwise select another Node version.
The locked build uses TypeScript 2.4.2, Gulp 3 and the SPFx-managed Webpack 3.
Keep [package-lock.json](package-lock.json) and use `npm ci` for reproducible restores.
Node 8 and this toolchain are end-of-life: use only as an isolated build environment, not a server runtime.
Dependency deprecation notices and the rig's deprecated TSLint-rule notices are expected.

The output is [sharepoint/solution/modern-banner.sppkg](sharepoint/solution/modern-banner.sppkg).
It includes the JavaScript, compiled styles, and English/German resources through the
generator-standard `includeClientSideAssets: true`. No separate asset upload is needed.
The `write-manifests.json` CDN placeholder is the generator default; the packager replaces
it with the SharePoint client-side asset-library marker in the packaged component manifest.

### Validation

```powershell
# After npm run package:
powershell -NoProfile -File .\tests\verify-package.ps1

# Real browser layout, 80px/s, pause/play, container resize and reduced motion:
fnm exec --using 8.17.0 cmd /d /c "npm run test:browser"

# To run just one installed browser:
fnm exec --using 8.17.0 cmd /d /c "node tests\browser-smoke.js Chrome"
fnm exec --using 8.17.0 cmd /d /c "node tests\browser-smoke.js Edge"
```

Tests are JavaScript against the actual TypeScript 2.4-compiled modules, avoiding incompatible
modern test typings. The explicit Jest 23 jsdom environment prevents a conflict with the rig's Jest 20.
jsdom does not normalize named computed colors; unit tests model that browser behavior explicitly,
and browser smoke tests verify it natively. Browser tests need the named installed browsers and
working headless execution; a failure is reported, not silently skipped.
They use generated CSS with default theme-token colors and do not substitute for farm theming tests.

## Properties

Configure the User Custom Action's `ClientSideComponentProperties` JSON:

```json
{
  "bannerText": "Scheduled maintenance on Friday",
  "backgroundColor": "#ffd700",
  "textColor": "#000000",
  "fontSize": 18,
  "includedPageNames": ["Interviewmaske2", "Home"]
}
```

| Property | Default | Meaning |
| --- | --- | --- |
| `bannerText` | Empty (hidden) | Plain text; HTML is not interpreted. Whitespace-only text hides the banner. |
| `backgroundColor` | Site theme | Optional CSS background color. |
| `textColor` | Site theme | Optional CSS text color. |
| `fontSize` | `14` | Finite numeric CSS pixels, **10-72 inclusive**; fractional sizes allowed. |
| `includedPageNames` | All supported modern pages | Optional array of SitePages filenames **without `.aspx`**. |

### Colors and accessibility

- Both colors empty: theme slots `themePrimary` and `white`, with blue/white fallback.
- Both configured: use exactly those colors; administrators are responsible for their contrast.
- Just one configured: automatically select white if it meets WCAG AA **4.5:1**, otherwise black.
- Invalid CSS colors are ignored with a warning through SPFx `Log.warn`; unsupported automatic color
  conversions also warn and use the theme for the unresolved side. Alpha is composited over white.
- Invalid `fontSize` (including strings such as `"18px"`, `null`, or out-of-range numbers) logs a
  warning and uses **14px**, rather than clamping.
- Text scrolls right to left at **80 px/s**, adapting to text and container width.
- Hover over the text to pause, or use the keyboard-accessible pause/play button.
- `prefers-reduced-motion: reduce` disables animation, wraps the text and hides the button.
- Text line height scales with font size; banner height grows naturally.
- English and German accessible labels follow the SharePoint UI locale.

### Optional page-name filtering

`"includedPageNames": ["Interviewmaske2"]` matches:

```text
/sites/Otto/SitePages/Interviewmaske2.aspx
/sites/Otto/SitePages/Folder/Interviewmaske2.aspx
```

- Uses the **URL filename**, not the page title.
- Exact, case-insensitive name match. Query strings and fragments do not affect matching.
- Configure readable names (e.g. `"Interview M\u00e4rz"`); URL percent encoding is decoded once.
- Only `.aspx` pages below the **current web's SitePages library**, including subfolders, are eligible
  when the filter is nonempty. Lists, libraries, `Pages`, and classic pages are not made eligible.
- At Site scope, an identical name in several subwebs matches in each web where the component is available.
- Omitted or `[]`: **no page restriction**, preserving the original modern-page behavior.
- Invalid filter configuration logs a warning and **hides** the banner; it never broadens visibility.
  Entries must be nonempty names without `.aspx`, path separators, query/fragment or wildcards.
- Renaming the file requires updating the configuration. Changing its title does not.
- A web-root welcome-page alias (e.g. `/sites/Otto/`) is not inferred as `Home.aspx`.
- Re-evaluates on SharePoint in-place navigation and placeholder recreation. Leaving an eligible page
  removes the banner; returning recreates it. Events, observers and DOM are cleaned up on disposal.

This filter controls rendering, **not access/security**; the extension can still load on excluded pages.
Web/Site registration scope and page filtering are independent.

## Deploy and explicitly activate

1. Upload the `.sppkg` to the farm web application's **App Catalog**, and deploy it.
2. Select **Make this solution available to all sites in the organization** in the deployment dialog.
   The package uses `skipFeatureDeployment: true`, so individual sites do not need to install the app.
   Availability is within the scope served by that App Catalog, not automatically across other web applications.
3. Register a User Custom Action using your chosen **Web (SPWeb)** or **Site (SPSite)** scope.
   Deploying this package does not provision a banner User Custom Action.

SPFx 1.4.1 does not use a Tenant Wide Extensions list or `ClientSideInstance.xml`.
The generator's feature-time `elements.xml` CustomAction provisioning has deliberately been removed.
The generated component feature in the package makes the component available; it is not a
banner activation action.

The SPFx 1.4.1 packager warns that globally available extensions still need explicit registration.
That is the intended design here. [gulpfile.js](gulpfile.js) suppresses only that exact advisory for
this component so production packaging succeeds; other warnings and errors remain visible.

| Identifier | Value |
| --- | --- |
| New solution ID | `3f8f3b1c-c6d1-4f5e-8aad-94257f832c5b` |
| New component ID | `7dcf12d6-9e20-4554-aca6-2ce594f84bee` |
| Original component ID (not used here) | `18122664-590f-4dac-a1a2-fa943fa1bff4` |
| Original solution ID (not used here) | `ef6896e7-33dc-43a1-a0e5-1bfe983932ef` |

### Server-side SharePoint Management Shell

[scripts/Set-BannerCustomAction.ps1](scripts/Set-BannerCustomAction.ps1) uses the on-premises
SharePoint **server-side object model**, not Microsoft 365/PnP Online authentication or JSOM/CSOM.
Run it in **Windows PowerShell / SharePoint Management Shell on a farm server** with appropriate
SharePoint shell and site administration permissions. It is not runnable in PowerShell 7 on a developer PC.

```powershell
$properties = @{
    bannerText        = 'Scheduled maintenance on Friday'
    backgroundColor   = '#ffd700'
    textColor         = '#000000'
    fontSize          = 18
    includedPageNames = @('Interviewmaske2')
} | ConvertTo-Json -Compress

# Choose Web OR Site explicitly. Same command updates an existing named action.
.\scripts\Set-BannerCustomAction.ps1 -Url 'https://sharepoint/sites/Otto' `
    -Scope Web -Operation Set -PropertiesJson $properties

# Alternatively, register at site-collection scope:
.\scripts\Set-BannerCustomAction.ps1 -Url 'https://sharepoint/sites/Otto' `
    -Scope Site -Operation Set -PropertiesJson $properties

# Remove at the scope where you registered it:
.\scripts\Set-BannerCustomAction.ps1 -Url 'https://sharepoint/sites/Otto' `
    -Scope Site -Operation Remove
```

The helper requires an explicit scope, supports `-WhatIf`, and identifies its action by
`Name = ModernBanner.Laufschrift`. Use **one registration** covering a page; overlapping Web/Site
registrations can render multiple banners. Remove old-scope registrations when changing scopes.
For a package update, increment solution/package versions, rebuild and upload the new package,
then redeploy it from the App Catalog with all-sites availability retained.
Configuration-only changes need just the `Set` operation.

## Debugging

Set the on-premises `pageUrl` in [config/serve.json](config/serve.json):

```powershell
fnm exec --using 8.17.0 cmd /d /c "gulp trust-dev-cert"
fnm exec --using 8.17.0 cmd /d /c "npm start"
# Example with custom colors, font size and page filter:
fnm exec --using 8.17.0 cmd /d /c "npm start -- --config=laufschrift"
```

Trust the development certificate once per developer machine. Use a supported modern farm page;
the local workbench does not provide an Application Customizer Top placeholder.
Generator metadata says `environment: spo` because generator 1.4.1's `onprem` template targets
SharePoint 2016's web-part-only SPFx. The extension output here targets **2019/SE**, not SharePoint Online.

## Farm smoke-test checklist

Local build/package and browser checks cannot certify a farm deployment. On **both 2019 and SE**:

1. Deploy with all-sites availability; confirm no per-site app installation or banner User Custom Action
   is created/required. Verify component availability on a site where the app was never installed.
2. Register at Web scope, then separately at Site scope, and check intended webs/subwebs.
3. Verify bundled assets and both locales load without a separate hosting URL.
4. Test theme/default colors, each single-color contrast rule, explicit colors, and 10/14/72px fonts.
5. Test included/excluded pages, SitePages folders, case/encoded filenames, same names in subwebs,
   in-place navigation, browser Back/Forward, refresh, and unavailable/recreated placeholders.
6. In Edge and Chrome, test keyboard pause/play, hover pause, resize and OS reduced-motion mode.
7. Update properties, remove the action, and verify the banner is gone after a refresh.

No farm endpoints or credentials are supplied with this project; farm tests must be performed in
the deployment environment. No farm validation is implied by successful local tests.

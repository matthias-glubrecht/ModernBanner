# ModernBanner 1.0.0: installation, activation and deactivation

For **SharePoint Server 2019** and **SharePoint Server Subscription Edition** modern pages.
SharePoint 2016 and classic pages do not support this Application Customizer.
The PnP instructions below specifically use **SharePointPnPPowerShell2019** against SharePoint 2019;
for SE use the pure CSOM option with the client assemblies supported by your farm.

No Node.js, npm or build tools are needed to deploy the release.
Download and extract `modern-banner-1.0.0.zip` from the GitHub release, or use the
repository layout. Run commands from that directory.

## 1. Deploy the package once

1. As an App Catalog administrator, upload `modern-banner.sppkg` to **Apps for SharePoint**
   in the farm web application's App Catalog. In a source checkout the package is under
   `sharepoint\solution`.
2. Deploy it and select **Make this solution available to all sites in the organization**.
   Availability is limited to the web application served by that App Catalog.
3. The package embeds its JavaScript, styles and English/German resources. No external CDN,
   separate asset upload, per-site app installation, or Tenant Wide Extensions list is required.
4. Continue below to register the extension explicitly. Deployment alone does **not** show a banner.

| Item | Value |
| --- | --- |
| Package / solution version | `1.0.0.0` |
| Solution ID | `3f8f3b1c-c6d1-4f5e-8aad-94257f832c5b` |
| Application Customizer component ID | `7dcf12d6-9e20-4554-aca6-2ce594f84bee` |
| User Custom Action name | `ModernBanner.Laufschrift` |
| User Custom Action location | `ClientSideExtension.ApplicationCustomizer` |

## 2. Choose registration scope and permissions

Use **Windows PowerShell 5.1**, not PowerShell 7. Run as an account with permission to manage
User Custom Actions (use a site collection administrator). No farm-server session is needed.
Use the site's normal Windows-authenticated URL, not a Central Administration or App Catalog URL.

- `-Scope Web`: only the exact web at the connection URL, not its subwebs.
- `-Scope Site`: the whole site collection containing that URL, including subwebs where modern
  pages and the component are available.

Choose **one** scope covering a given page. Overlapping Web/Site registrations can show two banners.
When moving scopes, remove the old registration first. A Web removal does not remove a Site action,
and a Site removal does not remove independent actions in individual webs.

The same [CSOM helper](scripts/Set-BannerClientCustomAction.ps1) is used for both connection options.
`Set` creates or updates the named action; repeated runs do not create duplicates.
`Remove` deletes only that named action at the selected scope, leaving the deployed package intact.
Duplicates or a conflicting component under that name cause an explicit error rather than overwriting it.
The helper does not dispose the supplied context; the connection owner does that below.

## 3A. Connect using SharePointPnPPowerShell2019

This is the legacy on-premises module, **not** `PnP.PowerShell` or
`SharePointPnPPowerShellOnline`. It is archived; use an organization-approved copy.
Do not import multiple PnP variants or other CSOM assembly versions into the same session.

```powershell
# One-time installation, if not already provided by your organization:
Install-Module -Name SharePointPnPPowerShell2019 -Scope CurrentUser

Import-Module SharePointPnPPowerShell2019 -ErrorAction Stop
$url = 'https://sharepoint/sites/Otto'
Connect-PnPOnline -Url $url -CurrentCredentials -ErrorAction Stop
$context = Get-PnPContext -ErrorAction Stop
```

For another Windows account, replace `-CurrentCredentials` with
`-Credentials (Get-Credential)`. Do not use Microsoft 365 interactive/AAD login switches.
PnP handles authentication; the helper operates on its CSOM context.

Continue with section 4, then release the PnP connection:

```powershell
Disconnect-PnPOnline -ErrorAction Stop
```

Use `try { ... } finally { Disconnect-PnPOnline -ErrorAction Stop }` around the operations
in unattended scripts so cleanup also runs after an error.

## 3B. Alternatively, connect using pure CSOM (no PnP)

Start a **fresh Windows PowerShell 5.1 session**. Obtain the on-premises SharePoint client
assemblies matching your server from your approved SharePoint client SDK/CSOM distribution.
Place `Microsoft.SharePoint.Client.Runtime.dll` and `Microsoft.SharePoint.Client.dll` together
in a local directory. Do not mix these with SharePoint Online CSOM assemblies.

```powershell
$ErrorActionPreference = 'Stop'
$csomDirectory = 'C:\Tools\SharePoint2019-CSOM'
Add-Type -Path (Join-Path $csomDirectory 'Microsoft.SharePoint.Client.Runtime.dll')
Add-Type -Path (Join-Path $csomDirectory 'Microsoft.SharePoint.Client.dll')

$url = 'https://sharepoint/sites/Otto'
$context = New-Object Microsoft.SharePoint.Client.ClientContext($url)
$context.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials

# Alternatively, use another Windows account (DOMAIN\user):
# $credential = Get-Credential
# $context.Credentials = $credential.GetNetworkCredential()
```

This example uses Windows integrated authentication (NTLM/Kerberos). Forms/SAML-only zones
require an administrator-provided authenticated CSOM context; this script does not implement
federated sign-in or bypass farm authentication. Use HTTPS and never embed passwords in scripts.

Continue with section 4, then dispose the context:

```powershell
$context.Dispose()
```

Use `try { ... } finally { $context.Dispose() }` around the operations in unattended scripts.

## 4. Activate or change configuration

With `$context` connected using **either** option above:

```powershell
$properties = @{
    bannerText        = 'Scheduled maintenance on Friday'
    backgroundColor   = '#ffd700'
    textColor         = '#000000'
    fontSize          = 18
    includedPageNames = @('Home', 'Interviewmaske2')
} | ConvertTo-Json -Compress

# Preview first: reads the selected scope but does not change it.
.\scripts\Set-BannerClientCustomAction.ps1 -Context $context `
    -Scope Web -Operation Set -PropertiesJson $properties -WhatIf

# Activate, or update the existing registration.
.\scripts\Set-BannerClientCustomAction.ps1 -Context $context `
    -Scope Web -Operation Set -PropertiesJson $properties
```

For site-collection activation, use `-Scope Site` **instead of** `-Scope Web` in both commands.
There is no SharePoint feature to activate separately.
Changing properties only requires another `Set`; do not rebuild or redeploy the package.

`bannerText` is plain text, not HTML. An empty string hides the banner without unregistering it.
Colors are optional; omit them for theme colors. `fontSize` is a number from **10 to 72**.
Omit `includedPageNames`, or use `@()`, to show the banner on all supported modern pages.
Otherwise supply exact SitePages filenames **without `.aspx`**, not page titles or full paths.
The filter is case-insensitive and applies to SitePages subfolders too. Invalid filters hide
the banner; the filter is not an access-control boundary.

### Verify the registration and banner

```powershell
# Match the scope used above; use $context.Site.UserCustomActions for Site scope.
$actions = $context.Web.UserCustomActions
$context.Load($actions)
$context.ExecuteQuery()
$actions | Where-Object { $_.Name -eq 'ModernBanner.Laufschrift' } |
    Select-Object Id, Name, Location, ClientSideComponentId, ClientSideComponentProperties
```

Expect exactly one matching action at the chosen scope, with the component ID and location
listed in section 1. Open an included **modern** SitePages page (for example `Home.aspx`) in
Edge or Chrome and perform a full refresh. Confirm the text and pause/play control appear.
If not, check the scope, page-name filter, nonempty text, package all-sites deployment, and
browser console/network errors. An existing tab may retain the old component until refreshed.

## 5. Deactivate (unregister)

Reconnect using section 3A or 3B if necessary. Use the **same URL and scope** as for activation:

```powershell
.\scripts\Set-BannerClientCustomAction.ps1 -Context $context `
    -Scope Web -Operation Remove -WhatIf

.\scripts\Set-BannerClientCustomAction.ps1 -Context $context `
    -Scope Web -Operation Remove
```

Replace `Web` with `Site` if that was your registration scope. An already-absent action produces
a warning and does not remove anything else. Re-run the verification query: expect no matching
action at that scope. Fully refresh a previously included modern page and confirm the banner is
gone. If it remains, inspect the other scope and any independent subweb registrations.
Disconnect/dispose the connection as described in section 3.

Deactivation does not uninstall the solution, delete assets, or affect other sites' registrations.
To re-enable, run `Set` with your saved properties. To uninstall completely, remove the registrations
from every scope/site where you created them **before** retracting/removing the App Catalog package.
Save the properties separately if you want to restore them; removing an action deletes its configuration.

## Validation boundary

The release package and helper have local automated validation. Authentication, permissions,
App Catalog deployment, and rendering on an actual SharePoint farm must be checked in your
environment; no farm certification is implied by the local tests.

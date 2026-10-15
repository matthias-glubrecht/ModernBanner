$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $root 'sharepoint\solution\modern-banner.sppkg'
$zip = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    $componentFound = $false
    $appFound = $false
    $assets = @($zip.Entries | Where-Object { $_.FullName -like 'ClientSideAssets/*.js' })
    if ($assets.Count -ne 3) { throw "Expected bundle and two localizations, found $($assets.Count) assets." }
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '(?i)(elements\.xml|ClientSideInstance\.xml)$') {
            throw "Unexpected activation provisioning: $($entry.FullName)"
        }
        if ($entry.FullName -notlike '*.xml') { continue }
        $reader = New-Object System.IO.StreamReader($entry.Open())
        try { [xml] $xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
        if ($xml.SelectNodes("//*[local-name()='CustomAction']").Count -ne 0) {
            throw "Unexpected User Custom Action provisioning: $($entry.FullName)"
        }
        if ($entry.FullName -eq 'AppManifest.xml') {
            $appFound = $true
            if ($xml.App.ProductID -ne '3f8f3b1c-c6d1-4f5e-8aad-94257f832c5b') {
                throw 'Unexpected solution ID.'
            }
            if ($xml.App.Version -ne '1.0.0.0') { throw 'Unexpected app version.' }
            if ($xml.App.SkipFeatureDeployment -ne 'true') {
                throw 'Package must support all-sites availability without per-site installation.'
            }
        }
        $component = $xml.SelectSingleNode("//*[local-name()='ClientSideComponent']")
        if ($null -eq $component) { continue }
        $componentFound = $true
        $manifest = ConvertFrom-Json $component.ComponentManifest
        if ($manifest.id -ne '7dcf12d6-9e20-4554-aca6-2ce594f84bee' -or
            $manifest.extensionType -ne 'ApplicationCustomizer') {
            throw 'Unexpected component ID/type.'
        }
        if ($manifest.loaderConfig.internalModuleBaseUrls[0] -ne 'HTTPS://SPCLIENTSIDEASSETLIBRARY/') {
            throw 'Package is not using self-contained SharePoint client-side asset hosting.'
        }
        foreach ($resource in $manifest.loaderConfig.scriptResources.PSObject.Properties) {
            if ($resource.Value.type -eq 'component' -and $resource.Value.version -ne '1.4.1') {
                throw "Unexpected SPFx dependency version: $($resource.Name)"
            }
            $paths = @()
            if ($resource.Value.type -eq 'path') { $paths += $resource.Value.path }
            if ($resource.Value.type -eq 'localizedPath') {
                $paths += $resource.Value.defaultPath
                $paths += $resource.Value.paths.PSObject.Properties.Value
                if (-not $resource.Value.paths.'de-DE' -or -not $resource.Value.paths.'en-US') {
                    throw 'Missing German or English localization.'
                }
            }
            foreach ($path in $paths) {
                if (-not $zip.GetEntry("ClientSideAssets/$path")) {
                    throw "Referenced asset missing from package: $path"
                }
            }
        }
    }
    if (-not $componentFound -or -not $appFound) { throw 'Package is missing component or app manifest.' }
    Write-Output 'Package verified: SPFx 1.4.1, all-sites availability, independent IDs, self-contained assets, English/German, no CustomAction provisioning.'
} finally {
    $zip.Dispose()
}

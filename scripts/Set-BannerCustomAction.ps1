[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $Url,

    [Parameter(Mandatory = $true)]
    [ValidateSet('Web', 'Site')]
    [string] $Scope,

    [Parameter(Mandatory = $true)]
    [ValidateSet('Set', 'Remove')]
    [string] $Operation,

    [string] $PropertiesJson
)

$ErrorActionPreference = 'Stop'
$componentId = [Guid] '7dcf12d6-9e20-4554-aca6-2ce594f84bee'
$actionName = 'ModernBanner.Laufschrift'

if ($Operation -eq 'Set') {
    if ([string]::IsNullOrWhiteSpace($PropertiesJson)) {
        throw 'Set requires -PropertiesJson containing bannerText and optional banner settings.'
    }
    $properties = ConvertFrom-Json -InputObject $PropertiesJson
    if ($null -eq $properties -or $properties -is [Array] -or
        $properties -isnot [System.Management.Automation.PSCustomObject]) {
        throw 'PropertiesJson must be a JSON object.'
    }
    if ($properties.bannerText -isnot [string]) {
        throw 'PropertiesJson must contain a string bannerText (empty hides the banner).'
    }
}

if (-not (Get-PSSnapin -Name Microsoft.SharePoint.PowerShell -ErrorAction SilentlyContinue)) {
    Add-PSSnapin Microsoft.SharePoint.PowerShell
}

$site = $null
$web = $null
try {
    $site = Get-SPSite -Identity $Url
    if ($Scope -eq 'Web') {
        $web = Get-SPWeb -Identity $Url
        $actions = $web.UserCustomActions
    } else {
        $actions = $site.UserCustomActions
    }

    $existing = @($actions | Where-Object { $_.Name -eq $actionName })
    if ($existing.Count -gt 1) {
        throw "Multiple actions named $actionName exist at scope $Scope. Resolve the duplicates before continuing."
    }
    if ($Operation -eq 'Remove') {
        if ($existing.Count -eq 0) {
            Write-Warning "No $actionName action exists at scope $Scope for $Url."
        } elseif ($PSCmdlet.ShouldProcess("$Url ($Scope)", 'Remove banner User Custom Action')) {
            $existing[0].Delete()
            Write-Output "Removed $actionName at scope $Scope."
        }
    } elseif ($PSCmdlet.ShouldProcess("$Url ($Scope)", 'Create or update banner User Custom Action')) {
        $action = if ($existing.Count -eq 1) { $existing[0] } else { $actions.Add() }
        $action.Name = $actionName
        $action.Title = 'Modern Banner'
        $action.Location = 'ClientSideExtension.ApplicationCustomizer'
        $action.ClientSideComponentId = $componentId
        $action.ClientSideComponentProperties = $PropertiesJson
        $action.Sequence = 100
        $action.Update()
        Write-Output "Configured $actionName at scope $Scope. Component: $componentId"
    }
} finally {
    if ($null -ne $web) { $web.Dispose() }
    if ($null -ne $site) { $site.Dispose() }
}

#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [Microsoft.SharePoint.Client.ClientContext] $Context,

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

if ($Scope -eq 'Web') {
    $actions = $Context.Web.UserCustomActions
} else {
    $actions = $Context.Site.UserCustomActions
}
$Context.Load($actions)
$Context.ExecuteQuery()

$existing = @($actions | Where-Object { $_.Name -eq $actionName })
if ($existing.Count -gt 1) {
    throw "Multiple actions named $actionName exist at scope $Scope. Resolve the duplicates before continuing."
}
if ($existing.Count -eq 1 -and
    ($existing[0].ClientSideComponentId -ne $componentId -or
     $existing[0].Location -ne 'ClientSideExtension.ApplicationCustomizer')) {
    throw "The action named $actionName belongs to another component or location. Resolve the name conflict before continuing."
}

if ($Operation -eq 'Remove') {
    if ($existing.Count -eq 0) {
        Write-Warning "No $actionName action exists at scope $Scope for $($Context.Url)."
    } elseif ($PSCmdlet.ShouldProcess("$($Context.Url) ($Scope)", 'Remove banner User Custom Action')) {
        $existing[0].DeleteObject()
        $Context.ExecuteQuery()
        Write-Output "Removed $actionName at scope $Scope."
    }
} elseif ($PSCmdlet.ShouldProcess("$($Context.Url) ($Scope)", 'Create or update banner User Custom Action')) {
    $action = if ($existing.Count -eq 1) { $existing[0] } else { $actions.Add() }
    $action.Name = $actionName
    $action.Title = 'Modern Banner'
    $action.Location = 'ClientSideExtension.ApplicationCustomizer'
    $action.ClientSideComponentId = $componentId
    $action.ClientSideComponentProperties = $PropertiesJson
    $action.Sequence = 100
    $action.Update()
    $Context.ExecuteQuery()
    Write-Output "Configured $actionName at scope $Scope. Component: $componentId"
}

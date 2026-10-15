#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# Isolated CSOM doubles: no farm, credentials, installed SDK, or PnP module required.
if ('Microsoft.SharePoint.Client.ClientContext' -as [type]) {
    throw 'Run this test in a fresh PowerShell process without real CSOM assemblies loaded.'
}
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
namespace Microsoft.SharePoint.Client {
    public class UserCustomAction {
        private readonly UserCustomActionCollection owner;
        public UserCustomAction(UserCustomActionCollection owner) { this.owner = owner; }
        public string Name { get; set; }
        public string Title { get; set; }
        public string Location { get; set; }
        public Guid ClientSideComponentId { get; set; }
        public string ClientSideComponentProperties { get; set; }
        public int Sequence { get; set; }
        public int Updates { get; private set; }
        public void Update() { Updates++; }
        public void DeleteObject() { owner.Remove(this); }
    }
    public class UserCustomActionCollection : List<UserCustomAction> {
        public UserCustomAction Add() {
            var action = new UserCustomAction(this);
            base.Add(action);
            return action;
        }
    }
    public class Scope {
        public UserCustomActionCollection UserCustomActions = new UserCustomActionCollection();
    }
    public class ClientContext {
        public Scope Web = new Scope();
        public Scope Site = new Scope();
        public string Url = "https://sharepoint/sites/Test";
        public int Queries;
        public bool FailQuery;
        public int FailOnQuery;
        public void Load(UserCustomActionCollection actions) {
            if (actions == null) throw new ArgumentNullException("actions");
        }
        public void ExecuteQuery() {
            if (FailQuery || Queries + 1 == FailOnQuery)
                throw new InvalidOperationException("Simulated CSOM failure");
            Queries++;
        }
    }
}
'@

$script = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\Set-BannerClientCustomAction.ps1'
function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}
function Assert-Throws([scriptblock] $Operation, [string] $MessagePattern) {
    $caught = $null
    try { & $Operation } catch { $caught = $_ }
    Assert-True ($null -ne $caught) 'Expected an error.'
    Assert-True ($caught.Exception.Message -like $MessagePattern) "Unexpected error: $caught"
}

foreach ($scope in @('Web', 'Site')) {
    $context = New-Object Microsoft.SharePoint.Client.ClientContext
    $actions = $context.$scope.UserCustomActions
    $otherScope = if ($scope -eq 'Web') { 'Site' } else { 'Web' }
    $arguments = @{ Context = $context; Scope = $scope; Operation = 'Set'; PropertiesJson = '{"bannerText":"First"}' }
    & $script @arguments -WhatIf
    Assert-True ($actions.Count -eq 0 -and $context.Queries -eq 1) 'WhatIf must read but not create.'
    & $script @arguments
    Assert-True ($actions.Count -eq 1) 'Set must create one action in an empty collection.'
    $action = $actions[0]
    Assert-True ($action.Name -eq 'ModernBanner.Laufschrift' -and $action.Title -eq 'Modern Banner') 'Unexpected action name/title.'
    Assert-True ($action.ClientSideComponentId -eq [Guid]'7dcf12d6-9e20-4554-aca6-2ce594f84bee') 'Unexpected component ID.'
    Assert-True ($action.Location -eq 'ClientSideExtension.ApplicationCustomizer' -and $action.Sequence -eq 100) 'Unexpected location/sequence.'
    Assert-True ($context.$otherScope.UserCustomActions.Count -eq 0) 'Set must not affect the other scope.'

    $arguments.PropertiesJson = '{"bannerText":"Updated","includedPageNames":["Home"]}'
    & $script @arguments -WhatIf
    Assert-True ($action.Updates -eq 1) 'WhatIf must not update.'
    & $script @arguments
    Assert-True ($actions.Count -eq 1 -and $action.Updates -eq 2) 'Set must update without duplication.'
    Assert-True ($action.ClientSideComponentProperties -eq $arguments.PropertiesJson) 'JSON must be preserved.'

    $unrelated = $actions.Add()
    $unrelated.Name = 'Another.Extension'
    & $script -Context $context -Scope $scope -Operation Remove -WhatIf
    Assert-True ($actions.Count -eq 2) 'WhatIf must not remove.'
    & $script -Context $context -Scope $scope -Operation Remove
    Assert-True ($actions.Count -eq 1 -and $actions[0].Name -eq 'Another.Extension') 'Remove must preserve unrelated actions.'
    $warnings = @()
    & $script -Context $context -Scope $scope -Operation Remove -WarningVariable warnings
    Assert-True ($warnings.Count -eq 1 -and $actions.Count -eq 1) 'Absent action must warn without removing anything.'
}

$context = New-Object Microsoft.SharePoint.Client.ClientContext
foreach ($json in @('', 'null', '[]', '"text"', '{}', '{"bannerText":42}', '{broken')) {
    Assert-Throws { & $script -Context $context -Scope Web -Operation Set -PropertiesJson $json } '*'
}
Assert-True ($context.Queries -eq 0) 'Invalid properties must fail before contacting SharePoint.'
& $script -Context $context -Scope Web -Operation Set -PropertiesJson '{"bannerText":""}'
Assert-True ($context.Web.UserCustomActions.Count -eq 1) 'Empty bannerText must be accepted for hiding.'

$context.Web.UserCustomActions[0].ClientSideComponentId = [Guid]::Empty
Assert-Throws { & $script -Context $context -Scope Web -Operation Remove } '*name conflict*'
Assert-True ($context.Web.UserCustomActions.Count -eq 1) 'Conflicting action must not be removed.'
$context.Web.UserCustomActions[0].ClientSideComponentId = [Guid]'7dcf12d6-9e20-4554-aca6-2ce594f84bee'
$context.Web.UserCustomActions[0].Location = 'Another.Location'
Assert-Throws { & $script -Context $context -Scope Web -Operation Set -PropertiesJson '{"bannerText":"Test"}' } '*name conflict*'
$context.Web.UserCustomActions[0].Location = 'ClientSideExtension.ApplicationCustomizer'
$duplicate = $context.Web.UserCustomActions.Add()
$duplicate.Name = 'ModernBanner.Laufschrift'
Assert-Throws { & $script -Context $context -Scope Web -Operation Remove } '*Multiple actions*'
Assert-True ($context.Web.UserCustomActions.Count -eq 2) 'Duplicate actions must not be removed.'

$context = New-Object Microsoft.SharePoint.Client.ClientContext
$context.FailQuery = $true
Assert-Throws { & $script -Context $context -Scope Site -Operation Set -PropertiesJson '{"bannerText":"Test"}' } '*Simulated CSOM failure*'
$context = New-Object Microsoft.SharePoint.Client.ClientContext
$context.FailOnQuery = 2
Assert-Throws { & $script -Context $context -Scope Web -Operation Set -PropertiesJson '{"bannerText":"Test"}' } '*Simulated CSOM failure*'
Write-Output 'CSOM helper verified: both scopes, create/update/remove, WhatIf, validation, conflicts, unrelated actions, and query failures.'

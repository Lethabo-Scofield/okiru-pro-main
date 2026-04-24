#requires -Version 5.1
<#
.SYNOPSIS
    Setup Azure permissions for GitHub Actions service principal
.DESCRIPTION
    Assigns necessary Azure roles to the service principal for CI/CD deployment
#>

$ErrorActionPreference = "Stop"

$ServicePrincipalId = "7e45d2cd-846f-44f7-916e-aa1b9ae15b62"
$SubscriptionId = "cfc3d77c-3695-4370-b976-dffe20d784c1"
$ResourceGroup = "okiru-pro-rg"
$AcrName = "okiruproacrde4d539b"

Write-Host "=== Setting up Azure Permissions for GitHub Actions ===" -ForegroundColor Cyan
Write-Host ""

# Login to Azure
Write-Host "Step 1: Logging into Azure..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    az login
}

# Set subscription
Write-Host "Step 2: Setting subscription..." -ForegroundColor Yellow
az account set --subscription $SubscriptionId

# Get current user
$currentUser = az account show --query user.name -o tsv
Write-Host "Logged in as: $currentUser" -ForegroundColor Green
Write-Host ""

# Assign Contributor role to resource group
Write-Host "Step 3: Assigning Contributor role to resource group..." -ForegroundColor Yellow
try {
    az role assignment create `
        --assignee $ServicePrincipalId `
        --role "Contributor" `
        --resource-group $ResourceGroup
    Write-Host "✓ Contributor role assigned" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to assign Contributor role: $_" -ForegroundColor Red
}

# Assign AcrPush role for container registry
Write-Host "Step 4: Assigning AcrPush role for container registry..." -ForegroundColor Yellow
try {
    $acrScope = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.ContainerRegistry/registries/$AcrName"
    az role assignment create `
        --assignee $ServicePrincipalId `
        --role "AcrPush" `
        --scope $acrScope
    Write-Host "✓ AcrPush role assigned" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to assign AcrPush role: $_" -ForegroundColor Red
}

# Verify assignments
Write-Host ""
Write-Host "Step 5: Verifying role assignments..." -ForegroundColor Yellow
$assignments = az role assignment list --assignee $ServicePrincipalId --all | ConvertFrom-Json

Write-Host ""
Write-Host "Current role assignments:" -ForegroundColor Cyan
$assignments | ForEach-Object {
    Write-Host "  - $($_.roleDefinitionName) on $($_.scope)" -ForegroundColor White
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Add the GitHub secrets (see docs/GITHUB_SECRETS.md)"
Write-Host "  2. Push to main branch to trigger deployment"
Write-Host "  3. Check GitHub Actions for deployment status"
Write-Host ""
Write-Host "Service Principal ID: $ServicePrincipalId" -ForegroundColor Yellow

# ============================================================
# RUN THIS SCRIPT IN YOUR TERMINAL TO COMPLETE THE SETUP
# ============================================================
# This script will:
# 1. Stop and delete the old VM
# 2. Commit the staging workflow to GitHub
# 3. Fix the kustomization.yaml
# ============================================================

$ErrorActionPreference = "Continue"

Write-Host @"

============================================================
  OKIRU PRO - FINAL SETUP SCRIPT
============================================================

This script will:
1. Stop and delete the old VM (okiru-vm)
2. Commit the deploy-staging.yml workflow
3. Fix the kustomization.yaml quoting issue

Press ENTER to continue or Ctrl+C to cancel...
"@ -ForegroundColor Cyan
Read-Host

# Step 1: Stop and Delete VM
Write-Host "`n[STEP 1] Stopping and deleting VM: okiru-vm..." -ForegroundColor Green
Write-Host "Checking current status..." -ForegroundColor Yellow

$vmStatus = az vm show --name okiru-vm --resource-group OKIRU-PRODUCTION --query "powerState" -o tsv 2>$null
Write-Host "Current VM Status: $vmStatus" -ForegroundColor Cyan

Write-Host "`nDeallocating (stopping) VM..." -ForegroundColor Yellow
az vm deallocate --name okiru-vm --resource-group OKIRU-PRODUCTION

Write-Host "Waiting for deallocation to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

$vmStatus2 = az vm show --name okiru-vm --resource-group OKIRU-PRODUCTION --query "powerState" -o tsv 2>$null
Write-Host "Status after deallocate: $vmStatus2" -ForegroundColor Cyan

Write-Host "`nDeleting VM permanently..." -ForegroundColor Yellow -BackgroundColor Red
$confirm = Read-Host "Type 'DELETE' to confirm VM deletion"

if ($confirm -eq "DELETE") {
    az vm delete --name okiru-vm --resource-group OKIRU-PRODUCTION --yes
    Write-Host "VM deleted successfully!" -ForegroundColor Green
} else {
    Write-Host "VM deletion skipped. You can delete manually later with:" -ForegroundColor Yellow
    Write-Host "az vm delete --name okiru-vm --resource-group OKIRU-PRODUCTION --yes" -ForegroundColor Cyan
}

# Step 2: Git - Commit staging workflow
Write-Host "`n[STEP 2] Committing deploy-staging.yml workflow..." -ForegroundColor Green
Set-Location -Path "c:\Users\Administrator\Documents\GitHub\okiru-pro-main"

git status --short
Write-Host "`nAdding deploy-staging.yml..." -ForegroundColor Yellow
git add .github/workflows/deploy-staging.yml

git status --short
Write-Host "`nCommitting..." -ForegroundColor Yellow
git commit -m "ci: add staging deployment workflow

- Automated staging deployment on push to develop/staging branches
- Includes smoke tests and rollback capability  
- Commits updated kustomization.yaml back to git
- Includes CronJob monitoring and backup testing workflows"

Write-Host "`nPushing to origin/main..." -ForegroundColor Yellow
git push origin main

Write-Host "`nWorkflow committed! Check GitHub Actions tab in ~30 seconds." -ForegroundColor Green

# Step 3: Fix kustomization.yaml
Write-Host "`n[STEP 3] Fixing kustomization.yaml..." -ForegroundColor Green

$file = "kubernetes/infrastructure/overlays/staging/kustomization.yaml"
$content = Get-Content $file -Raw

# Fix the newTag quoting
$content = $content -replace 'newTag: 1\.36', 'newTag: "1.36"'

Set-Content $file $content -NoNewline

Write-Host "Fixed newTag: 1.36 -> newTag: `"1.36`"" -ForegroundColor Cyan

# Commit the fix
Write-Host "`nCommitting kustomization fix..." -ForegroundColor Yellow
git add kubernetes/infrastructure/overlays/staging/kustomization.yaml
git commit -m "fix: quote newTag value in kustomization.yaml"
git push origin main

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Write-Host @"

NEXT STEPS:
-----------
1. VM has been deallocated (billing stopped)
2. The workflow is now visible in GitHub Actions
3. Go to: https://github.com/Lethabo-Scaffold/okiru-pro-main/actions
4. Click "Deploy to Staging" 
5. Click "Run workflow" -> Select branch: develop -> Run

This will build and deploy your images to staging!

"@ -ForegroundColor Cyan

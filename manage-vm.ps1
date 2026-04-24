# Azure VM Management Script
$ErrorActionPreference = "Stop"

Write-Host "=== Azure VM Management ===" -ForegroundColor Cyan
Write-Host "VM: okiru-vm in Resource Group: OKIRU-PRODUCTION" -ForegroundColor Yellow

# Check current status
Write-Host "`n1. Checking current VM status..." -ForegroundColor Green
try {
    $powerState = az vm show --name okiru-vm --resource-group OKIRU-PRODUCTION --query "powerState" -o tsv
    Write-Host "Current Power State: $powerState" -ForegroundColor Cyan
} catch {
    Write-Host "Could not retrieve power state" -ForegroundColor Red
}

# Deallocate (stop) the VM
Write-Host "`n2. Deallocating (stopping) VM to stop billing..." -ForegroundColor Green
az vm deallocate --name okiru-vm --resource-group OKIRU-PRODUCTION
Write-Host "Deallocate command executed" -ForegroundColor Cyan

# Wait and check status
Write-Host "`n3. Waiting for deallocation to complete..." -ForegroundColor Green
Start-Sleep -Seconds 30

$status = az vm show --name okiru-vm --resource-group OKIRU-PRODUCTION --query "powerState" -o tsv
Write-Host "Power state after deallocate: $status" -ForegroundColor Cyan

# Delete the VM
Write-Host "`n4. Deleting VM..." -ForegroundColor Green
$confirmation = Read-Host "Type 'yes' to confirm deletion"
if ($confirmation -eq 'yes') {
    az vm delete --name okiru-vm --resource-group OKIRU-PRODUCTION --yes
    Write-Host "Delete command executed" -ForegroundColor Cyan
} else {
    Write-Host "Deletion cancelled" -ForegroundColor Yellow
}

# Final verification
Write-Host "`n5. Verifying VM list..." -ForegroundColor Green
az vm list --output table

Write-Host "`nDone!" -ForegroundColor Green

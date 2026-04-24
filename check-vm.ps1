# Check for okiru-vm
Write-Host "=== Checking for VMs ===" -ForegroundColor Green
$vms = az vm list --output table 2>&1
Write-Host $vms

Write-Host "=== Checking for okiru-vm specifically ===" -ForegroundColor Green
az vm show --name okiru-vm --resource-group okiru-pro-rg --output table 2>&1

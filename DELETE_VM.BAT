@echo off
echo ============================================================
echo STOPPING AND DELETING AZURE VM: okiru-vm
echo ============================================================
echo.
echo VM: okiru-vm
echo Resource Group: OKIRU-PRODUCTION
echo Location: southafricanorth
echo.
echo [1] Checking VM status...
az vm show --name okiru-vm --resource-group OKIRU-PRODUCTION --query "{Name:name, Power:powerState, Size:hardwareProfile.vmSize, OS:storageProfile.osDisk.osType}" -o table

echo.
echo [2] DEALLOCATING (Stopping) VM to stop billing...
az vm deallocate --name okiru-vm --resource-group OKIRU-PRODUCTION

echo.
echo [3] Waiting 30 seconds for deallocation...
timeout /t 30 /nobreak > nul

echo [4] Checking status after deallocate...
az vm show --name okiru-vm --resource-group OKIRU-PRODUCTION --query "{Name:name, Power:powerState}" -o table

echo.
echo [5] Ready to DELETE VM permanently
echo This action CANNOT be undone!
echo.
set /p confirm="Type DELETE in all caps to confirm: "
if /I "%confirm%"=="DELETE" (
    echo.
    echo Deleting VM...
    az vm delete --name okiru-vm --resource-group OKIRU-PRODUCTION --yes
    echo.
    echo VM deleted!
) else (
    echo.
    echo Deletion cancelled. To delete later, run:
    echo az vm delete --name okiru-vm --resource-group OKIRU-PRODUCTION --yes
)

echo.
echo [6] Final VM list in resource group:
az vm list --resource-group OKIRU-PRODUCTION -o table 2^>nul
if errorlevel 1 (
    echo No VMs found in OKIRU-PRODUCTION - VM successfully deleted!
)

echo.
echo ============================================================
echo VM CLEANUP COMPLETE
echo ============================================================
pause

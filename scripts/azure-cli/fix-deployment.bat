@echo off
REM Quick fix script for broken deployments (MIME type errors, blank screen)
REM This runs the full cleanup, rebuild, and deploy pipeline

echo ==========================================
echo   OKIRU PRO - FIX DEPLOYMENT
echo ==========================================
echo.
echo This script will:
echo   1. Clean up old/broken images from ACR
echo   2. Rebuild all Docker images
echo   3. Deploy to AKS
echo   4. Run smoke tests
echo.
echo Press Ctrl+C to cancel, or
echo.
pause

echo.
echo Running full pipeline...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dpn0\..\00-full-cleanup-rebuild-deploy.ps1'"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ==========================================
    echo   DEPLOYMENT FAILED
echo ==========================================
    echo Check the error messages above.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   DEPLOYMENT COMPLETE
echo ==========================================
echo.
pause

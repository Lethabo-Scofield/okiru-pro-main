@echo off
cd /d C:\Users\Administrator\Documents\GitHub\okiru-pro-main
echo === Creating and pushing develop branch ===

echo [1] Fetching from origin...
git fetch origin

echo [2] Checking out main...
git checkout main

echo [3] Creating develop branch from main...
git branch develop

echo [4] Checking out develop...
git checkout develop

echo [5] Pushing develop to origin...
git push -u origin develop

echo [6] Verifying branches...
git branch -vv

echo === Done ===
pause

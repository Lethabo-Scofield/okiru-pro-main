@echo off
echo ============================================================
echo COMMITTING STAGING WORKFLOW AND FIXES
echo ============================================================
cd /d C:\Users\Administrator\Documents\GitHub\okiru-pro-main

echo.
echo [1] Checking git status...
git status --short

echo.
echo [2] Adding workflow files...
git add .github/workflows/deploy-staging.yml
git add .github/workflows/cronjob-monitoring.yml
git add .github/workflows/test-backup-restore.yml

echo.
echo [3] Adding kustomization fix...
git add kubernetes/infrastructure/overlays/staging/kustomization.yaml

echo.
echo [4] Committing...
git commit -m "ci: add staging deployment workflow and fixes

- Add deploy-staging.yml for automated staging deployments
- Add cronjob-monitoring.yml for backup monitoring
- Add test-backup-restore.yml for monthly backup testing
- Fix newTag quoting in kustomization.yaml
- Includes smoke tests, rollback, and git commit of image tags"

echo.
echo [5] Pushing to main...
git push origin main

echo.
echo ============================================================
echo DONE! Check GitHub Actions tab in ~30 seconds.
echo ============================================================
echo.
echo Next steps:
echo 1. Go to https://github.com/Lethabo-Scaffold/okiru-pro-main/actions
echo 2. Click "Deploy to Staging"
echo 3. Click "Run workflow" -^> Select branch: develop -^> Run
echo.
pause

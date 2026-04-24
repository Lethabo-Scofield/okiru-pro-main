# PowerShell script to trigger Production Deployment workflow
# Run this from your local terminal

param(
    [string]$Branch = "main"
)

$owner = "Lethabo-Scofield"  # Updated based on git remote
$repo = "okiru-pro-main"

Write-Host "Triggering Production Deployment..." -ForegroundColor Cyan
Write-Host "Repository: $owner/$repo" -ForegroundColor Cyan
Write-Host "Branch: $Branch" -ForegroundColor Cyan

# Check if gh CLI is authenticated
try {
    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "GitHub CLI not authenticated. Running gh auth login..." -ForegroundColor Yellow
        gh auth login
    }
} catch {
    Write-Host "GitHub CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "https://cli.github.com/" -ForegroundColor Cyan
    exit 1
}

# List available workflows
Write-Host "`nAvailable workflows:" -ForegroundColor Yellow
gh workflow list --repo "$owner/$repo"

# Trigger the deploy-prod workflow
Write-Host "`nTriggering deploy-prod workflow..." -ForegroundColor Cyan
try {
    $result = gh workflow run deploy-prod.yml --repo "$owner/$repo" --ref $Branch 2>&1
    Write-Host "Workflow triggered successfully!" -ForegroundColor Green
    Write-Host $result -ForegroundColor Gray
} catch {
    Write-Host "Error triggering workflow: $_" -ForegroundColor Red
    exit 1
}

# Wait a moment for the run to be created
Write-Host "`nWaiting for workflow run to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Get the latest run
$latestRun = gh run list --repo "$owner/$repo" --workflow="deploy-prod.yml" --limit 1 --json databaseId,status,conclusion,url | ConvertFrom-Json

if ($latestRun) {
    $runId = $latestRun[0].databaseId
    $runUrl = $latestRun[0].url

    Write-Host "`nLatest run ID: $runId" -ForegroundColor Cyan
    Write-Host "Run URL: $runUrl" -ForegroundColor Cyan

    # Watch the run
    Write-Host "`nMonitoring workflow run (press Ctrl+C to stop)..." -ForegroundColor Yellow
    gh run watch $runId --repo "$owner/$repo"
} else {
    Write-Host "`nNo runs found. Check GitHub Actions page manually:" -ForegroundColor Yellow
    Write-Host "https://github.com/$owner/$repo/actions" -ForegroundColor Cyan
}

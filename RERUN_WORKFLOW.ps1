# PowerShell script to re-run GitHub Actions workflow
# Requires GitHub personal access token with repo scope

param(
    [Parameter(Mandatory=$true)]
    [string]$GithubToken
)

$owner = "Siphochippy"
$repo = "okiru-pro-main"

Write-Host "Fetching latest workflow runs..." -ForegroundColor Cyan

# Get latest workflow runs
$headers = @{
    "Authorization" = "token $GithubToken"
    "Accept" = "application/vnd.github.v3+json"
}

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs?per_page=5" -Headers $headers -Method GET

    Write-Host "`nLatest workflow runs:" -ForegroundColor Yellow
    foreach ($run in $response.workflow_runs | Select-Object -First 5) {
        $statusColor = if ($run.status -eq "completed") { 
            if ($run.conclusion -eq "success") { "Green" } else { "Red" }
        } else { "Yellow" }
        Write-Host "$($run.id): $($run.name) - Status: $($run.status), Conclusion: $($run.conclusion)" -ForegroundColor $statusColor
    }

    # Find the latest failed "Deploy to Staging" run
    $failedRun = $response.workflow_runs | Where-Object { 
        $_.name -eq "Deploy to Staging" -and $_.conclusion -eq "failure" 
    } | Select-Object -First 1

    if ($failedRun) {
        Write-Host "`nFound failed run: $($failedRun.id)" -ForegroundColor Red
        Write-Host "Re-running failed jobs..." -ForegroundColor Cyan

        # Re-run failed jobs
        $rerunResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs/$($failedRun.id)/rerun-failed-jobs" -Headers $headers -Method POST

        Write-Host "`n✅ Re-run triggered successfully!" -ForegroundColor Green
        Write-Host "Check the workflow at: $($failedRun.html_url)" -ForegroundColor Cyan

        # Monitor the new run
        Write-Host "`nMonitoring for new run..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5

        # Get the latest run again (should be the new one)
        $newResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs?per_page=1" -Headers $headers -Method GET
        $newRun = $newResponse.workflow_runs[0]

        Write-Host "`nNew run ID: $($newRun.id)" -ForegroundColor Cyan
        Write-Host "Status: $($newRun.status)" -ForegroundColor Yellow
        Write-Host "URL: $($newRun.html_url)" -ForegroundColor Cyan

        # Poll for status
        Write-Host "`nPolling run status (press Ctrl+C to stop)..." -ForegroundColor Yellow
        while ($true) {
            Start-Sleep -Seconds 10
            $statusResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/actions/runs/$($newRun.id)" -Headers $headers -Method GET

            $statusColor = if ($statusResponse.status -eq "completed") {
                if ($statusResponse.conclusion -eq "success") { "Green" } else { "Red" }
            } else { "Yellow" }

            Write-Host "$(Get-Date -Format 'HH:mm:ss') - Status: $($statusResponse.status), Conclusion: $($statusResponse.conclusion)" -ForegroundColor $statusColor

            if ($statusResponse.status -eq "completed") {
                Write-Host "`nWorkflow completed with conclusion: $($statusResponse.conclusion)" -ForegroundColor $(if($statusResponse.conclusion -eq "success"){"Green"}else{"Red"})
                break
            }
        }
    } else {
        Write-Host "`nNo failed 'Deploy to Staging' runs found." -ForegroundColor Yellow

        # Check for any recent Deploy to Staging runs
        $stagingRun = $response.workflow_runs | Where-Object { $_.name -eq "Deploy to Staging" } | Select-Object -First 1
        if ($stagingRun) {
            Write-Host "Latest 'Deploy to Staging' run: $($stagingRun.id) - $($stagingRun.status) / $($stagingRun.conclusion)" -ForegroundColor Cyan
            Write-Host "URL: $($stagingRun.html_url)" -ForegroundColor Cyan
        }
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Make sure your GitHub token has 'repo' scope permissions." -ForegroundColor Yellow
}

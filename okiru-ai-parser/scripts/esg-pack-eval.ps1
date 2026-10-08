# Run an evidence pack through the parser for an answer-key gate.
#
#   .\scripts\esg-pack-eval.ps1 -Pack "..\docs\Super Group Upload Pack" [-Mode auto|replay|record]
#   .\scripts\esg-pack-eval.ps1 -Domain bbbee -Pack "C:\...\Okiru Upload Pack" [-Mode auto|replay|record] [-Out <dir>]
#
# -Domain esg (the default) runs the ESG case extraction, exactly as before.
# -Domain bbbee runs the deterministic case parser AND the model extraction, as
# /resolve-case-files does (scripts/pack-eval.ts).
#
# Model and OCR credentials are read from the cluster secret straight into this
# process's environment: never printed, never written to disk. Replay mode needs
# none of them. Deliberately NOT set: AZURE_STORAGE_CONNECTION_STRING (no writes
# to production blob storage), REDIS_URL and NEO4J_* (local fallbacks).
param(
  [Parameter(Mandatory = $true)][string]$Pack,
  [ValidateSet("auto", "replay", "record")][string]$Mode = "auto",
  [ValidateSet("esg", "bbbee")][string]$Domain = "esg",
  [string]$Out = ""
)
$ErrorActionPreference = "Stop"

if ($Mode -ne "replay") {
  $k = "$env:USERPROFILE\.azure-kubectl\kubectl.exe"
  function Get-SecretValue([string]$key) {
    $b64 = & $k --context okiru-pro-aks -n okiru-pro get secret external-api-keys -o "jsonpath={.data.$key}"
    if (-not $b64) { return "" }
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
  }
  foreach ($key in @(
    "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_FAST_DEPLOYMENT",
    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_KEY"
  )) {
    Set-Item -Path "env:$key" -Value (Get-SecretValue $key)
  }
  Write-Output "credentials loaded: $([bool]$env:AZURE_OPENAI_API_KEY)"
}
$env:AZURE_MODEL_DEPLOYMENT = "gpt-4o"
# A caller may lower it (the model quota is shared with production).
if (-not $env:PARSER_DOCUMENT_CONCURRENCY) { $env:PARSER_DOCUMENT_CONCURRENCY = "6" }
$env:NODE_ENV = "development"
$env:LOG_LEVEL = "warn"
# (-Domain bbbee turns the template-decision and extraction caches off itself,
# in scripts/pack-eval.ts, so a replay asks exactly the recorded prompts.)

$script = if ($Domain -eq "esg") { "scripts/esg-pack-eval.ts" } else { "scripts/pack-eval.ts" }
$tsxArgs = @("tsx", $script, "--domain", $Domain, "--pack", $Pack, "--mode", $Mode)
if ($Out) { $tsxArgs += @("--out", $Out) }
Push-Location (Split-Path $PSScriptRoot -Parent)
# PDF readers write font warnings to stderr; Windows PowerShell turns any stderr
# line from a native command into an error, which "Stop" would make fatal.
$ErrorActionPreference = "Continue"
try {
  npx @tsxArgs 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { throw "pack evaluation failed (exit $LASTEXITCODE)" }
} finally { Pop-Location }

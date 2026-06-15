# Render high-value toolkit sheets to PDF via Excel COM (proven recipe).
$ErrorActionPreference = 'Continue'
$root = "C:\Users\Administrator\Documents\GitHub\okiru-pro-main\docs\toolkits"
$outRoot = Join-Path $root "screenshots"

$common = @(
  'Summary Scorecard','Ownership Scorecard','MC Scorecard','MC Scorecard (Exco + Senior)',
  'MC Toolkit','Skills Scorecard','Skills Toolkit','Procurement Scorecard','ESD Scorecard',
  'SED Scorecard','YES','Industry Norms','EAP','Client Information','Risks & Points of Clarification',
  'Scorecard Calculations'
)
$fscSheets = @(
  'Summary Scorecard','Ownership Scorecard','MC Scorecard','MC Toolkit','Skills Scorecard','Skills Toolkit',
  'Procurement Scorecard','ESD Scorecard','EF & ESD Scorecard - Banks','EF & ESD Scorecard - Long Term',
  'SED & CE Scorecard','AFS Scorecard - Banks','YES','Industry Norms','EAP','Client Information',
  'Risks & Points of Clarification','Scoring Scale','Scorecard Calculations'
)

$jobs = @(
  @{ file='BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx';        folder='rcogp';    sheets=$common },
  @{ file='BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx';    folder='rcogp_qse'; sheets=$common },
  @{ file='BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx'; folder='agri';     sheets=$common },
  @{ file='BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx';  folder='ict';      sheets=$common },
  @{ file='BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx';      folder='ict_qse';  sheets=$common },
  @{ file='BBBEE Toolkit (FSC) Template v1.0.xlsx';           folder='fsc';      sheets=$fscSheets }
)

function Sanitize($name) { return ($name -replace '[\\/:*?"<>|]', '_') }

foreach ($job in $jobs) {
  $wbPath = Join-Path $root $job.file
  $outDir = Join-Path $outRoot $job.folder
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

  Write-Host "=== Opening $($job.file) ==="
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false; $excel.DisplayAlerts = $false
  try {
    $wb = $excel.Workbooks.Open($wbPath, 0, $true)
    foreach ($sheet in $job.sheets) {
      try {
        $ws = $wb.Worksheets.Item($sheet)
      } catch { Write-Host "  SKIP (missing): $sheet"; continue }
      try {
        $ws.PageSetup.Zoom = $false
        $ws.PageSetup.FitToPagesWide = 1
        $ws.PageSetup.FitToPagesTall = $false
        $pdf = Join-Path $outDir ((Sanitize $sheet) + '.pdf')
        $ws.ExportAsFixedFormat(0, $pdf)
        Write-Host "  OK: $sheet -> $pdf"
      } catch { Write-Host "  ERROR exporting $sheet : $_" }
    }
    $wb.Close($false)
  } catch {
    Write-Host "  FATAL opening workbook: $_"
  } finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()
  }
  Write-Host "=== Done $($job.folder) ==="
}
Write-Host "ALL DONE"

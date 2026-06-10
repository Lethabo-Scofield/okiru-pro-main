$xlsxPath = "c:\Users\Administrator\Documents\GitHub\okiru-pro-main\docs\toolkits\BBBEE Toolkit (FSC) Template v1.0.xlsx"
$outDir = "c:\Users\Administrator\Documents\GitHub\okiru-pro-main\docs\toolkits\screenshots\fsc"

$sheets = @(
  "EF & ESD Scorecard - Banks",
  "EF & ESD Scorecard - Long Term",
  "AFS Scorecard - Banks",
  "AFS Scorecard - Long Term",
  "AFS Scorecard - Short Term",
  "AFS Definitions - Banks",
  "SED & CE Scorecard",
  "Scoring Scale",
  "Client Information",
  "Financials"
)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($xlsxPath, 0, $true)

foreach ($sheetName in $sheets) {
  try {
    $ws = $wb.Worksheets.Item($sheetName)
    $ws.PageSetup.Zoom = $false
    $ws.PageSetup.FitToPagesWide = 1
    $ws.PageSetup.FitToPagesTall = $false
    $safeName = $sheetName -replace '[\\/:*?"<>|]', '_'
    $outPath = Join-Path $outDir "$safeName.pdf"
    $ws.ExportAsFixedFormat(0, $outPath)
    Write-Host "OK: $sheetName -> $outPath"
  } catch {
    Write-Host "FAIL: $sheetName - $_"
  }
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
Write-Host "Done"

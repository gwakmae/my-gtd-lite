# GTD Board Build Script
$htmlFile = "index.html"
$cssFiles = @(
    "css/variables.css",
    "css/base.css",
    "css/layout.css",
    "css/header.css",
    "css/components.css",
    "css/board.css",
    "css/modal.css",
    "css/dragdrop.css",
    "css/sidebar.css",
    "css/responsive.css",
    "css/animations.css"
)
$jsFiles = @(
    "js/enums.js",
    "js/models.js",
    "js/dataService.js",
    "js/undoService.js",
    "js/toast.js",
    "js/taskNode.js",
    "js/taskModal.js",
    "js/bulkEdit.js",
    "js/dragDrop.js",
    "js/boardView.js",
    "js/listView.js",
    "js/app.js"
)
$dataFiles = @{
    "embedded-sample" = "data/sample.json"
}
$outFile = "MyGtdApp.html"

Write-Host "Building GTD Board..." -ForegroundColor Cyan

$html = Get-Content $htmlFile -Raw -Encoding UTF8

# Combine CSS
$allCss = ""
foreach ($f in $cssFiles) {
    if (Test-Path $f) {
        Write-Host "  CSS: $f" -ForegroundColor Gray
        $allCss += (Get-Content $f -Raw -Encoding UTF8) + "`n"
    } else {
        Write-Host "  MISSING: $f" -ForegroundColor Red
    }
}

# Replace all <link rel="stylesheet" href="css/..."> with combined <style>
# Also keep the CDN link for Bootstrap Icons
$html = $html -replace '(?s)\s*<link\s+rel="stylesheet"\s+href="css/[^"]*"\s*/?\s*>\s*', ''
$styleTag = "<style>`n$allCss</style>"
$html = $html -replace '(</title>)', "`$1`n    $styleTag"

# Embed data files
$embedBlock = ""
foreach ($entry in $dataFiles.GetEnumerator()) {
    if (Test-Path $entry.Value) {
        Write-Host "  DATA: $($entry.Value)" -ForegroundColor Gray
        $content = (Get-Content $entry.Value -Raw -Encoding UTF8).Trim()
        $embedBlock += "    <script id=`"$($entry.Key)`" type=`"application/json`">`n$content`n    </script>`n"
    }
}

# Combine JS
$allJs = ""
foreach ($f in $jsFiles) {
    if (Test-Path $f) {
        Write-Host "  JS:  $f" -ForegroundColor Gray
        $allJs += "// === $f ===`n" + (Get-Content $f -Raw -Encoding UTF8) + "`n`n"
    } else {
        Write-Host "  MISSING: $f" -ForegroundColor Red
    }
}

# Replace all <script src="js/..."> with combined block
$html = $html -replace '(?s)\s*<script\s+src="js/[^"]*"></script>\s*', ''

# Insert embedded data + combined JS before </body>
$insertBlock = "$embedBlock    <script>`n$allJs    </script>"
$html = $html -replace '</body>', "$insertBlock`n</body>"

Set-Content -Path $outFile -Value $html -Encoding UTF8

$size = (Get-Item $outFile).Length
$cssCount = $cssFiles.Count
$jsCount = $jsFiles.Count
$dataCount = $dataFiles.Count

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host " Output: $outFile" -ForegroundColor White
Write-Host " Size:   $([math]::Round($size/1024, 1)) KB" -ForegroundColor White
Write-Host " CSS:    $cssCount files merged" -ForegroundColor White
Write-Host " JS:     $jsCount files merged" -ForegroundColor White
Write-Host " Data:   $dataCount files embedded" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
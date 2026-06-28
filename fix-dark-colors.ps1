$baseDir = "C:\Users\HP\3D Objects\BERAMETHODE 1"

$directories = @(
    "$baseDir\components",
    "$baseDir\app"
)
if (Test-Path "$baseDir\src\components") {
    $directories += "$baseDir\src\components"
}

# Patterns: [original, darkVariant]
$textPatterns = @(
    @('text-emerald-600', 'dark:text-emerald-400'),
    @('text-red-600', 'dark:text-red-400'),
    @('text-amber-600', 'dark:text-amber-400'),
    @('text-green-600', 'dark:text-green-400'),
    @('text-blue-600', 'dark:text-blue-400'),
    @('text-indigo-600', 'dark:text-indigo-400'),
    @('text-rose-600', 'dark:text-rose-400'),
    @('text-orange-600', 'dark:text-orange-400'),
    @('text-sky-600', 'dark:text-sky-400'),
    @('text-yellow-600', 'dark:text-yellow-400'),
    @('text-pink-600', 'dark:text-pink-400'),
    @('text-purple-600', 'dark:text-purple-400'),
    @('text-teal-600', 'dark:text-teal-400'),
    @('text-cyan-600', 'dark:text-cyan-400'),
    @('text-lime-600', 'dark:text-lime-400')
)

$bgPatterns = @(
    @('bg-emerald-50', 'dark:bg-emerald-900/30'),
    @('bg-red-50', 'dark:bg-red-900/30'),
    @('bg-amber-50', 'dark:bg-amber-900/30'),
    @('bg-green-50', 'dark:bg-green-900/30'),
    @('bg-blue-50', 'dark:bg-blue-900/30'),
    @('bg-indigo-50', 'dark:bg-indigo-900/30'),
    @('bg-rose-50', 'dark:bg-rose-900/30'),
    @('bg-orange-50', 'dark:bg-orange-900/30'),
    @('bg-sky-50', 'dark:bg-sky-900/30'),
    @('bg-yellow-50', 'dark:bg-yellow-900/30'),
    @('bg-pink-50', 'dark:bg-pink-900/30'),
    @('bg-purple-50', 'dark:bg-purple-900/30'),
    @('bg-teal-50', 'dark:bg-teal-900/30'),
    @('bg-cyan-50', 'dark:bg-cyan-900/30'),
    @('bg-lime-50', 'dark:bg-lime-900/30'),
    @('bg-gray-50', 'dark:bg-dk-bg'),
    @('bg-slate-50', 'dark:bg-dk-bg')
)

$allPatterns = $textPatterns + $bgPatterns
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

# Gather all files
$allFiles = @()
foreach ($dir in $directories) {
    $allFiles += Get-ChildItem -Path $dir -Filter "*.tsx" -Recurse | Select-Object -ExpandProperty FullName
}

$fileResults = @{}
$totalTextChanges = 0
$totalBgChanges = 0
$processedCount = 0

foreach ($file in $allFiles) {
    try {
        $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
        if ([string]::IsNullOrEmpty($content)) { continue }
        
        $originalContent = $content
        $fileTextChanges = 0
        $fileBgChanges = 0
        
        foreach ($p in $allPatterns) {
            $original = $p[0]
            $dark = $p[1]
            
            $escapedOriginal = [regex]::Escape($original)
            if ($content -notmatch $escapedOriginal) { continue }
            
            $beforeCount = ([regex]::Matches($content, [regex]::Escape($dark))).Count
            
            # Build safe pattern: avoid variant prefixes (hover:, dark:, etc.) and substring matches
            $safeOriginal = '(?<![a-zA-Z:])' + $escapedOriginal + '(?![\w-])'
            
            $marker = "___DM_$([System.Guid]::NewGuid().ToString('N').Substring(0,8))___"
            
            # Step 1: Protect existing "original dark" pairs
            $pairPattern = $safeOriginal + '\s+' + [regex]::Escape($dark)
            $content = $content -replace $pairPattern, $marker
            
            # Step 2: Add dark variant to remaining (unpaired) occurrences
            $content = $content -replace $safeOriginal, "$original $dark"
            
            # Step 3: Restore markers
            $content = $content -replace [regex]::Escape($marker), "$original $dark"
            
            $afterCount = ([regex]::Matches($content, [regex]::Escape($dark))).Count
            $added = $afterCount - $beforeCount
            
            if ($original.StartsWith('text-')) {
                $fileTextChanges += $added
            } else {
                $fileBgChanges += $added
            }
        }
        
        if ($content -ne $originalContent) {
            [System.IO.File]::WriteAllText($file, $content, $utf8NoBom)
            $totalTextChanges += $fileTextChanges
            $totalBgChanges += $fileBgChanges
            
            $relPath = $file.Substring($baseDir.Length + 1)
            if ($fileTextChanges -gt 0 -or $fileBgChanges -gt 0) {
                $fileResults[$relPath] = @{text=$fileTextChanges; bg=$fileBgChanges}
            }
        }
    } catch {
        Write-Host "  ERROR: $file : $_" -ForegroundColor Red
    }
    $processedCount++
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "FINAL SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Files scanned: $processedCount"
Write-Host "Files modified: $($fileResults.Count)"
Write-Host "Total text changes (dark:text-* added): $totalTextChanges"
Write-Host "Total bg changes (dark:bg-* added): $totalBgChanges"
Write-Host "Total changes: $($totalTextChanges + $totalBgChanges)"
Write-Host "`nBreakdown by file:" -ForegroundColor Yellow
$sorted = $fileResults.Keys | Sort-Object
foreach ($key in $sorted) {
    $val = $fileResults[$key]
    Write-Host "  $key : $($val.text) text + $($val.bg) bg = $($val.text + $val.bg) total"
}

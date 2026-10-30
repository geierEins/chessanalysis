<#
  Generates the app icon (a simple white pawn silhouette on a dark blue
  square, matching the app's theme color) at every size the manifest /
  favicons / apple-touch-icon need, plus a 1200x630 Open Graph share image.
  No external image tools available in this environment, so this draws
  everything with plain GDI+ (System.Drawing) primitives. Backgrounds are
  plain squares (not rounded) - both Android adaptive icons and iOS apply
  their own corner mask to whatever square is provided, so rounding it
  ourselves too would just double up.
#>
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\icons\app'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$bg = [System.Drawing.Color]::FromArgb(255, 30, 41, 96)      # dark blue background
$fg = [System.Drawing.Color]::FromArgb(255, 245, 245, 245)   # off-white pawn

function New-PawnPath {
  param([double]$Scale, [double]$OffsetX = 0, [double]$OffsetY = 0)
  # Pawn silhouette defined in a 100x100 box, then scaled/offset.
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($OffsetX + 34 * $Scale, $OffsetY + 14 * $Scale, 32 * $Scale, 32 * $Scale)   # head
  $path.AddEllipse($OffsetX + 37 * $Scale, $OffsetY + 42 * $Scale, 26 * $Scale, 10 * $Scale)    # neck
  $body = @(
    [System.Drawing.PointF]::new([single]($OffsetX + 41 * $Scale), [single]($OffsetY + 50 * $Scale))
    [System.Drawing.PointF]::new([single]($OffsetX + 59 * $Scale), [single]($OffsetY + 50 * $Scale))
    [System.Drawing.PointF]::new([single]($OffsetX + 68 * $Scale), [single]($OffsetY + 80 * $Scale))
    [System.Drawing.PointF]::new([single]($OffsetX + 32 * $Scale), [single]($OffsetY + 80 * $Scale))
  )
  $path.AddPolygon($body)                                                                       # body
  $path.AddEllipse($OffsetX + 24 * $Scale, $OffsetY + 78 * $Scale, 52 * $Scale, 12 * $Scale)     # base
  return $path
}

function New-Icon {
  param([int]$Size, [string]$OutFile)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $bg), 0, 0, $Size, $Size)

  $scale = $Size / 100.0
  $pawnPath = New-PawnPath -Scale $scale
  $region = New-Object System.Drawing.Region $pawnPath
  $g.FillRegion((New-Object System.Drawing.SolidBrush $fg), $region)

  $g.Dispose()
  $bmp.Save((Join-Path $outDir $OutFile), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# The app icon PNGs now come from icons/app/logo.svg instead - see
# scripts/render-app-icons.sh. Only the Open Graph image below is still
# drawn here.

# --- Open Graph share image (1200x630) ---
$ogW = 1200; $ogH = 630
$bmp = New-Object System.Drawing.Bitmap $ogW, $ogH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 15, 15))), 0, 0, $ogW, $ogH)

$iconSize = 380
$iconMarginX = 110
$iconMarginY = ($ogH - $iconSize) / 2
$g.FillRectangle((New-Object System.Drawing.SolidBrush $bg), $iconMarginX, $iconMarginY, $iconSize, $iconSize)

$scale = $iconSize / 100.0
$pawnPath = New-PawnPath -Scale $scale -OffsetX $iconMarginX -OffsetY $iconMarginY
$region = New-Object System.Drawing.Region $pawnPath
$g.FillRegion((New-Object System.Drawing.SolidBrush $fg), $region)

$textX = $iconMarginX + $iconSize + 60
$titleFont = New-Object System.Drawing.Font('Segoe UI', 64)
$subFont = New-Object System.Drawing.Font('Segoe UI', 24)
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 245, 245, 245))
$grayBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 163, 163, 163))

$g.DrawString('Chess Analysis', $titleFont, $whiteBrush, [single]$textX, [single]250)
$g.DrawString('Engine-Analyse & Genauigkeit', $subFont, $grayBrush, [single]$textX, [single]345)

$g.Dispose()
$bmp.Save((Join-Path $outDir 'og-image.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Icons written to $outDir"
Get-ChildItem $outDir | Select-Object Name, Length

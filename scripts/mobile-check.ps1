# Mobile check (docs/superpowers/plans/2026-11-23-mobile.md): opens the app in
# headless Chrome with phone emulation, clicks through every Meta-Analyse tab
# and reports per tab whether the page scrolls sideways (scrollWidth >
# clientWidth) plus the elements sticking out on the right. Saves a screenshot
# per tab. With -Url pointing at a deep link (?user=&game=&end=) it checks the
# single-game view instead. Exit code 1 if anything overflows.
#
# Needs the dev server (serve.ps1) on http://localhost:5500/ and Chrome.
#   powershell -File scripts/mobile-check.ps1 -Width 390 -Out C:\tmp\shots
#   powershell -File scripts/mobile-check.ps1 -Width 1400 -Out C:\tmp\desk   (desktop, no emulation)
param(
  [int]$Width = 390,
  [int]$Height = 844,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Url = 'http://localhost:5500/',
  [string]$User = 'geieruno',
  [string]$Exclude = '',        # CSS selector whose overflow is ignored (e.g. '#loader-panel' while it's being reworked)
  [string]$Before = '',         # JS run in each tab before the check (e.g. open a menu)
  [switch]$Full,                # full-page screenshots instead of the viewport
  [int]$Wait = 12
)

$mobile = $Width -lt 800
$prof = Join-Path $env:TEMP 'mobile-check-chessanalysis'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$port = 9336
$p = Start-Process $chrome -ArgumentList "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=$port", "--user-data-dir=$prof", "--window-size=$Width,$Height", 'about:blank' -PassThru
$failed = $false
try {
  Start-Sleep 3
  $tab = (Invoke-RestMethod "http://127.0.0.1:$port/json") | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $script:id = 0
  function Call($method, $params) {
    $script:id++
    $msg = @{ id = $script:id; method = $method; params = $params } | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync([ArraySegment[byte]]$bytes, 'Text', $true, [Threading.CancellationToken]::None).Wait()
    while ($true) {
      $buf = New-Object byte[] 8388608; $sb = New-Object Text.StringBuilder
      do { $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, [Threading.CancellationToken]::None); $r.Wait(); [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Result.Count)) } until ($r.Result.EndOfMessage)
      $o = $sb.ToString() | ConvertFrom-Json
      if ($o.id -eq $script:id) { return $o.result }
    }
  }
  function Eval($code) { (Call 'Runtime.evaluate' @{ expression = $code; returnByValue = $true; awaitPromise = $true }).result.value }
  function Shot($name) {
    $params = @{ format = 'png' }
    if ($Full) {
      $m = Call 'Page.getLayoutMetrics' @{}
      $params.captureBeyondViewport = $true
      $params.clip = @{ x = 0; y = 0; width = $Width; height = [Math]::Min(8000, $m.cssContentSize.height); scale = 1 }
    }
    $img = Call 'Page.captureScreenshot' $params
    [IO.File]::WriteAllBytes((Join-Path $Out "$name.png"), [Convert]::FromBase64String($img.data))
  }

  [void](Call 'Emulation.setDeviceMetricsOverride' @{ width = $Width; height = $Height; deviceScaleFactor = $(if ($mobile) { 2 } else { 1 }); mobile = $mobile })
  [void](Call 'Emulation.setTouchEmulationEnabled' @{ enabled = $mobile })
  [void](Call 'Page.navigate' @{ url = 'http://localhost:5500/' })
  Start-Sleep 2
  [void](Eval "localStorage.setItem('chessreview.lastUsername', '$User'); localStorage.setItem('chessreview.metaTab', 'overview'); 1")
  [void](Call 'Page.navigate' @{ url = $Url })
  Start-Sleep $Wait
  New-Item -ItemType Directory -Force -Path $Out | Out-Null

  $excl = $Exclude.Replace("'", "\'")
  $check = @"
(() => {
  const vw = document.documentElement.clientWidth;
  const ex = '$excl' ? [...document.querySelectorAll('$excl')] : [];
  const bad = [];
  // Inside a box that clips or scrolls sideways itself (tab strip, table wrapper) - no page overflow.
  const clipped = (e) => {
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };
  for (const e of document.querySelectorAll('body *')) {
    if (ex.some((x) => x.contains(e)) || clipped(e)) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || r.right <= vw + 1 || getComputedStyle(e).display === 'none') continue;
    // only the outermost offender of a branch
    const pr = e.parentElement.getBoundingClientRect();
    if (pr.right > vw + 1 && !ex.some((x) => x === e.parentElement)) continue;
    bad.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : '')) + ' right=' + Math.round(r.right));
  }
  return JSON.stringify({ vw, sw: document.documentElement.scrollWidth, bad: bad.slice(0, 5) });
})()
"@
  $isGame = $Url -match '[?&]game='
  $tabs = if ($isGame) { @('game') } else { (Eval "JSON.stringify([...document.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab))") | ConvertFrom-Json }
  foreach ($t in $tabs) {
    if (-not $isGame) { [void](Eval "document.querySelector('[data-tab=$t]').click(); window.scrollTo(0, 0); 1"); Start-Sleep -Milliseconds 900 }
    if ($Before) { [void](Eval $Before); Start-Sleep -Milliseconds 500 }
    $res = (Eval $check) | ConvertFrom-Json
    # Ignored areas may stick out on their own - only the page scrolling sideways counts then, and only through non-ignored elements.
    $over = $res.bad.Count -gt 0 -or ($res.sw -gt $res.vw -and -not $Exclude)
    $mark = if ($over) { 'UEBERLAUF' } else { 'ok' }
    Write-Output ("{0,-10} {1}  scrollWidth={2} clientWidth={3}  {4}" -f $t, $mark, $res.sw, $res.vw, ($res.bad -join ', '))
    if ($over) { $failed = $true }
    Shot $t
  }
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 } else { exit 0 }

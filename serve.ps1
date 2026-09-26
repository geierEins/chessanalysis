param([int]$Port = 5500)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Strg+C zum Beenden)"

$mime = @{
  ".html" = "text/html"; ".js" = "text/javascript"; ".css" = "text/css"
  ".json" = "application/json"; ".ico" = "image/x-icon"; ".png" = "image/png"
  ".svg" = "image/svg+xml"; ".wasm" = "application/wasm"
  ".webmanifest" = "application/manifest+json"; ".mp3" = "audio/mpeg"
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $req = $context.Request
      $res = $context.Response
      $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path -eq "/") { $path = "/index.html" }
      $filePath = Join-Path $root ($path.TrimStart('/'))

      if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = $mime[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentType = $contentType
        $res.ContentLength64 = $bytes.Length
        # Vendored engine files (js/engine/vendor/) never change once shipped
        # (e.g. Stockfish 19 Full's ~99 MB .wasm) - cache them for a year so
        # the browser doesn't re-transfer them on every reload/engine
        # re-select. Everything else is this app's own source, actively
        # edited during development, so it stays uncached to avoid showing
        # stale content after an edit.
        if ($path -match '^/js/engine/vendor/') {
          $res.Headers.Add("Cache-Control", "public, max-age=31536000, immutable")
        } else {
          $res.Headers.Add("Cache-Control", "no-cache")
        }
        if ($req.HttpMethod -ne "HEAD") {
          $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $res.StatusCode = 404
      }
    } catch {
      Write-Host "Request error: $_"
      try { $context.Response.StatusCode = 500 } catch {}
    } finally {
      $context.Response.Close()
    }
  }
} finally {
  $listener.Stop()
}

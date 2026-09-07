# Minimal static file server for local preview of the WIN WEARS frontend.
# Usage:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8080]
# Stop with Ctrl+C.

param([int]$Port = 8080)

$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend'
if (-not (Test-Path $root)) { Write-Error "frontend folder not found at $root"; exit 1 }

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.jpeg' = 'image/jpeg'
  '.jpg'  = 'image/jpeg'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.woff2'= 'font/woff2'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Error "Could not bind port $Port : $_"; exit 1 }
Write-Output "WIN WEARS preview running at http://localhost:$Port/  (root: $root)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

    $path = Join-Path $root $rel
    # Pretty URLs: /products/tpu-ball -> products/tpu-ball.html
    if (-not (Test-Path $path -PathType Leaf)) {
      if (Test-Path "$path.html" -PathType Leaf) { $path = "$path.html" }
      elseif (Test-Path (Join-Path $path 'index.html') -PathType Leaf) { $path = Join-Path $path 'index.html' }
    }

    # Never serve outside the web root
    $full = $null
    try { $full = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path } catch { }
    $rootFull = (Resolve-Path -LiteralPath $root).Path

    if ($full -and $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $full -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ctype = $types[$ext]
      if (-not $ctype) { $ctype = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ctx.Response.StatusCode = 200
      $ctx.Response.ContentType = $ctype
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $nf = Join-Path $root '404.html'
      $ctx.Response.StatusCode = 404
      if (Test-Path $nf -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($nf)
        $ctx.Response.ContentType = 'text/html; charset=utf-8'
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    }
    $ctx.Response.OutputStream.Close()
  } catch {
    # keep serving
  }
}

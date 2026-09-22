$ErrorActionPreference = 'Stop'
$previewUrl = 'http://127.0.0.1:4173/'
$previewRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$previewNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($previewNode) {
    $previewNodePath = $previewNode.Source
} else {
    $previewNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $previewNodePath)) {
    throw '未找到 Node.js。请安装 Node.js 后再启动网页版。'
}
$previewReady = $false
try {
    $previewResponse = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 2
    if ($previewResponse.Headers['X-Lead-Canticle'] -eq 'web-1' -or $previewResponse.Content.Contains('铅之圣咏 · 遗物鉴定所')) {
        $previewReady = $true
    } else {
        throw '端口 4173 正被另一个程序使用。请先关闭占用此端口的本地服务。'
    }
} catch [System.Net.WebException] {
    $previewReady = $false
}
if (-not $previewReady) {
    Start-Process -FilePath $previewNodePath -ArgumentList 'server.mjs' -WorkingDirectory $previewRoot -WindowStyle Hidden
    for ($previewAttempt = 0; $previewAttempt -lt 30; $previewAttempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $previewResponse = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 1
            if ($previewResponse.Headers['X-Lead-Canticle'] -eq 'web-1') {
                $previewReady = $true
                break
            }
        } catch { }
    }
}
if (-not $previewReady) { throw '预览未能启动。请确认端口 4173 没有被其他程序占用。' }
Start-Process $previewUrl

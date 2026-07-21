# 再塑通 — 云托管数据库恢复脚本
# 用法: pwsh restore-db.ps1 [本地DB路径]

param(
    [string]$DbPath = "$PSScriptRoot\..\data\zaisutong.db",
    [string]$Url = "https://replas1-280446-9-1452497195.sh.run.tcloudbase.com/api/backup/db",
    [string]$Token = "replas_migrate_2026_5a7b9c"
)

if (-not (Test-Path $DbPath)) {
    Write-Host "[ERROR] 数据库文件不存在: $DbPath" -ForegroundColor Red
    exit 1
}

$fileInfo = Get-Item $DbPath
Write-Host "数据库: $DbPath" -ForegroundColor Cyan
Write-Host "大小: $($fileInfo.Length) bytes ($([math]::Round($fileInfo.Length/1024,1)) KB)" -ForegroundColor Cyan
Write-Host "修改时间: $($fileInfo.LastWriteTime)" -ForegroundColor Cyan
Write-Host ""
Write-Host "目标: $Url" -ForegroundColor Yellow
Write-Host ""

# 读取文件为二进制
$body = [System.IO.File]::ReadAllBytes($DbPath)

# 验证 SQLite 文件头
$header = [System.Text.Encoding]::UTF8.GetString($body[0..15])
if ($header -ne "SQLite format 3`0") {
    Write-Host "[ERROR] 不是有效的 SQLite 数据库文件！" -ForegroundColor Red
    exit 1
}

Write-Host "文件头验证通过: SQLite format 3" -ForegroundColor Green
Write-Host "正在上传..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri $Url -Method PUT `
        -Headers @{Authorization="Bearer $Token"} `
        -ContentType "application/octet-stream" `
        -Body $body `
        -TimeoutSec 60 `
        -UseBasicParsing

    $result = $response.Content | ConvertFrom-Json
    Write-Host ""
    Write-Host "=== 恢复结果 ===" -ForegroundColor Green
    Write-Host "成功: $($result.success)" -ForegroundColor Green
    Write-Host "消息: $($result.message)" -ForegroundColor Green
    Write-Host "大小: $($result.size) bytes" -ForegroundColor Green
    Write-Host "表数: $($result.tables)" -ForegroundColor Green
    if ($result.needRestart) {
        Write-Host ""
        Write-Host "⚠️  请前往云托管控制台重启容器使恢复生效！" -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "=== 恢复失败 ===" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "服务器响应: $errorBody" -ForegroundColor Red
    }
}

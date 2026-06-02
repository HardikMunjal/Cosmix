# Deploy Cosmix to EC2 with disk cleanup and HTTPS compose overlay.
param(
    [string]$KeyPath = "C:\Users\hardi\Downloads\cosmix-ec2",
    [string]$ServerIP = "44.193.83.205",
    [string]$ServerUser = "ec2-user",
    [switch]$NoCache,
    [string[]]$Services = @('web', 'api-gateway', 'chat-service')
)

$ErrorActionPreference = 'Stop'
$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"
$composeBase = "docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml"
$noCacheFlag = if ($NoCache) { '--no-cache' } else { '' }
$serviceList = ($Services -join ' ')

Write-Host "Deploying to ${ServerUser}@${ServerIP} ..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

$remoteScript = @"
set -euo pipefail
cd /opt/cosmix
echo '=== git pull ==='
git pull origin main
echo '=== docker disk cleanup ==='
docker container prune -f || true
docker image prune -af || true
docker builder prune -af || true
docker system prune -af || true
df -h / | tail -1
echo '=== build: $serviceList ==='
$composeBase build $noCacheFlag $serviceList
echo '=== restart stack ==='
$composeBase up -d nginx web api-gateway chat-service wellness-service auth-service user-service
echo '=== status ==='
$composeBase ps
docker system df
"@

& $ssh -i $KeyPath "${ServerUser}@${ServerIP}" $remoteScript
if ($LASTEXITCODE -ne 0) {
    throw "Remote deploy failed with exit code $LASTEXITCODE"
}

Write-Host "Deploy finished. https://$ServerIP/ (or your nip.io domain)" -ForegroundColor Green

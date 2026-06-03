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
cd /opt/cosmix && git pull origin main
if [ -f .env ] && [ ! -f infra/.env ]; then cp .env infra/.env && echo 'Synced .env -> infra/.env'; fi
if [ ! -f infra/.env ]; then echo 'ERROR: infra/.env missing (set DATABASE_URL to RDS)'; exit 1; fi
docker container prune -f || true
docker image prune -af || true
docker builder prune -af || true
docker system prune -af || true
df -h / | tail -1
$composeBase build $noCacheFlag $serviceList
$composeBase up -d --force-recreate nginx web api-gateway chat-service wellness-service auth-service user-service
$composeBase ps
docker system df
"@

& $ssh -i $KeyPath "${ServerUser}@${ServerIP}" "bash -lc '$remoteScript'"
if ($LASTEXITCODE -ne 0) {
    throw "Remote deploy failed with exit code $LASTEXITCODE"
}

Write-Host "Deploy finished. https://$ServerIP/ (or your nip.io domain)" -ForegroundColor Green

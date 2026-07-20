# Deploy Cosmix to EC2 with disk cleanup and retryable steps.
param(
    [string]$KeyPath = "C:\Users\hardi\Downloads\cosmix-ec2",
    [string]$ServerIP = "44.193.83.205",
    [string]$ServerUser = "ec2-user",
    [switch]$NoCache,
    [ValidateSet('all', 'pull', 'prune', 'build', 'up', 'verify')]
    [string]$Step = 'all',
    [string[]]$Services = @('web', 'api-gateway', 'chat-service', 'wellness-service')
)

$ErrorActionPreference = 'Stop'
$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"
$target = "${ServerUser}@${ServerIP}"

Write-Host "Deploy [$Step] -> $target" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

$noCacheVal = if ($NoCache) { '1' } else { '0' }
$remote = "cd /opt/cosmix && git pull origin main && COSMIX_NO_CACHE=$noCacheVal bash scripts/ec2-deploy-remote.sh $Step"

& $ssh -i $KeyPath -o ServerAliveInterval=30 $target "bash -lc '$remote'"
if ($LASTEXITCODE -ne 0) {
    throw "Remote deploy step '$Step' failed with exit code $LASTEXITCODE"
}

Write-Host "Deploy finished. https://44-193-83-205.nip.io/" -ForegroundColor Green
Write-Host "Retry examples:" -ForegroundColor DarkGray
Write-Host "  .\scripts\deploy-ec2.ps1 -Step prune" -ForegroundColor DarkGray
Write-Host "  .\scripts\deploy-ec2.ps1 -Step build -NoCache" -ForegroundColor DarkGray
Write-Host "  .\scripts\deploy-ec2.ps1 -Step up" -ForegroundColor DarkGray

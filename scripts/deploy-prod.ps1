# Cosmix Production Deployment Script (PowerShell)
# Run this script to deploy latest changes to production
# Canonical SSH details for this environment:
# - Key file: C:\Users\hardi\Downloads\cosmix-ec2
# - Username: ec2-user
# - Host: 44.193.83.205
# Notes:
# - cosmix-ec2-new.pem is corrupted and should not be used.
# - cosmix-ec2 (1) is a duplicate of the working key.

param(
    [string]$KeyPath = "C:\Users\hardi\Downloads\cosmix-ec2",
    [string]$ServerIP = "44.193.83.205",
    [string]$ServerUser = "ec2-user",
    [string]$HttpsDomain = "",
    [string]$HttpsEmail = ""
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Cosmix Production Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Verify SSH key exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: SSH key not found at $KeyPath" -ForegroundColor Red
    Write-Host "Please check the key path and try again" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/4] Verifying SSH connection..." -ForegroundColor Yellow
Write-Host "  Key: $KeyPath"
Write-Host "  Server: ${ServerUser}@${ServerIP}"
Write-Host ""

# Test SSH connection
try {
    ssh -i $KeyPath ${ServerUser}@${ServerIP} "echo 'SSH connection successful'"
    if ($LASTEXITCODE -ne 0) {
        throw "SSH returned exit code $LASTEXITCODE"
    }
} catch {
    Write-Host "ERROR: SSH connection failed" -ForegroundColor Red
    Write-Host "Possible causes:" -ForegroundColor Yellow
    Write-Host "  1. SSH key doesn't match the instance"
    Write-Host "  2. Server is unreachable or not running"
    Write-Host "  3. Firewall blocking port 22"
    Write-Host "  4. Wrong username (expected: ec2-user)"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify the key in AWS console"
    Write-Host "  2. Check security group allows port 22"
    Write-Host "  3. Try: ssh -i $KeyPath ${ServerUser}@${ServerIP} 'ls -la'"
    exit 1
}

Write-Host "[1/4] SSH connection verified ✓" -ForegroundColor Green
Write-Host ""

Write-Host "[2/4] Pulling latest code..." -ForegroundColor Yellow
ssh -i $KeyPath ${ServerUser}@${ServerIP} "cd /opt/cosmix && git pull origin main"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to pull code" -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] Code pull completed ✓" -ForegroundColor Green
Write-Host ""

Write-Host "[3/4] Rebuilding web service..." -ForegroundColor Yellow
ssh -i $KeyPath ${ServerUser}@${ServerIP} "cd /opt/cosmix && docker compose -f infra/docker-compose.ec2.yml up -d --build web"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to rebuild service" -ForegroundColor Red
    exit 1
}

Write-Host "[3/4] Rebuild started..." -ForegroundColor Green
Write-Host "  (Waiting 45 seconds for service to start)" -ForegroundColor Yellow
Start-Sleep -Seconds 45

Write-Host "[4/4] Verifying deployment..." -ForegroundColor Yellow
$logs = ssh -i $KeyPath ${ServerUser}@${ServerIP} "docker logs `$(docker ps | grep web | awk '{print `$1}' | head -1) --tail=10"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Production URL: http://${ServerIP}/" -ForegroundColor Cyan

if ($HttpsDomain -and $HttpsEmail) {
    Write-Host "" 
    Write-Host "[HTTPS] Enabling TLS for $HttpsDomain ..." -ForegroundColor Yellow
    ssh -i $KeyPath ${ServerUser}@${ServerIP} "chmod +x /opt/cosmix/scripts/setup-https-ec2.sh && /opt/cosmix/scripts/setup-https-ec2.sh $HttpsDomain $HttpsEmail"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "HTTPS URL: https://${HttpsDomain}/" -ForegroundColor Cyan
    } else {
        Write-Host "HTTPS setup failed. App remains reachable on HTTP." -ForegroundColor Red
    }
}
Write-Host ""
Write-Host "To verify:" -ForegroundColor Yellow
Write-Host "  1. Visit http://${ServerIP}/"
Write-Host "  2. Check browser console (F12)"
Write-Host "  3. Run: ssh -i $KeyPath ${ServerUser}@${ServerIP} 'docker compose -f infra/docker-compose.ec2.yml logs -f web'"
Write-Host ""

Write-Host "Recent logs:" -ForegroundColor Cyan
Write-Host $logs

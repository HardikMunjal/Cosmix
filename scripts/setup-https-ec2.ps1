param(
    [Parameter(Mandatory = $true)]
    [string]$Domain,
    [Parameter(Mandatory = $true)]
    [string]$Email,
    [string]$KeyPath = "C:\Users\hardi\Downloads\cosmix-ec2",
    [string]$ServerIP = "44.193.83.205",
    [string]$ServerUser = "ec2-user"
)

Write-Host "Setting up HTTPS for $Domain on EC2..." -ForegroundColor Cyan

ssh -i $KeyPath ${ServerUser}@${ServerIP} "chmod +x /opt/cosmix/scripts/setup-https-ec2.sh && /opt/cosmix/scripts/setup-https-ec2.sh $Domain $Email"

if ($LASTEXITCODE -ne 0) {
    Write-Host "HTTPS setup failed" -ForegroundColor Red
    exit 1
}

Write-Host "HTTPS setup completed: https://$Domain" -ForegroundColor Green

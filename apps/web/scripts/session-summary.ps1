$cookieJar = Join-Path $PWD 'tmp-hardi-cookies.txt'
curl.exe -s -k -c $cookieJar -X POST -H "Content-Type: application/json" --data-binary "@apps/web/scripts/hardi-login-body.json" "https://44-193-83-205.nip.io/api/auth/login"
Write-Host "`n---SESSION---"
curl.exe -s -k -b $cookieJar "https://44-193-83-205.nip.io/api/auth/session"
Remove-Item $cookieJar -ErrorAction SilentlyContinue

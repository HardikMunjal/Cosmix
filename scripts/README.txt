================================================================================
COSMIX — EC2 PRODUCTION DEPLOY (agent / operator runbook)
================================================================================

Production URL:  https://44-193-83-205.nip.io/
Server:          ec2-user@44.193.83.205
App path:        /opt/cosmix
SSH key:         C:\Users\hardi\Downloads\cosmix-ec2
                 (do NOT use cosmix-ec2-new.pem — corrupted)

Compose files (always use BOTH for HTTPS):
  infra/docker-compose.ec2.yml
  infra/docker-compose.ec2.https.yml

REQUIRED: infra/.env with DATABASE_URL pointing at RDS (not host "postgres").
  EC2 has no postgres container. If you only have /opt/cosmix/.env, sync before up:
    cp /opt/cosmix/.env /opt/cosmix/infra/.env
  deploy-ec2.ps1 does this automatically when infra/.env is missing.

Short alias on server:
  COMPOSE="docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml"

================================================================================
1. RECOMMENDED — one command from Windows (after git push)
================================================================================

From repo root (Cosmix/):

  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-ec2.ps1

What it does remotely:
  - git pull origin main
  - docker prune (container, image, builder, system) — frees disk
  - df -h /
  - build: web, api-gateway, chat-service (cached unless -NoCache)
  - up -d: nginx web api-gateway chat-service wellness-service auth-service user-service
  - docker compose ps && docker system df

Options:
  -NoCache                    full rebuild (slow; use when deps/Dockerfile changed)
  -Services web               build only web (faster UI-only deploy after pull)
  -Services web,api-gateway   custom list

Example UI-only:
  .\scripts\deploy-ec2.ps1 -Services web

Example full no-cache:
  .\scripts\deploy-ec2.ps1 -NoCache

================================================================================
2. STANDARD FLOW — commit locally, push, deploy, verify
================================================================================

A) Local (Windows PowerShell, in Cosmix/)

  git status
  git add <files>
  git commit -m "Your message"
  git push origin main

B) Deploy

  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-ec2.ps1

C) Verify deployment

  1) Site loads:
     https://44-193-83-205.nip.io/

  2) SSH — confirm git HEAD matches your commit:
     C:\Windows\System32\OpenSSH\ssh.exe -i C:\Users\hardi\Downloads\cosmix-ec2 ec2-user@44.193.83.205 "git -C /opt/cosmix log -1 --oneline"

  3) SSH — confirm new UI strings exist in built web image (example):
     docker exec infra-web-1 grep -l "Performance dashboards" /usr/src/app/.next/static/chunks/pages/running-analytics*.js 2>/dev/null | head -1

  4) Containers running:
     ssh ... "cd /opt/cosmix && docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml ps"

  5) Disk not full (should stay under ~85%; 12G root volume):
     ssh ... "df -h / | tail -1"

================================================================================
3. MANUAL SSH — quick web + gateway only (your earlier one-liner)
================================================================================

C:\Windows\System32\OpenSSH\ssh.exe -i C:\Users\hardi\Downloads\cosmix-ec2 ec2-user@44.193.83.205 "cd /opt/cosmix && git pull origin main && docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml build web api-gateway && docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml up -d web api-gateway nginx"

With --no-cache (only when needed):

  ... build --no-cache web api-gateway && ...

================================================================================
4. MANUAL SSH — full rebuild all services (on server)
================================================================================

ssh -i C:\Users\hardi\Downloads\cosmix-ec2 ec2-user@44.193.83.205

cd /opt/cosmix
git pull origin main

# --- disk cleanup BEFORE build (12G disk fills fast) ---
docker container prune -f
docker image prune -a -f
docker builder prune -a -f
docker system prune -a -f
df -h /

# --- build each service (or build web api-gateway only for small changes) ---
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml build auth-service
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml build user-service
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml build chat-service
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml build wellness-service
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml build api-gateway
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml build web

# --- restart stack ---
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml down
docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml up -d

docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml ps
docker system df
df -h /

================================================================================
5. DISK EMERGENCY — when df shows 100% or build fails "no space"
================================================================================

On server:

  docker builder prune -a -f
  docker image prune -a -f
  docker container prune -f
  docker system prune -a -f
  df -h /

Avoid unless you intend to wipe everything and rebuild from scratch:

  docker compose -f infra/docker-compose.ec2.yml -f infra/docker-compose.ec2.https.yml down --volumes --remove-orphans
  docker system prune -a --volumes -f

Notes:
  - EC2 root volume is ~12G; Docker build cache can exceed 3GB after several builds.
  - deploy-ec2.ps1 prunes automatically before each deploy.
  - Aggressive prune may remove unused images (e.g. certbot/certbot) — OK if certs live on host at /etc/letsencrypt.

================================================================================
6. HTTPS / nginx — important volume change
================================================================================

In infra/docker-compose.ec2.https.yml nginx mounts host certs (not ./certbot/conf):

  - /etc/letsencrypt:/etc/letsencrypt:ro
  - ./certbot/www:/var/www/certbot:ro

Certs on server: /etc/letsencrypt/live/44-193-83-205.nip.io/
Nginx config:    infra/nginx.ec2.https.conf

Renewal (if needed): scripts/setup-https-ec2.sh on server (see docs/aws-free-tier-deploy.md)

================================================================================
7. SERVICES & PORTS (internal — public is 80/443 via nginx)
================================================================================

  nginx          80, 443  (only public ports)
  web            3005
  api-gateway    3000
  auth-service   3001
  chat-service   3002
  user-service   3003
  wellness-service 3004

================================================================================
8. SMOKE TESTS AFTER DEPLOY
================================================================================

  curl -sk -o /dev/null -w "%{http_code}\n" https://44-193-83-205.nip.io/
  curl -sk -o /dev/null -w "%{http_code}\n" https://44-193-83-205.nip.io/running-analytics
  curl -sk -o /dev/null -w "%{http_code}\n" https://44-193-83-205.nip.io/settings
  curl -sk -o /dev/null -w "%{http_code}\n" https://44-193-83-205.nip.io/wellness

  # Auth (optional; scripts/remote-auth-check.sh on server or local curl with cookies)

Browser (logged in):
  - /wellness          Henna tab, activity modal, race goal banner
  - /running-analytics Performance dashboards (sections open), Other sports tab
  - /settings          Sign out
  - /dashboard         gear icon -> settings

================================================================================
9. TROUBLESHOOTING
================================================================================

  SSH fails:
    - Key: C:\Users\hardi\Downloads\cosmix-ec2
    - User: ec2-user
    - Security group: port 22 open

  Site 502 / old UI:
    - git log -1 on server vs local
    - rebuild web: deploy-ec2.ps1 -Services web
    - docker logs infra-web-1 --tail 50

  HTTPS broken:
    - ls /etc/letsencrypt/live/44-193-83-205.nip.io/
    - docker logs infra-nginx-1 --tail 30
    - confirm https compose overlay is used (both -f files)

  Build OOM on t3.micro:
    - prune first; build one service at a time; avoid --no-cache unless necessary

================================================================================
10. RELATED FILES IN REPO
================================================================================

  scripts/deploy-ec2.ps1      — automated deploy (preferred)
  scripts/deploy-prod.ps1     — older web-only deploy script
  scripts/deploy-prod.sh      — bash variant
  scripts/setup-https-ec2.sh    — TLS setup on EC2
  scripts/remote-auth-check.sh  — curl auth/wellness smoke tests
  docs/aws-free-tier-deploy.md  — architecture / first-time setup

Last verified deploy: commit on server should match origin/main after deploy-ec2.ps1.
Production host: 44-193.83.205 / https://44-193-83-205.nip.io/

================================================================================

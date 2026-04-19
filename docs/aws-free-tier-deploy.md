# AWS Free Tier Deployment

This repository is set up for the simplest AWS deployment path: one EC2 instance running Docker Compose.

## Recommended Approach

Use:

- `infra/terraform/ec2` to provision the network and EC2 instance.
- `infra/docker-compose.ec2.yml` to run the app stack on that instance.

This is the right fit for an AWS free-tier-style setup because it avoids:

- EKS complexity
- ECS networking overhead
- ALB and RDS cost creep

## What Is Already Prepared

- Terraform for a single public EC2 instance
- Security group rules for `22` and `80`
- Docker Compose file for EC2 deployment
- Nginx reverse proxy on the same EC2 instance
- Auto-install of Docker and Docker Compose in EC2 user-data
- Automatic swap file creation to reduce build failures on micro instances

## What I Need From You

You need to provide these values:

1. AWS region
2. EC2 key pair name or SSH public key
3. Your public IP as CIDR for SSH access
4. Repo clone method
5. Whether only the web app should be public
6. Optional domain name
7. Optional Strava credentials

Use this exact checklist:

```txt
aws_region = us-east-1
key_pair_name = <your existing EC2 key pair name>
create_key_pair = true|false
public_key_path = <local path to .pub file if create_key_pair is true>
admin_cidr = <your public IP>/32
repo_url = <public https git url or ssh url>
repo_branch = main
public_api_ports = web-only
domain = <optional>
strava_client_id = <optional>
strava_client_secret = <optional>
```

## Recommended Defaults

For your account and this repo, I recommend:

- Region: `us-east-1`
- Instance type: `t3.micro`
- Root volume: `12 GB`
- Swap: `2048 MB`
- Public ingress for port `80`: `0.0.0.0/0`
- SSH ingress: your IP only

## Deployment Flow

1. Fill in `infra/terraform/ec2/terraform.tfvars`
2. If creating a new key pair, generate one locally first:

```powershell
ssh-keygen -t ed25519 -f $HOME/.ssh/cosmix-ec2 -C "cosmix-ec2"
```

3. Run Terraform:

```bash
cd infra/terraform/ec2
terraform init
terraform apply
```

4. SSH into the instance using the Terraform output.
5. Ensure the repo exists in `/opt/cosmix`.
6. Create `infra/.env` on the instance from `infra/.env.ec2.example` and set a strong Postgres password.
7. Start the stack:

```bash
cd /opt/cosmix/infra
cp .env.ec2.example .env
# edit .env and set POSTGRES_PASSWORD / DATABASE_URL first
docker compose -f docker-compose.ec2.yml up -d --build
```

## Public Endpoints After Deploy

- Web: `http://<public-ip>/`

Chat websocket and wellness requests are routed through the same public host on port `80`.

## Important Limitations

- First Docker build on `t3.micro` will be slow.
- This is suitable for demo / low traffic use, not production scale.
- No TLS is configured yet.
- Postgres is local to the EC2 instance, not managed.
- If you want proper production deployment later, the next step is usually:
  - Route 53
  - Nginx or ALB
  - ACM TLS
  - managed Postgres

## Postgres Choice

For AWS free tier, the better approach here is one EC2 instance with Docker Compose and a private Postgres container on the same host. A separate EC2 instance or RDS would add cost or complexity without real benefit for this workload.

- Postgres stays internal to Docker networking and is not exposed publicly.
- Persistent storage is handled by the `postgres_data` Docker volume.
- Services wait for Postgres health before starting.

## Important Note About AWS Credentials

If access keys were shared in chat or committed anywhere outside your secret manager, rotate them after deployment.

## Best Next Step

Once you send the values from the checklist above, the remaining work is straightforward:

1. Fill Terraform variables
2. Provision the EC2 host
3. Start the stack
4. Verify the public endpoints
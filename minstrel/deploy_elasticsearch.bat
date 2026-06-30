@echo off
REM ---------------------------------------------------------------
REM  Deploy Elasticsearch to its dedicated EC2 instance.
REM  Run this once to set up, then again whenever docker-compose
REM  config changes (e.g. heap size, cluster settings).
REM
REM  Fill in ES_HOST below with your ES server's public DNS or IP.
REM ---------------------------------------------------------------

SET KEY="C:\Users\jakvo\Downloads\test.pem"
SET ES_HOST=ec2-54-186-102-212.us-west-2.compute.amazonaws.com

echo.
echo === Deploying Elasticsearch to %ES_HOST% ===
echo.

REM --- Copy docker-compose file ---
echo Step 1: Copying docker-compose config...
scp -i %KEY% "docker-compose-elasticsearch.yml" ec2-user@%ES_HOST%:/home/ec2-user/docker-compose.yml

if %errorlevel% neq 0 (
    echo Error: Failed to copy docker-compose file
    pause
    exit /b 1
)

REM --- One-time OS setup (safe to re-run, idempotent) ---
echo.
echo Step 2: Configuring OS settings...
ssh -i %KEY% ec2-user@%ES_HOST% ^
    "sudo sysctl -w vm.max_map_count=262144 && grep -q vm.max_map_count /etc/sysctl.conf || echo 'vm.max_map_count=262144' | sudo tee -a /etc/sysctl.conf"

REM --- Install Docker if not present ---
echo.
echo Step 3: Ensuring Docker is installed...
ssh -i %KEY% ec2-user@%ES_HOST% ^
    "which docker > /dev/null 2>&1 || (sudo yum update -y && sudo yum install -y docker && sudo systemctl enable docker && sudo systemctl start docker && sudo usermod -aG docker ec2-user)"

REM --- Install Docker Compose plugin if not present (aarch64 for ARM/t4g) ---
echo.
echo Step 4: Ensuring Docker Compose is installed...
ssh -i %KEY% ec2-user@%ES_HOST% ^
    "docker compose version > /dev/null 2>&1 || (sudo mkdir -p /usr/local/lib/docker/cli-plugins && sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 -o /usr/local/lib/docker/cli-plugins/docker-compose && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose)"

REM --- Format and mount EBS data volume at /esdata (idempotent) ---
echo.
echo Step 5: Mounting EBS data volume at /esdata...
ssh -i %KEY% ec2-user@%ES_HOST% ^
    "blkid /dev/sdb > /dev/null 2>&1 || sudo mkfs.ext4 /dev/sdb && sudo mkdir -p /esdata && (mountpoint -q /esdata || (sudo mount /dev/sdb /esdata && grep -q '/dev/sdb' /etc/fstab || echo '/dev/sdb /esdata ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab)) && sudo chown -R 1000:1000 /esdata && echo '/esdata mount OK'"

REM --- Start or restart Elasticsearch ---
echo.
echo Step 6: Starting Elasticsearch...
ssh -i %KEY% ec2-user@%ES_HOST% ^
    "cd /home/ec2-user && docker compose down 2>/dev/null; docker compose up -d"

if %errorlevel% neq 0 (
    echo Error: Failed to start Elasticsearch
    pause
    exit /b 1
)

REM --- Wait a moment and check health ---
echo.
echo Step 7: Checking Elasticsearch health (waiting 15 seconds)...
timeout /t 15 /nobreak > nul
ssh -i %KEY% ec2-user@%ES_HOST% ^
    "curl -s http://localhost:9200/_cluster/health?pretty | grep -E '(status|number_of_nodes)'"

echo.
echo === Elasticsearch deploy complete! ===
echo.
echo Next steps:
echo   1. Get the private IP:  ssh -i %KEY% ec2-user@%ES_HOST% "curl -s http://169.254.169.254/latest/meta-data/local-ipv4"
echo   2. Set ELASTICSEARCH_URL=http://<private-ip>:9200 on the app server
echo   3. Restart the app server
echo.
pause

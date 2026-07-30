@echo off
SET REPO_ROOT=C:\Users\jakvo\OneDrive\Desktop\minstrel-repo
SET DEPLOY_EXCLUDE=%REPO_ROOT%\minstrel\deploy-exclude.txt
SET ARCHIVE=%REPO_ROOT%\minstrel.tar.gz
REM Python bootstrap: interpreter used to create the venv (change when upgrading, e.g. python3.12)
SET PYTHON_BOOTSTRAP=python3.11
REM Venv lives outside minstrel/ so code deploys (rm -rf minstrel) do not wipe it
SET VENV=/home/ec2-user/minstrel-venv

REM --- Create the tar.gz archive of minstrel + notes (sibling package required by app.py) ---
echo Compressing minstrel and notes folders...
tar -czf "%ARCHIVE%" -C "%REPO_ROOT%" --exclude-from="%DEPLOY_EXCLUDE%" minstrel notes

if %errorlevel% neq 0 (
    echo Error: Failed to create deploy archive
    pause
    exit /b 1
)

REM --- Copy the archive to the EC2 server ---
echo Copying minstrel.tar.gz to server...
scp -i "C:\Users\jakvo\Downloads\test.pem" "%ARCHIVE%" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com:/home/ec2-user/

REM --- SSH into server and update the code ---
echo Updating files on remote server...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "cd /home/ec2-user &&" ^
    "if [ -f minstrel/.env ]; then cp minstrel/.env .minstrel.env.deploy; fi &&" ^
    "sudo rm -rf minstrel notes &&" ^
    "sudo tar -xzf minstrel.tar.gz &&" ^
    "sudo chown -R ec2-user:ec2-user minstrel notes &&" ^
    "if [ -f .minstrel.env.deploy ]; then mv .minstrel.env.deploy minstrel/.env && chmod 600 minstrel/.env; fi &&" ^
    "rm minstrel.tar.gz"

REM --- SSH into server to kill the running server (if any) ---
echo Killing existing uvicorn server if running...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "pkill -f uvicorn"

REM --- Ensure Python venv exists ---
echo Ensuring Python venv at %VENV%...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "which %PYTHON_BOOTSTRAP% >/dev/null 2>&1 || sudo dnf install -y %PYTHON_BOOTSTRAP%; [ -d %VENV% ] || %PYTHON_BOOTSTRAP% -m venv %VENV%"

if %errorlevel% neq 0 (
    echo Error: Failed to set up Python venv
    pause
    exit /b 1
)

REM --- Install Python dependencies ---
echo Installing Python requirements...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "%VENV%/bin/pip install -r /home/ec2-user/minstrel/requirements.txt"

if %errorlevel% neq 0 (
    echo Error: Failed to install Python requirements
    pause
    exit /b 1
)

REM --- Write production .env on the server ---
REM Update ES_PRIVATE_IP below when your ES server changes
SET ES_PRIVATE_IP=172.31.56.241
echo Setting production ELASTICSEARCH_URL...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "if grep -q '^ELASTICSEARCH_URL=' /home/ec2-user/minstrel/.env 2>/dev/null; then sed -i 's|^ELASTICSEARCH_URL=.*|ELASTICSEARCH_URL=http://%ES_PRIVATE_IP%:9200|' /home/ec2-user/minstrel/.env; else echo 'ELASTICSEARCH_URL=http://%ES_PRIVATE_IP%:9200' >> /home/ec2-user/minstrel/.env; fi"

REM --- Ensure certbot auto-renewal is enabled ---
echo.
echo === Checking SSL Auto-Renewal ===
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "sudo systemctl enable certbot-renew.timer 2>/dev/null && sudo systemctl start certbot-renew.timer 2>/dev/null && echo 'SSL auto-renewal: ENABLED' && sudo systemctl status certbot-renew.timer --no-pager | grep Active"
echo.

REM --- SSH into server and start the server ---
echo Starting uvicorn server...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "cd minstrel && nohup %VENV%/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000 > uvicorn.log 2>&1 &"

REM --- Check SSL certificate expiry ---
echo.
echo === SSL Certificate Status ===
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "sudo certbot certificates 2>/dev/null | grep -E '(Certificate Name|Expiry Date)' || echo 'Note: Run certbot renew if certificate expired'"
echo.

echo All done!
echo.
pause

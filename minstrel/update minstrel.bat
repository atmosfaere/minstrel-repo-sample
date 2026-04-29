@echo off
REM --- Create the tar.gz archive of minstrel directory ---
echo Compressing minstrel folder...
tar -czf minstrel.tar.gz -C "C:\Users\jakvo\OneDrive\Desktop\minstrel-repo" minstrel

REM --- Copy the archive to the EC2 server ---
echo Copying minstrel.tar.gz to server...
scp -i "C:\Users\jakvo\Downloads\test.pem" minstrel.tar.gz ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com:/home/ec2-user/

REM --- SSH into server and update the code ---
echo Updating files on remote server...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "cd /home/ec2-user && sudo rm -rf minstrel && sudo tar -xzf minstrel.tar.gz && sudo chown -R ec2-user:ec2-user minstrel && rm minstrel.tar.gz"

REM --- SSH into server to kill the running server (if any) ---
echo Killing existing uvicorn server if running...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "pkill -f uvicorn"

REM --- Install Python dependencies ---
echo Installing Python requirements...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "cd minstrel && pip3 install -r requirements.txt"

REM --- Start Elasticsearch using deploy script (DISABLED - uncomment when ready) ---
REM echo Starting Elasticsearch...
REM ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
REM     "cd minstrel && chmod +x deploy.sh && ./deploy.sh"

REM --- Ensure certbot auto-renewal is enabled ---
echo.
echo === Checking SSL Auto-Renewal ===
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "sudo systemctl enable certbot-renew.timer 2>/dev/null && sudo systemctl start certbot-renew.timer 2>/dev/null && echo 'SSL auto-renewal: ENABLED' && sudo systemctl status certbot-renew.timer --no-pager | grep Active"
echo.

REM --- SSH into server and start the server ---
echo Starting uvicorn server...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "cd minstrel && nohup python3 -m uvicorn app:app --host 127.0.0.1 --port 8000 > uvicorn.log 2>&1 &"

REM --- Check SSL certificate expiry ---
echo.
echo === SSL Certificate Status ===
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com ^
    "sudo certbot certificates 2>/dev/null | grep -E '(Certificate Name|Expiry Date)' || echo 'Note: Run certbot renew if certificate expired'"
echo.

echo All done!
echo.
pause

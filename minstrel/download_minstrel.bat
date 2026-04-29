@echo off
echo Downloading minstrel folder from server...
echo.

echo Step 1: Compressing minstrel folder on server...
ssh -i "C:/Users/jakvo/Downloads/test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "cd /home/ec2-user && tar -czf minstrel.tar.gz minstrel"

if %errorlevel% neq 0 (
    echo Error: Failed to compress minstrel folder on server
    pause
    exit /b 1
)

echo Step 2: Downloading compressed file to Downloads folder...
cd /d "C:\Users\jakvo\Downloads"
scp -i test.pem ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com:/home/ec2-user/minstrel.tar.gz minstrel.tar.gz

if %errorlevel% neq 0 (
    echo Error: Failed to download file
    pause
    exit /b 1
)

echo Step 3: Extracting minstrel folder in Downloads...
tar -xzf minstrel.tar.gz

if %errorlevel% neq 0 (
    echo Error: Failed to extract file
    pause
    exit /b 1
)

echo Step 4: Cleaning up compressed file on server...
ssh -i "C:/Users/jakvo/Downloads/test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "rm /home/ec2-user/minstrel.tar.gz"

echo.
echo Download complete! Minstrel folder is now in C:\Users\jakvo\Downloads\minstrel
echo.
pause 
@echo off
echo Downloading minstrel_data folder from server...
echo.

echo Step 1: Compressing minstrel_data folder on server...
ssh -i "C:/Users/jakvo/Downloads/test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "cd /home/ec2-user && tar -czf minstrel_data.tar.gz minstrel_data"

if %errorlevel% neq 0 (
    echo Error: Failed to compress minstrel_data folder on server
    pause
    exit /b 1
)

echo Step 2: Downloading compressed file to Downloads folder...
cd /d "C:\Users\jakvo\Downloads"
scp -i test.pem ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com:/home/ec2-user/minstrel_data.tar.gz minstrel_data.tar.gz

if %errorlevel% neq 0 (
    echo Error: Failed to download file
    pause
    exit /b 1
)

echo Step 3: Extracting minstrel_data folder in Downloads...
tar -xzf minstrel_data.tar.gz

if %errorlevel% neq 0 (
    echo Error: Failed to extract file
    pause
    exit /b 1
)

echo Step 4: Cleaning up compressed file on server...
ssh -i "C:/Users/jakvo/Downloads/test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "rm /home/ec2-user/minstrel_data.tar.gz"

echo.
echo Download complete! minstrel_data folder is now in C:\Users\jakvo\Downloads\minstrel_data
echo.
pause

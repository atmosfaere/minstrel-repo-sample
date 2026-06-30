@echo off
echo Uploading minstrel_data folder to server...
echo.

echo Step 1: Compressing minstrel_data folder locally...
cd /d "C:\Users\jakvo\Downloads"
tar -czf minstrel_data.tar.gz minstrel_data

if %errorlevel% neq 0 (
    echo Error: Failed to compress minstrel_data folder
    pause
    exit /b 1
)

echo Step 2: Uploading compressed file to server...
scp -i "C:\Users\jakvo\Downloads\test.pem" minstrel_data.tar.gz ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com:/home/ec2-user/minstrel_data.tar.gz

if %errorlevel% neq 0 (
    echo Error: Failed to upload file
    pause
    exit /b 1
)

echo Step 3: Extracting minstrel_data folder on server...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "cd /home/ec2-user && rm -rf minstrel_data && tar -xzf minstrel_data.tar.gz && chown -R ec2-user:ec2-user minstrel_data"

if %errorlevel% neq 0 (
    echo Error: Failed to extract file on server
    pause
    exit /b 1
)

echo Step 4: Cleaning up compressed files...
ssh -i "C:\Users\jakvo\Downloads\test.pem" ec2-user@ec2-44-252-116-69.us-west-2.compute.amazonaws.com "rm /home/ec2-user/minstrel_data.tar.gz"
del "C:\Users\jakvo\Downloads\minstrel_data.tar.gz"

echo.
echo Upload complete! minstrel_data folder has been sent to /home/ec2-user/minstrel_data
echo.
pause

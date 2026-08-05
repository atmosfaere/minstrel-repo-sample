@echo off
cd /d %~dp0
docker-compose up -d
uvicorn app:app --host 0.0.0.0 --port 5004 --reload
pause

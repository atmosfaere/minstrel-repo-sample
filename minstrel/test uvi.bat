@echo off
cd /d %~dp0
uvicorn app:app --host 0.0.0.0 --port 5004 --reload
pause
@echo off
REM Okiru Computation Engine - Windows Batch Launcher
REM Start the backend API server

setlocal enabledelayedexpansion

REM Set default environment variables
if not defined ARANGO_URL set ARANGO_URL=http://127.0.0.1:8529
if not defined ARANGO_USER set ARANGO_USER=root
if not defined ARANGO_PASSWORD set ARANGO_PASSWORD=Okiru123!
if not defined ARANGO_DB set ARANGO_DB=okiru
if not defined REDIS_URL set REDIS_URL=redis://localhost:6379
if not defined API_HOST set API_HOST=127.0.0.1
if not defined API_PORT set API_PORT=8000
if not defined LOG_LEVEL set LOG_LEVEL=info

cd /d "%~dp0"
python run_server.py
pause

@echo off
REM Okiru Computation Engine - Windows Batch Launcher
REM Start the backend API server

setlocal enabledelayedexpansion

REM Set default environment variables
if not defined REDIS_URL set REDIS_URL=redis://localhost:6379
if not defined API_HOST set API_HOST=127.0.0.1
if not defined API_PORT set API_PORT=8000
if not defined LOG_LEVEL set LOG_LEVEL=info

cd /d "%~dp0"
python run_server.py
pause

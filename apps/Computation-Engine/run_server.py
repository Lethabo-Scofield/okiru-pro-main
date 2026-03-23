#!/usr/bin/env python3
"""
Okiru Computation Engine - FastAPI Server Launcher
Start the backend API server with all required environment variables.
"""
import os
import sys
from pathlib import Path

# Get the backend directory path
backend_dir = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_dir))

# Load environment variables from .env file if it exists
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

# Set defaults if not already set
os.environ.setdefault('ARANGO_URL', 'http://127.0.0.1:8529')
os.environ.setdefault('ARANGO_USER', 'root')
os.environ.setdefault('ARANGO_PASSWORD', 'Okiru123!')
os.environ.setdefault('ARANGO_DB', 'bbbee_db')
os.environ.setdefault('REDIS_URL', 'redis://localhost:6379')

import uvicorn

if __name__ == '__main__':
    uvicorn.run(
        'app.main:app',
        host=os.environ.get('API_HOST', '127.0.0.1'),
        port=int(os.environ.get('API_PORT', 8000)),
        reload=os.environ.get('API_RELOAD', 'true').lower() == 'true',
        log_level=os.environ.get('LOG_LEVEL', 'info')
    )

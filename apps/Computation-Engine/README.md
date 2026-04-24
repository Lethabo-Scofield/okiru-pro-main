# Okiru Computation Engine - Modular Package

A self-contained, modular backend service for uploading Excel-based scorecard models, compiling them into dependency graphs, and evaluating them on demand without re-running Excel.

## 📦 Package Contents

```
Computation-Engine/
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── api/               # API endpoints and models
│   │   ├── core/              # Configuration
│   │   ├── db/                # Database connections
│   │   ├── engine/            # Compilation & evaluation engine
│   │   ├── models/            # Data models
│   │   ├── routes/            # API routes
│   │   └── services/          # Business logic
│   ├── tests/                 # Unit tests
│   └── main.py                # FastAPI app entry point
├── docker/                    # Docker configurations
├── scripts/                   # Utility scripts
├── templates/                 # HTML/templates
├── docs/                      # Documentation
├── docker-compose.yml         # Docker Compose setup
├── requirements.txt           # Production dependencies
├── requirements-dev.txt       # Development dependencies
├── .env.example               # Environment variables template
├── run_server.py              # Python server launcher
├── run_server.bat             # Windows batch launcher
└── README.md                  # This file
```

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+**
- **Docker & Docker Compose** (for ArangoDB + Redis)
- **pip** or **venv**

### 1️⃣ Setup Dependencies

```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/Scripts/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2️⃣ Configure Environment

```bash
# Copy environment template
copy .env.example .env

# Edit .env with your settings (optional)
# Default values are already configured
```

### 3️⃣ Start Services

**Option A: With Docker (Recommended)**
```bash
docker compose up -d
```

**Option B: Without Docker (Development Only)**
```bash
# If you have ArangoDB & Redis running elsewhere, update .env with their addresses
# Skip this if using Docker
```

### 4️⃣ Start the API Server

**Windows:**
```bash
run_server.bat
```

**Linux/Mac:**
```bash
python run_server.py
```

### 5️⃣ Access Documentation

Open your browser to:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🔧 Configuration

Edit `.env` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `ARANGO_URL` | `http://127.0.0.1:8529` | ArangoDB server URL |
| `ARANGO_USER` | `root` | ArangoDB username |
| `ARANGO_PASSWORD` | `Okiru123!` | ArangoDB password |
| `ARANGO_DB` | `okiru` | ArangoDB database name |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `API_HOST` | `127.0.0.1` | API server host |
| `API_PORT` | `8000` | API server port |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warning/error) |
| `ALLOW_IN_MEMORY_DB` | `0` | Enable in-memory DB for testing |

## 📚 API Endpoints

### Admin Models
- `POST /admin/models/upload` - Upload Excel scorecard model
- `GET /admin/models` - List all models
- `GET /admin/models/{version_id}` - Get model details
- `POST /admin/models/{version_id}/evaluate` - Evaluate model

### Admin Operations
- `POST /admin/initialize` - Initialize system
- `GET /admin/health` - Health check

## 🧩 Architecture

### Upload Pipeline
```
Excel File → Validation → Compilation → Dependency Graph → Artifact Storage
```

### Evaluation Pipeline  
```
Load Artifact → Topological Sort → Compute Values → Return Results
```

## 📝 Development

### Install Dev Dependencies
```bash
pip install -r requirements-dev.txt
```

### Run Tests
```bash
pytest tests/ -v
```

### Run with Hot Reload
```bash
API_RELOAD=true python run_server.py
```

## 🐳 Docker Commands

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Remove volumes (WARNING: Data loss)
docker compose down -v
```

## 📤 Integration into Existing Project

### Method 1: Copy Folder
```bash
# Copy the Computation-Engine folder into your project
cp -r Computation-Engine /path/to/your/project/
```

### Method 2: Git Submodule
```bash
cd /path/to/your/project
git submodule add <repo-url> Computation-Engine
```

### Method 3: Python Package
Add to your project's `requirements.txt`:
```
# If published to PyPI
okiru-computation-engine>=2.0.0
```

### Usage in Your Project

In your main application:
```python
import sys
from pathlib import Path

# Add Computation-Engine to path
engine_path = Path(__file__).parent / "Computation-Engine" / "backend"
sys.path.insert(0, str(engine_path))

# Import and use
from app.main import app as computation_engine_app
from app.api.admin_models import router as models_router

# Mount as sub-application
main_app.mount("/computation-engine", computation_engine_app)
# Or include router
main_app.include_router(models_router)
```

## 🔐 Security Notes

- Change `ARANGO_PASSWORD` in `.env` for production
- Use environment-specific configurations
- Implement API authentication/authorization
- Enable HTTPS in production

## 📞 Support & Contribution

For issues or contributions, please refer to the main project repository.

## 📄 License

See LICENSE file in the project root.

---

**Version**: 2.0.0  
**Last Updated**: March 2026

# Quick Reference - Okiru Computation Engine

## 🚀 Quick Start Commands

### Windows
```cmd
# Start services
docker compose up -d

# Start API
run_server.bat

# Open Swagger UI
start http://localhost:8000/docs
```

### Linux/Mac
```bash
docker compose up -d

python run_server.py

open http://localhost:8000/docs
```

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/models/upload` | Upload Excel scorecard |
| `GET` | `/admin/models` | List all models |
| `GET` | `/admin/models/{id}` | Get model details |
| `POST` | `/admin/models/{id}/evaluate` | Evaluate model |
| `GET` | `/admin/health` | Health check |

## 🔧 Environment Variables

```bash
ARANGO_URL=http://127.0.0.1:8529    # Database server
ARANGO_DB=okiru                     # Database name
REDIS_URL=redis://localhost:6379    # Cache server
API_PORT=8000                       # API server port
API_RELOAD=true                     # Hot reload on code changes
```

## 📚 Key Files

- **`backend/app/main.py`** - FastAPI app entry point
- **`backend/app/api/admin_models.py`** - Model upload/evaluation endpoints
- **`backend/app/engine/`** - Compilation & evaluation logic
- **`backend/app/db/`** - Database connections

## 🐳 Docker Commands

```bash
docker compose up -d        # Start services
docker compose ps          # Show running containers
docker compose logs -f     # View logs
docker compose down        # Stop services
docker compose down -v     # Stop and remove volumes
```

## 🧪 Testing

```bash
pytest                     # Run all tests
pytest -v                  # Verbose output
pytest tests/test_engine.py  # Run specific test file
```

## 📊 System Architecture

```
Upload Flow:
Excel → Compile → Graph → Store

Evaluation Flow:
Load → Traverse → Compute → Return
```

## 🔗 URLs

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **ArangoDB UI**: http://localhost:8529
- **API Base**: http://localhost:8000

## ⚙️ Configuration Files

- **`.env`** - Environment variables (create from `.env.example`)
- **`requirements.txt`** - Python dependencies
- **`docker-compose.yml`** - Container definitions
- **`pytest.ini`** - Test configuration

## 🆘 Common Issues

| Issue | Solution |
|-------|----------|
| Connection refused | Docker not running: `docker compose up -d` |
| Port already in use | Change `API_PORT` in `.env` |
| Import errors | Verify path in `sys.path.insert()` |
| Module not found | Install dependencies: `pip install -r requirements.txt` |

## 📖 Documentation

- **README.md** - Full documentation
- **INTEGRATION_GUIDE.md** - Adding to existing projects
- **QUICK_REFERENCE.md** - This file

---

**Need help?** Check README.md for detailed documentation.

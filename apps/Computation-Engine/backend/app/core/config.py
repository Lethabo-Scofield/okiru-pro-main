from pydantic_settings import BaseSettings


class Settings(BaseSettings):

    ARANGO_URL: str = "http://127.0.0.1:8529"
    ARANGO_DB: str = "bbbee_db"
    ARANGO_USER: str = "root"
    ARANGO_PASSWORD: str = "Okiru123!"
    ARANGO_VERIFY_SSL: bool = False

    ALLOW_IN_MEMORY_DB: bool = False

    MAX_CELLS_PER_MODEL: int = 200_000
    MAX_EDGES_PER_MODEL: int = 200_000

    MODEL_REQUIRED_SHEETS: list[str] = []

settings = Settings()

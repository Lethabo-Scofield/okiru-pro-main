from pydantic_settings import BaseSettings


class Settings(BaseSettings):

    # ArangoDB is OPTIONAL. Leave ARANGO_URL empty (the default) and the engine
    # runs on its in-memory store. Set it to point compiled models at a real
    # ArangoDB again — the client path is intact, just no longer required.
    ARANGO_URL: str = ""
    ARANGO_DB: str = "bbbee_db"
    ARANGO_USER: str = "root"
    ARANGO_PASSWORD: str = ""
    ARANGO_VERIFY_SSL: bool = False

    # Force the in-memory store even when ARANGO_URL is set. Kept for the tests
    # that set it explicitly; normal deployments just leave ARANGO_URL empty.
    ALLOW_IN_MEMORY_DB: bool = False

    MAX_CELLS_PER_MODEL: int = 200_000
    MAX_EDGES_PER_MODEL: int = 200_000

    MODEL_REQUIRED_SHEETS: list[str] = []

    @property
    def use_in_memory_db(self) -> bool:
        """
        In-memory unless an ArangoDB URL is actually configured.

        This used to be `ALLOW_IN_MEMORY_DB` alone, defaulting to False, so an
        unreachable ArangoDB raised at import and took the whole API down. The
        engine now degrades instead of refusing to start, which matters because
        ArangoDB was retired: every collection it held was empty.
        """
        return self.ALLOW_IN_MEMORY_DB or not self.ARANGO_URL.strip()

settings = Settings()

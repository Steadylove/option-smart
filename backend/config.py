from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Longbridge
    longport_app_key: str = ""
    longport_app_secret: str = ""
    longport_access_token: str = ""

    # ZhipuAI (GLM-5)
    zhipuai_api_key: str = ""

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/option-smart.db"

    # Server
    backend_port: int = 8000
    frontend_port: int = 3000

    # Watched symbols
    watched_symbols: list[str] = ["TQQQ.US", "TSLL.US", "NVDL.US"]

    # Greeks calculation
    risk_free_rate: float = 0.043
    dividend_yields: dict[str, float] = {
        "TQQQ.US": 0.008,
        "TSLL.US": 0.0,
        "NVDL.US": 0.0,
    }

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

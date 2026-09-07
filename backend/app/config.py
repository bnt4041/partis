from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    cors_origins: str = "*"
    jwt_secret: str = ""
    database_url: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://partis:partis@db:5432/partis"
    jwt_secret: str = "change-me"
    jwt_expires_minutes: int = 60 * 24
    cors_origins: str = "*"

    class Config:
        env_file = ".env"


settings = Settings()

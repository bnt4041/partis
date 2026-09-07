from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://partis:partis@db:5432/partis"
    jwt_secret: str = "change-me"
    jwt_expires_minutes: int = 60 * 24
    cors_origins: str = "*"

    # Bootstrap: if no app_admin exists yet, one is created from these on
    # startup (there's no public sign-up, so without this nobody could ever
    # log in to create the first organization). Leave the password empty to
    # skip bootstrapping.
    admin_bootstrap_username: str = "admin"
    admin_bootstrap_password: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

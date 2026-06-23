from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    database_url: str = 'postgresql+asyncpg://postgres@localhost:5432/hr_ats_db'
    ollama_base_url: str = 'http://localhost:11434'
    ollama_model: str = 'llama3.2'
    storage_path: str = './storage/resumes'
    frontend_origin: str = 'http://localhost:3000'


@lru_cache
def get_settings() -> Settings:
    return Settings()

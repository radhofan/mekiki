from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    database_url: str = 'postgresql+asyncpg://postgres@localhost:5432/hr_ats_db'

    # LLM Settings (LiteLLM unified interface)
    # Default: Local Ollama ('ollama/llama3.2')
    # Other options:
    #   - OpenAI:   llm_model='gpt-4o', openai_api_key='sk-...'
    #   - Claude:   llm_model='claude-3-5-sonnet-20241022', anthropic_api_key='sk-ant-...'
    #   - Gemini:   llm_model='gemini/gemini-1.5-pro', gemini_api_key='AIza...'
    llm_model: str = 'ollama/llama3.2'
    llm_api_base: str = 'http://localhost:11434'
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None

    ollama_base_url: str = 'http://localhost:11434'
    ollama_model: str = 'llama3.2'
    storage_path: str = './storage/resumes'
    frontend_origin: str = 'http://localhost:3000'


@lru_cache
def get_settings() -> Settings:
    return Settings()

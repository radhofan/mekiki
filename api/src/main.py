import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from src.config import get_settings
from src.database import engine, AsyncSessionLocal
from src.models import Base, Candidate, CandidateEvaluation, JobRole
from src.routers import candidates, evaluations, leaderboard, roles
from src.schemas import StatsOut

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info('Starting up — creating tables if not exist...')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info('Database tables ready.')
    yield
    logger.info('Shutting down...')
    await engine.dispose()


app = FastAPI(
    title='Local AI ATS API',
    description='CV ranking engine powered by Ollama, FastAPI, and PostgreSQL',
    version='1.0.0',
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(roles.router)
app.include_router(candidates.router)
app.include_router(evaluations.router)
app.include_router(leaderboard.router)


# ── Health + Stats ────────────────────────────────────────────────────────────

@app.get('/health')
async def health_check() -> dict[str, str]:
    return {'status': 'ok', 'version': '1.0.0'}


@app.get('/api/stats', response_model=StatsOut)
async def get_stats() -> StatsOut:
    async with AsyncSessionLocal() as db:
        roles_count = (await db.execute(select(func.count()).select_from(JobRole))).scalar_one()
        candidates_count = (await db.execute(select(func.count()).select_from(Candidate))).scalar_one()
        evals_count = (await db.execute(select(func.count()).select_from(CandidateEvaluation))).scalar_one()
    return StatsOut(
        total_roles=roles_count,
        total_candidates=candidates_count,
        total_evaluations=evals_count,
    )

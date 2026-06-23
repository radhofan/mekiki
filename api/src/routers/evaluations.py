import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import AsyncSessionLocal, get_db
from src.models import Candidate, CandidateEvaluation, JobRole
from src.schemas import (
    BatchEvaluationResponse,
    EvaluationOut,
    LeaderboardEntry,
)
from src.services.ai_service import evaluate_candidate_with_ai

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/evaluate', tags=['evaluations'])


# ── Core evaluation logic (reused by single and batch) ───────────────────────

async def _run_evaluation(candidate_id: int, role_id: int, db: AsyncSession) -> CandidateEvaluation:
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Candidate not found')

    role = await db.get(JobRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Role not found')

    # Check for existing evaluation
    existing = await db.execute(
        select(CandidateEvaluation).where(
            CandidateEvaluation.candidate_id == candidate_id,
            CandidateEvaluation.role_id == role_id,
        )
    )
    existing_eval = existing.scalar_one_or_none()

    result = await evaluate_candidate_with_ai(
        cv_text=candidate.raw_text_extracted,
        role_title=role.title,
        role_description=role.description,
        required_skills=role.required_skills,
    )

    if existing_eval:
        # Update in place
        existing_eval.match_score = result.match_score
        existing_eval.qualification_status = result.status
        existing_eval.ai_justification = result.justification
        existing_eval.extracted_skills = result.identified_skills
        await db.commit()
        await db.refresh(existing_eval)
        return existing_eval

    evaluation = CandidateEvaluation(
        candidate_id=candidate_id,
        role_id=role_id,
        match_score=result.match_score,
        qualification_status=result.status,
        ai_justification=result.justification,
        extracted_skills=result.identified_skills,
    )
    db.add(evaluation)
    await db.commit()
    await db.refresh(evaluation)
    return evaluation


# ── Batch evaluation (background task) ───────────────────────────────────────

async def _batch_evaluate_task(role_id: int) -> None:
    '''Background task: evaluate all un-scored candidates for a role.'''
    async with AsyncSessionLocal() as db:
        # Fetch candidates WITHOUT an evaluation for this role
        subquery = (
            select(CandidateEvaluation.candidate_id)
            .where(CandidateEvaluation.role_id == role_id)
        )
        result = await db.execute(
            select(Candidate).where(Candidate.candidate_id.not_in(subquery))
        )
        candidates = result.scalars().all()

        logger.info('Batch evaluation: %d unscored candidates for role %d', len(candidates), role_id)

        for candidate in candidates:
            try:
                await _run_evaluation(candidate.candidate_id, role_id, db)
                logger.info(
                    'Batch: evaluated candidate %d for role %d', candidate.candidate_id, role_id
                )
            except Exception as exc:
                logger.error(
                    'Batch: failed for candidate %d: %s', candidate.candidate_id, exc
                )
                # Roll back any uncommitted state so the session stays clean for the next candidate
                await db.rollback()


@router.post('/batch/{role_id}', response_model=BatchEvaluationResponse)
async def batch_evaluate(
    role_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> BatchEvaluationResponse:
    '''
    Trigger background AI evaluation for all candidates not yet scored for this role.
    Returns immediately; processing continues in the background.
    '''
    role = await db.get(JobRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Role not found')

    # Count how many will be queued
    subquery = (
        select(CandidateEvaluation.candidate_id)
        .where(CandidateEvaluation.role_id == role_id)
    )
    result = await db.execute(
        select(Candidate).where(Candidate.candidate_id.not_in(subquery))
    )
    unscored = result.scalars().all()
    count = len(unscored)

    background_tasks.add_task(_batch_evaluate_task, role_id)

    return BatchEvaluationResponse(
        message=f'Batch evaluation queued for {count} candidate(s).',
        role_id=role_id,
        queued_count=count,
    )


# ── Single evaluation endpoint ────────────────────────────────────────────────

@router.post('/{candidate_id}/{role_id}', response_model=EvaluationOut)
async def evaluate_single(
    candidate_id: int,
    role_id: int,
    db: AsyncSession = Depends(get_db),
) -> EvaluationOut:
    '''Evaluate a single candidate against a role using Ollama AI.'''
    evaluation = await _run_evaluation(candidate_id, role_id, db)
    return EvaluationOut(
        evaluation_id=evaluation.evaluation_id,
        candidate_id=evaluation.candidate_id,
        role_id=evaluation.role_id,
        match_score=evaluation.match_score,
        qualification_status=evaluation.qualification_status,
        ai_justification=evaluation.ai_justification,
        extracted_skills=evaluation.extracted_skills,
        evaluated_at=evaluation.evaluated_at,
    )



# ── Leaderboard ───────────────────────────────────────────────────────────────

@router.get('/leaderboard/{role_id}', response_model=list[LeaderboardEntry])
async def get_leaderboard(
    role_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[LeaderboardEntry]:
    '''Return ranked candidates for a role sorted by match_score DESC.'''
    role = await db.get(JobRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Role not found')

    result = await db.execute(
        select(CandidateEvaluation, Candidate)
        .join(Candidate, CandidateEvaluation.candidate_id == Candidate.candidate_id)
        .where(CandidateEvaluation.role_id == role_id)
        .order_by(CandidateEvaluation.match_score.desc())
    )
    rows = result.all()

    leaderboard: list[LeaderboardEntry] = []
    for rank, (evaluation, candidate) in enumerate(rows, start=1):
        leaderboard.append(
            LeaderboardEntry(
                rank=rank,
                candidate_id=candidate.candidate_id,
                first_name=candidate.first_name,
                last_name=candidate.last_name,
                email=candidate.email,
                match_score=evaluation.match_score,
                qualification_status=evaluation.qualification_status,
                ai_justification=evaluation.ai_justification,
                extracted_skills=evaluation.extracted_skills,
                evaluated_at=evaluation.evaluated_at,
            )
        )

    return leaderboard

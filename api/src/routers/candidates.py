import logging
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.database import get_db
from src.models import Candidate
from src.schemas import CandidateOut, ParsedCandidateInfo
from src.services.ai_service import extract_candidate_info_with_ai
from src.services.pdf_service import extract_text_from_bytes, extract_text_from_pdf

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix='/api/candidates', tags=['candidates'])


@router.post('/upload', response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
async def upload_candidate(
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str | None = Form(None),
    phone: str | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> CandidateOut:
    '''
    Upload a candidate PDF resume.
    - Saves the file to local storage.
    - Extracts raw text from the PDF.
    - Creates a candidate record in the database.
    '''
    if file.content_type not in ('application/pdf', 'application/octet-stream'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Only PDF files are accepted.',
        )

    # ── Save file ─────────────────────────────────────────────────────────────
    storage_dir = Path(settings.storage_path)
    storage_dir.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r'[^\w\-.]', '_', file.filename or 'resume')
    unique_filename = f'{uuid.uuid4().hex}_{safe_name}'
    file_path = storage_dir / unique_filename

    try:
        with file_path.open('wb') as dest:
            shutil.copyfileobj(file.file, dest)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Failed to save file: {exc}',
        ) from exc
    finally:
        await file.close()

    # ── Extract text ──────────────────────────────────────────────────────────
    try:
        raw_text = extract_text_from_pdf(str(file_path))
    except (FileNotFoundError, ValueError) as exc:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Text extraction failed: {exc}',
        ) from exc

    # ── Sanitise extracted text ───────────────────────────────────────────────
    # Strip null bytes (0x00) and other control chars PostgreSQL UTF8 rejects
    raw_text = raw_text.replace('\x00', '').replace('\x0b', '').replace('\x0c', '')

    # ── Persist to DB ─────────────────────────────────────────────────────────
    candidate = Candidate(
        first_name=first_name,
        last_name=last_name,
        email=email or None,
        phone=phone or None,
        file_path=str(file_path),
        raw_text_extracted=raw_text,
    )
    db.add(candidate)
    try:
        await db.commit()
        await db.refresh(candidate)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Database error: {exc}',
        ) from exc

    logger.info('Candidate %d created (%s %s)', candidate.candidate_id, first_name, last_name)
    return CandidateOut.model_validate(candidate)


@router.get('/', response_model=list[CandidateOut])
async def list_candidates(db: AsyncSession = Depends(get_db)) -> list[CandidateOut]:
    from sqlalchemy import select
    result = await db.execute(select(Candidate).order_by(Candidate.created_at.desc()))
    candidates = result.scalars().all()
    return [CandidateOut.model_validate(c) for c in candidates]


@router.get('/{candidate_id}', response_model=CandidateOut)
async def get_candidate(candidate_id: int, db: AsyncSession = Depends(get_db)) -> CandidateOut:
    candidate = await db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Candidate not found')
    return CandidateOut.model_validate(candidate)


@router.post('/parse-info', response_model=ParsedCandidateInfo)
async def parse_candidate_info(
    file: UploadFile = File(...),
) -> ParsedCandidateInfo:
    '''
    Parse a candidate PDF resume to extract basic information:
    - Extracts raw text from the PDF bytes in-memory.
    - Uses regex to find the first email and phone number.
    - Uses Ollama (LLM) to extract first and last name.
    '''
    if file.content_type not in ('application/pdf', 'application/octet-stream'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Only PDF files are accepted.',
        )

    try:
        content = await file.read()
        raw_text = extract_text_from_bytes(content)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Text extraction failed: {exc}',
        ) from exc
    finally:
        await file.close()

    # ── Regex extraction for email & phone ──────────────────────────────────
    email = None
    # Match standard email pattern
    email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', raw_text)
    if email_match:
        email = email_match.group(0)

    phone = None
    # Match phone number formats
    phone_match = re.search(r'\+?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}', raw_text)
    if not phone_match:
        # A simpler fallback pattern for phone numbers
        phone_match = re.search(r'\+?\d[\d\s\(\)-]{7,18}\d', raw_text)
    if phone_match:
        phone = phone_match.group(0).strip()

    # ── AI extraction for name ──────────────────────────────────────────────
    ai_info = await extract_candidate_info_with_ai(raw_text)

    return ParsedCandidateInfo(
        first_name=ai_info.get('first_name', ''),
        last_name=ai_info.get('last_name', ''),
        email=email,
        phone=phone,
    )


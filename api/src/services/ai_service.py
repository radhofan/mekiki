import json
import logging
import re

import httpx

from src.config import get_settings
from src.schemas import LLMEvaluationResult

logger = logging.getLogger(__name__)

settings = get_settings()

# ── Prompt template ───────────────────────────────────────────────────────────

EVALUATION_PROMPT = '''You are a senior technical recruiter with 15 years of experience evaluating candidates.

Your task is to analyse a candidate CV against a specific job role and output a structured evaluation.

---
JOB ROLE TITLE: {title}

REQUIRED SKILLS:
{required_skills}

JOB DESCRIPTION:
{description}
---

CANDIDATE CV TEXT:
{cv_text}
---

INSTRUCTIONS:
- Carefully compare the CV text to the job role requirements.
- Be objective and technical. Do not invent skills not present in the CV.
- Respond with ONLY a single valid JSON object. No markdown fences, no preamble, no explanation outside the JSON.

OUTPUT SCHEMA (respond with exactly this structure):
{{
  "match_score": <integer 0-100>,
  "status": <"Highly Qualified" | "Qualified" | "Unqualified">,
  "justification": "<detailed multi-sentence explanation of the score and why>",
  "identified_skills": ["<skill1>", "<skill2>", ...]
}}

SCORING GUIDE:
- 80-100 → "Highly Qualified"  (strong match, most required skills present)
- 50-79  → "Qualified"         (partial match, some key skills present)
- 0-49   → "Unqualified"       (poor match, critical skills missing)
'''


def _strip_markdown_fences(raw: str) -> str:
    '''Remove ```json ... ``` or ``` ... ``` wrappers that LLMs sometimes add.'''
    raw = raw.strip()
    # Remove triple-backtick fences
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'\s*```$', '', raw)
    # Isolate the first JSON object in the string
    match = re.search(r'\{.*\}', raw, flags=re.DOTALL)
    if match:
        return match.group(0)
    return raw


async def evaluate_candidate_with_ai(
    cv_text: str,
    role_title: str,
    role_description: str,
    required_skills: str,
) -> LLMEvaluationResult:
    '''
    Send a structured prompt to the local Ollama instance.
    Returns a validated LLMEvaluationResult.
    Raises ValueError on parse failure.
    '''
    prompt = EVALUATION_PROMPT.format(
        title=role_title,
        required_skills=required_skills,
        description=role_description,
        cv_text=cv_text[:8000],  # Trim to avoid exceeding context window
    )

    payload = {
        'model': settings.ollama_model,
        'prompt': prompt,
        'stream': False,
        'format': 'json',  # Forces JSON mode on supported models
        'options': {
            'temperature': 0.1,   # Low temperature for deterministic structured output
            'num_predict': 1024,
        },
    }

    logger.info('Sending evaluation request to Ollama (model=%s)', settings.ollama_model)

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f'{settings.ollama_base_url}/api/generate',
            json=payload,
        )
        response.raise_for_status()

    data = response.json()
    raw_text: str = data.get('response', '')

    logger.debug('Raw Ollama response: %s', raw_text[:500])

    cleaned = _strip_markdown_fences(raw_text)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f'LLM returned invalid JSON: {exc}\nRaw: {raw_text[:300]}') from exc

    # Normalise field name: spec uses 'identified_skills', some models emit 'skills'
    if 'identified_skills' not in parsed and 'skills' in parsed:
        parsed['identified_skills'] = parsed.pop('skills')
    if 'identified_skills' not in parsed:
        parsed['identified_skills'] = []

    result = LLMEvaluationResult.model_validate(parsed)

    # Ensure status is consistent with score
    if result.match_score >= 80 and result.status != 'Highly Qualified':
        result = result.model_copy(update={'status': 'Highly Qualified'})
    elif 50 <= result.match_score < 80 and result.status not in ('Qualified', 'Highly Qualified'):
        result = result.model_copy(update={'status': 'Qualified'})
    elif result.match_score < 50 and result.status != 'Unqualified':
        result = result.model_copy(update={'status': 'Unqualified'})

    logger.info('Evaluation complete: score=%d status=%s', result.match_score, result.status)
    return result


# ── Candidate info extraction ─────────────────────────────────────────────────

NAME_EXTRACT_PROMPT = '''You are a data extraction assistant. Extract the candidate's personal information from the CV text below.

CV TEXT (first 3000 chars):
{cv_text}

Respond with ONLY a valid JSON object — no markdown, no explanation:
{{
  "first_name": "<first name only>",
  "last_name": "<last name / surname only>"
}}

Rules:
- Use the full first name (not initials).
- If you cannot confidently determine a value, use an empty string "".
'''


async def extract_candidate_info_with_ai(cv_text: str) -> dict[str, str]:
    '''
    Ask Ollama to extract first_name and last_name from CV text.
    Returns a dict with 'first_name' and 'last_name' keys.
    Falls back to empty strings on any failure.
    '''
    prompt = NAME_EXTRACT_PROMPT.format(cv_text=cv_text[:3000])

    payload = {
        'model': settings.ollama_model,
        'prompt': prompt,
        'stream': False,
        'format': 'json',
        'options': {'temperature': 0.0, 'num_predict': 128},
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f'{settings.ollama_base_url}/api/generate',
                json=payload,
            )
            response.raise_for_status()

        raw_text = response.json().get('response', '')
        cleaned = _strip_markdown_fences(raw_text)
        parsed = json.loads(cleaned)

        return {
            'first_name': str(parsed.get('first_name', '')).strip(),
            'last_name': str(parsed.get('last_name', '')).strip(),
        }
    except Exception as exc:
        logger.warning('Name extraction AI call failed: %s', exc)
        return {'first_name': '', 'last_name': ''}


import json
import logging
import os
import re
import typing
from typing import cast
import typing_extensions

if not hasattr(typing, 'NotRequired'):
    setattr(typing, 'NotRequired', typing_extensions.NotRequired)

import litellm
from litellm.types.utils import ModelResponse

from src.config import get_settings
from src.prompts import get_prompt_template
from src.schemas import LLMEvaluationResult

logger = logging.getLogger(__name__)

settings = get_settings()

# Disable telemetry
litellm.telemetry = False


def _setup_api_keys() -> None:
    if settings.openai_api_key:
        os.environ['OPENAI_API_KEY'] = settings.openai_api_key
    if settings.anthropic_api_key:
        os.environ['ANTHROPIC_API_KEY'] = settings.anthropic_api_key
    if settings.gemini_api_key:
        os.environ['GEMINI_API_KEY'] = settings.gemini_api_key


# ── Prompt templates from registry ────────────────────────────────────────────

EVALUATION_PROMPT = get_prompt_template('candidate_evaluation')


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
    Send a structured prompt using LiteLLM (defaults to local Ollama).
    Returns a validated LLMEvaluationResult.
    Raises ValueError on parse failure.
    '''
    _setup_api_keys()

    prompt = EVALUATION_PROMPT.format(
        title=role_title,
        required_skills=required_skills,
        description=role_description,
        cv_text=cv_text[:8000],  # Trim to avoid exceeding context window
    )

    logger.info('Sending evaluation request via LiteLLM (model=%s)', settings.llm_model)

    is_ollama = settings.llm_model.startswith('ollama')
    api_base = settings.llm_api_base if is_ollama else None

    raw_response = await litellm.acompletion(
        model=settings.llm_model,
        messages=[{'role': 'user', 'content': prompt}],
        api_base=api_base,
        temperature=0.1,
        response_format={'type': 'json_object'},
    )
    response = cast(ModelResponse, raw_response)
    raw_text = response.choices[0].message.content or ''
    logger.debug('Raw LLM response: %s', raw_text[:500])

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

NAME_EXTRACT_PROMPT = get_prompt_template('candidate_extraction')


async def extract_candidate_info_with_ai(cv_text: str) -> dict[str, str]:
    '''
    Ask LLM via LiteLLM to extract first_name and last_name from CV text.
    Returns a dict with 'first_name' and 'last_name' keys.
    Falls back to empty strings on any failure.
    '''
    _setup_api_keys()

    prompt = NAME_EXTRACT_PROMPT.format(cv_text=cv_text[:3000])

    is_ollama = settings.llm_model.startswith('ollama')
    api_base = settings.llm_api_base if is_ollama else None

    try:
        raw_response = await litellm.acompletion(
            model=settings.llm_model,
            messages=[{'role': 'user', 'content': prompt}],
            api_base=api_base,
            temperature=0.0,
            response_format={'type': 'json_object'},
        )
        response = cast(ModelResponse, raw_response)
        raw_text = response.choices[0].message.content or ''
        cleaned = _strip_markdown_fences(raw_text)
        parsed = json.loads(cleaned)

        return {
            'first_name': str(parsed.get('first_name', '')).strip(),
            'last_name': str(parsed.get('last_name', '')).strip(),
        }
    except Exception as exc:
        logger.warning('Name extraction AI call failed: %s', exc)
        return {'first_name': '', 'last_name': ''}



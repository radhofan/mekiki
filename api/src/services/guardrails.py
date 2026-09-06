import os
import re
from typing import Any, Dict, Tuple

# Disable OpenTelemetry and Guardrails background telemetry
os.environ['OTEL_SDK_DISABLED'] = 'true'
os.environ['GUARDRAILS_TELEMETRY'] = 'false'

from guardrails import Guard, OnFailAction
from guardrails.validators import (
    FailResult,
    PassResult,
    ValidationResult,
    Validator,
    register_validator,
)

HARDCODED_FALLBACK_MESSAGE = (
    'I apologize, but I am currently having trouble processing your request or querying the HR database. '
    'Please try again in a moment, or rephrase your question regarding candidates, job roles, or evaluations.'
)

INJECTION_PATTERNS = [
    r'ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts|rules)',
    r'disregard\s+(all\s+)?(previous|prior)\s+(instructions|prompts|rules)',
    r'(reveal|show|print|output|display)\s+(your\s+)?(system\s+prompt|initial\s+instructions|system\s+message)',
    r'you\s+are\s+now\s+(in\s+developer\s+mode|dan|jailbroken)',
    r'system\s+override',
    r'<\s*\|\s*im_start\s*\|>',
]

OUTPUT_SCRATCHPAD_PATTERNS = [
    r'^Thought:.*$',
    r'^Action:.*$',
    r'^Action Input:.*$',
    r'^Observation:.*$',
]


@register_validator(name='input_safety_guardrail', data_type='string')
class InputSafetyGuardrail(Validator):
    def __init__(self, max_length: int = 4000, on_fail: OnFailAction | None = OnFailAction.NOOP):
        super().__init__(on_fail=on_fail, max_length=max_length)
        self.max_length = max_length

    def _validate(self, value: Any, metadata: Dict[str, Any]) -> ValidationResult:
        if not isinstance(value, str) or not value.strip():
            return FailResult(
                error_message='Input cannot be empty.',
                fix_value='',
            )

        cleaned = value.strip()
        if len(cleaned) > self.max_length:
            return FailResult(
                error_message=f'Input exceeds the maximum allowed length of {self.max_length} characters.',
                fix_value=cleaned[: self.max_length],
            )

        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, cleaned, re.IGNORECASE):
                return FailResult(
                    error_message='Your request contains instructions that violate security guardrails.',
                    fix_value='',
                )

        return PassResult()


@register_validator(name='output_sanitization_guardrail', data_type='string')
class OutputSanitizationGuardrail(Validator):
    def __init__(self, fallback_message: str | None = None, on_fail: OnFailAction | None = OnFailAction.FIX):
        super().__init__(on_fail=on_fail, fallback_message=fallback_message)
        self.fallback_message = fallback_message or HARDCODED_FALLBACK_MESSAGE

    def _validate(self, value: Any, metadata: Dict[str, Any]) -> ValidationResult:
        if not isinstance(value, str) or not value.strip():
            return FailResult(
                error_message='Output cannot be empty.',
                fix_value=self.fallback_message,
            )

        cleaned = value.strip()
        for pattern in OUTPUT_SCRATCHPAD_PATTERNS:
            cleaned = re.sub(pattern, '', cleaned, flags=re.MULTILINE | re.IGNORECASE)

        cleaned = cleaned.strip()
        if not cleaned:
            return FailResult(
                error_message='Output contained only internal scratchpad traces.',
                fix_value=self.fallback_message,
            )

        if cleaned != value:
            return FailResult(
                error_message='Output contained internal scratchpad traces that were stripped.',
                fix_value=cleaned,
            )

        return PassResult()


# Lazy-loaded Guardrails AI Guard instances
_input_guard = None
_output_guard = None


def _get_input_guard() -> Guard:
    global _input_guard
    if _input_guard is None:
        _input_guard = Guard().use(InputSafetyGuardrail(on_fail=OnFailAction.NOOP))
    return _input_guard


def _get_output_guard() -> Guard:
    global _output_guard
    if _output_guard is None:
        _output_guard = Guard().use(OutputSanitizationGuardrail(on_fail=OnFailAction.FIX))
    return _output_guard


def validate_input_guardrail(text: str) -> Tuple[bool, str | None]:
    '''
    Uses Guardrails AI input guard to validate incoming prompt.
    Returns (is_valid, error_message).
    '''
    guard = _get_input_guard()
    result = guard.validate(text)
    if not result.validation_passed:
        error_msg = 'Your request violates input safety guardrails.'
        if result.error:
            error_msg = str(result.error)
        elif result.validation_summaries and len(result.validation_summaries) > 0:
            error_msg = result.validation_summaries[0].failure_reason or error_msg
        return False, error_msg
    return True, None


def sanitize_output_guardrail(text: str, fallback_message: str | None = None) -> str:
    '''
    Uses Guardrails AI output guard to sanitize model response.
    '''
    guard = _get_output_guard()
    result = guard.validate(text)
    if not result.validation_passed:
        return result.validated_output or fallback_message or HARDCODED_FALLBACK_MESSAGE
    return result.validated_output or text

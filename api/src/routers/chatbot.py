import asyncio
import contextvars
import logging
import re

from fastapi import APIRouter
from langchain_community.utilities import SQLDatabase
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import PromptTemplate
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from src.config import get_settings
from src.prompts import get_prompt_version
from src.services.guardrails import (
    HARDCODED_FALLBACK_MESSAGE,
    sanitize_output_guardrail,
    validate_input_guardrail,
)

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix='/api/chatbot', tags=['chatbot'])

# Synchronous DB engine for SQL queries (lazily connected)
_sync_engine: Engine | None = None
_db_instance: SQLDatabase | None = None


def _get_db() -> SQLDatabase:
    global _sync_engine, _db_instance
    if _db_instance is None:
        sync_db_url = settings.database_url.replace('+asyncpg', '')
        _sync_engine = create_engine(sync_db_url)
        _db_instance = SQLDatabase(
            _sync_engine,
            include_tables=['job_roles', 'candidates', 'candidate_evaluations'],
        )
    return _db_instance


def _get_chat_llm() -> ChatOllama:
    model_name = settings.llm_model
    if model_name.startswith('ollama/'):
        clean_model = model_name.replace('ollama/', '')
        return ChatOllama(
            model=clean_model,
            base_url=settings.llm_api_base,
            temperature=0.0,
        )
    return ChatOllama(
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
        temperature=0.0,
    )


SQL_PROMPT_TEMPLATE = '''You are a PostgreSQL expert. Given an input question, create a syntactically correct PostgreSQL query to run.
Return ONLY the raw SQL query without markdown code blocks, backticks, or preamble.

Only use the following tables and columns:
{table_info}

Question: {question}
SQL Query:'''

sql_prompt = PromptTemplate.from_template(SQL_PROMPT_TEMPLATE)


def _clean_sql(query_str: str) -> str:
    cleaned = query_str.strip()
    cleaned = re.sub(r'^```(?:sql)?\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    return cleaned.strip()


# Context variables to capture tool inputs/outputs per request with explicit type annotations
last_query_var: contextvars.ContextVar[str | None] = contextvars.ContextVar('last_query', default=None)
last_db_response_var: contextvars.ContextVar[str | None] = contextvars.ContextVar('last_db_response', default=None)


@tool
def query_database(question: str) -> str:
    '''
    Useful for querying candidate information, evaluation scores, match scores, job roles, email addresses, phone numbers, and candidate count or statistics.
    Input should be a complete natural language question in English.
    '''
    last_query_var.set(question)
    try:
        db = _get_db()
        chat_llm = _get_chat_llm()
        table_info = db.get_table_info()
        formatted_prompt = sql_prompt.format(table_info=table_info, question=question)
        sql_response = chat_llm.invoke(formatted_prompt)
        raw_sql = sql_response.content if hasattr(sql_response, 'content') else str(sql_response)
        clean_sql = _clean_sql(str(raw_sql))

        query_result = db.run(clean_sql)
        result_str = str(query_result).strip()
        last_db_response_var.set(result_str)
        return result_str
    except Exception as e:
        err_msg = f'Error executing database query: {e}'
        last_db_response_var.set(err_msg)
        return err_msg


def _get_agent():
    chat_llm = _get_chat_llm()
    prompt_info = get_prompt_version('chatbot_agent')
    system_prompt = prompt_info.system_role
    return create_react_agent(chat_llm, [query_database], state_modifier=system_prompt)


class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class ChatbotRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatbotResponse(BaseModel):
    message: str
    query_used: str | None = None
    db_response: str | None = None


@router.post('', response_model=ChatbotResponse)
async def chat_with_harry(request: ChatbotRequest) -> ChatbotResponse:
    '''
    Converse with Harry the Chatbot.
    Applies input guardrails, ReAct Agent execution with fallback to hardcoded message,
    and output guardrails.
    '''
    # 1. Input Guardrail: Validate and sanitize prompt input
    is_valid, violation_message = validate_input_guardrail(request.message)
    if not is_valid:
        return ChatbotResponse(
            message=violation_message or 'Input violates guardrail policy.',
            query_used=None,
            db_response=None,
        )

    # Reset context variables for this concurrent request execution
    last_query_var.set(None)
    last_db_response_var.set(None)

    # 2. Format history messages for LangGraph ReAct agent
    prompt_info = get_prompt_version('chatbot_agent')
    messages: list[BaseMessage] = [SystemMessage(content=prompt_info.system_role)]
    for msg in request.history[-5:]:  # limit context to last 5 messages
        if msg.role == 'user':
            messages.append(HumanMessage(content=msg.content))
        else:
            messages.append(AIMessage(content=msg.content))
    messages.append(HumanMessage(content=request.message))

    # 3. Invoke ReAct Agent with bounded retries and Fallback Chain
    raw_output: str = ''
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            agent = _get_agent()
            result = await asyncio.wait_for(
                agent.ainvoke({'messages': messages}),
                timeout=15.0,
            )
            last_msg = result['messages'][-1]
            extracted = str(last_msg.content).strip() if last_msg else ''
            if extracted:
                raw_output = extracted
                break
        except (TimeoutError, asyncio.TimeoutError) as exc:
            logger.warning('Chatbot attempt %d timed out after 15s: %s', attempt, exc)
        except Exception as exc:
            logger.warning('Chatbot attempt %d failed: %s', attempt, exc)

        if attempt < max_retries:
            await asyncio.sleep(1.0)

    if not raw_output:
        raw_output = HARDCODED_FALLBACK_MESSAGE

    # 4. Output Guardrail: Sanitize response and strip internal scratchpads
    safe_output = sanitize_output_guardrail(raw_output, fallback_message=HARDCODED_FALLBACK_MESSAGE)

    # 5. Retrieve captured tool inputs/outputs
    query_used = last_query_var.get()
    db_response = last_db_response_var.get()

    return ChatbotResponse(
        message=safe_output,
        query_used=query_used,
        db_response=db_response,
    )

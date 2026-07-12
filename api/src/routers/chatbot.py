import logging
import contextvars
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import create_engine

from src.config import get_settings
from llama_index.llms.ollama import Ollama
from llama_index.core import Settings as LlamaSettings
from llama_index.core.embeddings import MockEmbedding
from llama_index.core import SQLDatabase
from llama_index.core.query_engine import NLSQLTableQueryEngine

from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from langchain_core.prompts import PromptTemplate
from langchain_classic.agents import AgentExecutor, create_react_agent

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix='/api/chatbot', tags=['chatbot'])

# Initialize synchronous DB engine for LlamaIndex SQL queries
sync_db_url = settings.database_url.replace("+asyncpg", "")
sync_engine = create_engine(sync_db_url)

# Setup LlamaIndex Local configurations
llama_llm = Ollama(
    model=settings.ollama_model,
    base_url=settings.ollama_base_url,
    request_timeout=90.0
)
LlamaSettings.llm = llama_llm
LlamaSettings.embed_model = MockEmbedding(embed_dim=384)

# Create LlamaIndex SQL Database and Query Engine
sql_database = SQLDatabase(
    sync_engine,
    include_tables=["job_roles", "candidates", "candidate_evaluations"]
)
sql_query_engine = NLSQLTableQueryEngine(
    sql_database=sql_database,
    tables=["job_roles", "candidates", "candidate_evaluations"],
    llm=llama_llm
)

# Context variables to thread-safely capture tool inputs/outputs per request execution
last_query_var = contextvars.ContextVar("last_query", default=None)
last_db_response_var = contextvars.ContextVar("last_db_response", default=None)


@tool
def query_database(question: str) -> str:
    """
    Useful for querying candidate information, evaluation scores, match scores, job roles, email addresses, phone numbers, and candidate count or statistics.
    Input should be a complete natural language question in English.
    """
    last_query_var.set(question)
    try:
        response = sql_query_engine.query(question)
        response_str = str(response).strip()
        last_db_response_var.set(response_str)
        return response_str
    except Exception as e:
        err_msg = f"Error executing database query: {e}"
        last_db_response_var.set(err_msg)
        return err_msg


# Setup LangChain Chat Model for conversational flow
chat_llm = ChatOllama(
    model=settings.ollama_model,
    base_url=settings.ollama_base_url,
    temperature=0.0
)

# ReAct Agent Prompt Template
REACT_PROMPT_TEMPLATE = """You are Harry, HRFast's friendly HR assistant chatbot.
You help HR managers query candidate information, test scores, job roles, and open positions.

You have access to the following tools:

{tools}

To use a tool, please use the following format:

Thought: Do I need to use a tool? Yes
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

If you do not need to use a tool, or already have the answer, use the format:

Thought: Do I need to use a tool? No
Final Answer: [your friendly conversational answer here]

Previous chat history:
{chat_history}

New Question: {input}
Thought: {agent_scratchpad}"""

prompt = PromptTemplate.from_template(REACT_PROMPT_TEMPLATE)

# Create the LangChain ReAct agent
agent = create_react_agent(chat_llm, [query_database], prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=[query_database],
    verbose=True,
    handle_parsing_errors=True,
    max_iterations=4
)


class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class ChatbotRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class ChatbotResponse(BaseModel):
    message: str
    query_used: str | None = None
    db_response: str | None = None


@router.post('', response_model=ChatbotResponse)
async def chat_with_harry(request: ChatbotRequest) -> ChatbotResponse:
    '''
    Converse with Harry the Chatbot.
    Uses a native LangChain ReAct Agent to choose when to invoke the LlamaIndex SQL Query tool.
    '''
    try:
        # Reset context variables for this concurrent request execution
        last_query_var.set(None)
        last_db_response_var.set(None)

        # 1. Format history messages
        history_str = ""
        for msg in request.history[-5:]:  # limit context to last 5 messages
            role_label = "User" if msg.role == "user" else "Assistant"
            history_str += f"{role_label}: {msg.content}\n"

        # 2. Invoke the LangChain ReAct Agent Executor
        response = await agent_executor.ainvoke({
            "input": request.message,
            "chat_history": history_str
        })

        output_text = response.get("output", "").strip()
        if not output_text:
            output_text = "I apologize, I could not complete your request."

        # 3. Retrieve captured tool inputs/outputs
        query_used = last_query_var.get()
        db_response = last_db_response_var.get()

        return ChatbotResponse(
            message=output_text,
            query_used=query_used,
            db_response=db_response
        )

    except Exception as exc:
        logger.error("Chatbot agent error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chatbot agent failed: {exc}"
        )

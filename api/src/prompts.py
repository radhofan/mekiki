'''
Prompt registry and versioning system for AI agents and services.
'''

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class PromptVersion:
    version: str
    description: str
    template: str
    system_role: str


# ── Chatbot Agent Prompts (Harry the HR Assistant) ────────────────────────────

CHATBOT_AGENT_PROMPTS: Dict[str, PromptVersion] = {
    'v1.0.0': PromptVersion(
        version='v1.0.0',
        description='Standard ReAct prompt for Harry the HR Assistant',
        system_role='You are Harry, HRFast\'s friendly and knowledgeable HR assistant chatbot. You assist HR managers and recruiters with candidate lookups, test scores, candidate evaluations, job roles, and hiring metrics.',
        template='''You are Harry, HRFast's friendly HR assistant chatbot.
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
Thought: {agent_scratchpad}''',
    ),
}

# ── Candidate Evaluation Prompts ──────────────────────────────────────────────

CANDIDATE_EVALUATION_PROMPTS: Dict[str, PromptVersion] = {
    'v1.0.0': PromptVersion(
        version='v1.0.0',
        description='Senior technical recruiter CV evaluation prompt',
        system_role='You are a senior technical recruiter with 15 years of experience evaluating candidates.',
        template='''You are a senior technical recruiter with 15 years of experience evaluating candidates.

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
''',
    ),
}

# ── Candidate Info Extraction Prompts ─────────────────────────────────────────

CANDIDATE_EXTRACTION_PROMPTS: Dict[str, PromptVersion] = {
    'v1.0.0': PromptVersion(
        version='v1.0.0',
        description='Candidate name and personal info extraction prompt',
        system_role='You are a structured data extraction assistant specializing in resume parsing.',
        template='''You are a data extraction assistant. Extract the candidate's personal information from the CV text below.

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
''',
    ),
}

# ── Registry Lookup Helper ───────────────────────────────────────────────────

PROMPT_REGISTRY: Dict[str, Dict[str, PromptVersion]] = {
    'chatbot_agent': CHATBOT_AGENT_PROMPTS,
    'candidate_evaluation': CANDIDATE_EVALUATION_PROMPTS,
    'candidate_extraction': CANDIDATE_EXTRACTION_PROMPTS,
}


def get_prompt_version(prompt_name: str, version: Optional[str] = None) -> PromptVersion:
    '''
    Retrieve a specific version of a prompt from the registry.
    Defaults to the latest version if no version is specified.
    '''
    if prompt_name not in PROMPT_REGISTRY:
        raise KeyError(f'Prompt "{prompt_name}" not found in prompt registry.')

    versions = PROMPT_REGISTRY[prompt_name]
    if not versions:
        raise ValueError(f'No prompt versions available for "{prompt_name}".')

    if version is not None:
        if version not in versions:
            raise KeyError(f'Version "{version}" not found for prompt "{prompt_name}". Available: {list(versions.keys())}')
        return versions[version]

    # Return latest version (last key in insertion order)
    latest_key = list(versions.keys())[-1]
    return versions[latest_key]


def get_prompt_template(prompt_name: str, version: Optional[str] = None) -> str:
    '''Helper to get just the template string for a prompt.'''
    return get_prompt_version(prompt_name, version).template

from __future__ import annotations

import json

from openai import OpenAI

from .schemas import ENTRY_CATEGORIES, ENTRY_PRIORITIES


SYSTEM_PROMPT = """
You classify personal inbox entries written in Norwegian or English.
Return only JSON.
Choose category only from the allowed categories.
Choose priority only from the allowed priorities.
If no due date is clearly present, return null.
Detect all allowed categories when possible.
Work is especially important: prefer category 'work' when the text is clearly work-related.
Use priority 'high' when the text contains clearly urgent language.
""".strip()


def classify_entry(api_key: str, model: str, text_input: str, current_time: str):
    client = OpenAI(api_key=api_key)
    prompt = {
        'textInput': text_input,
        'currentTime': current_time,
        'languages': ['Norwegian', 'English'],
        'allowedCategories': ENTRY_CATEGORIES,
        'allowedPriorities': ENTRY_PRIORITIES,
        'requiredOutput': {
            'category': 'one of allowedCategories',
            'priority': 'one of allowedPriorities',
            'dueDate': 'ISO-8601 datetime string or null',
            'summary': 'short Norwegian summary',
        },
    }

    response = client.responses.create(
        model=model,
        input=[
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': json.dumps(prompt, ensure_ascii=True)},
        ],
        temperature=0,
    )

    return json.loads(response.output_text)

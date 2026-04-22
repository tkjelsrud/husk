from __future__ import annotations

import json
import subprocess

from .schemas import ENTRY_CATEGORIES, ENTRY_PRIORITIES


SYSTEM_PROMPT = """
You classify personal inbox entries written in Norwegian or English.
Return only compact JSON.
Choose category only from the allowed categories.
Choose priority only from the allowed priorities.
If no due date is clearly present, return null.
Detect all allowed categories when possible.
Work is especially important: prefer category 'work' when the text is clearly work-related.
Use priority 'high' when the text contains clearly urgent language.
""".strip()


def classify_entry(model: str, text_input: str, current_time: str):
    prompt = {
        'system': SYSTEM_PROMPT,
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

    command = ['opencode', 'run']
    if model:
        command.extend(['--model', model])
    command.append(json.dumps(prompt, ensure_ascii=True))

    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )

    output = completed.stdout.strip()
    return json.loads(output)

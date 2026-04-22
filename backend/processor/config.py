from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / 'backend' / '.env'
load_dotenv(ENV_PATH)


@dataclass(frozen=True)
class Settings:
    opencode_bin: str
    opencode_model: str
    firebase_project_id: str
    firebase_service_account_path: str
    poll_limit: int


def load_settings() -> Settings:
    return Settings(
        opencode_bin=os.environ.get('OPENCODE_BIN', 'opencode').strip() or 'opencode',
        opencode_model=os.environ.get('OPENCODE_MODEL', '').strip(),
        firebase_project_id=os.environ['FIREBASE_PROJECT_ID'],
        firebase_service_account_path=os.environ['FIREBASE_SERVICE_ACCOUNT_PATH'],
        poll_limit=int(os.environ.get('POLL_LIMIT', '10')),
    )

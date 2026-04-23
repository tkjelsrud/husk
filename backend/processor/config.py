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
    firebase_service_account_path: str | None
    google_calendar_id: str
    google_oauth_client_path: str | None
    google_oauth_client_id: str | None
    google_oauth_client_secret: str | None
    google_oauth_token_path: str | None
    poll_limit: int


def load_settings() -> Settings:
    service_account_path = os.environ.get('FIREBASE_SERVICE_ACCOUNT_PATH', '').strip() or None
    return Settings(
        opencode_bin=os.environ.get('OPENCODE_BIN', 'opencode').strip() or 'opencode',
        opencode_model=os.environ.get('OPENCODE_MODEL', '').strip(),
        firebase_project_id=os.environ['FIREBASE_PROJECT_ID'],
        firebase_service_account_path=service_account_path,
        google_calendar_id=os.environ.get('GOOGLE_CALENDAR_ID', '').strip(),
        google_oauth_client_path=os.environ.get('GOOGLE_OAUTH_CLIENT_PATH', '').strip() or None,
        google_oauth_client_id=os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '').strip() or None,
        google_oauth_client_secret=os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '').strip() or None,
        google_oauth_token_path=os.environ.get('GOOGLE_OAUTH_TOKEN_PATH', '').strip() or None,
        poll_limit=int(os.environ.get('POLL_LIMIT', '10')),
    )

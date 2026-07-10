import base64
import hashlib
import hmac
import secrets
from datetime import datetime

from .models import Account


_active_tokens: dict[str, int] = {}


def hash_password(password: str, salt: str | None = None) -> str:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), password_salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${password_salt}${base64.b64encode(digest).decode('ascii')}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, salt, _expected_digest = password_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    return hmac.compare_digest(hash_password(password, salt), password_hash)


def create_access_token(account_id: int) -> str:
    token = secrets.token_urlsafe(32)
    _active_tokens[token] = account_id
    return token


def get_account_id_for_token(token: str) -> int | None:
    return _active_tokens.get(token)


def account_created_at_now() -> str:
    return datetime.now().isoformat(sep=" ", timespec="seconds")


def public_account(account_id: int, username: str, role: str, created_at: object) -> Account:
    if hasattr(created_at, "isoformat"):
        created = created_at.isoformat(sep=" ", timespec="seconds")
    else:
        created = str(created_at)
    return Account(id=account_id, username=username, role=role, createdAt=created)

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
import bcrypt

# Session timeout: 8 hours
SESSION_TIMEOUT = timedelta(hours=8)

# Hardcoded credentials
# Pre-hashed password for "pypyc2admin"
# To change the password: use bcrypt.hashpw(b"newpassword", bcrypt.gensalt()).decode('utf-8')
USERS = {
    "admin": {
        "password_hash": "$2b$12$i8gtnsQs7HDqKw2pB8Ppg.vL558JTGu9nkOc8FPAt.yofdLGAeQj6",  # pypyc2admin
        "role": "admin"
    }
}

# In-memory session storage: token -> session data
sessions: Dict[str, Dict] = {}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password using bcrypt"""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def authenticate_user(username: str, password: str) -> Optional[Dict]:
    """
    Authenticate a user with username and password
    Returns user data if authentication succeeds, None otherwise
    """
    if username not in USERS:
        return None

    user = USERS[username]
    if not verify_password(password, user["password_hash"]):
        return None

    return {
        "username": username,
        "role": user["role"]
    }


def generate_token() -> str:
    """Generate a unique session token"""
    return str(uuid.uuid4())


def create_session(username: str) -> str:
    """
    Create a new session for a user
    Returns the session token
    """
    token = generate_token()
    now = datetime.now(timezone.utc)

    sessions[token] = {
        "username": username,
        "role": USERS[username]["role"],
        "created_at": now,
        "last_activity": now
    }

    return token


def validate_session(token: str) -> Optional[Dict]:
    """
    Validate a session token and check if it's still active
    Returns session data if valid, None otherwise
    Also updates last_activity timestamp if valid
    """
    if token not in sessions:
        return None

    session = sessions[token]
    now = datetime.now(timezone.utc)

    # Check if session has expired
    time_since_activity = now - session["last_activity"]
    if time_since_activity > SESSION_TIMEOUT:
        # Session expired, remove it
        del sessions[token]
        return None

    # Update last activity
    session["last_activity"] = now

    return {
        "username": session["username"],
        "role": session["role"],
        "token": token
    }


def revoke_session(token: str) -> bool:
    """
    Revoke a session (logout)
    Returns True if session was found and revoked, False otherwise
    """
    if token in sessions:
        del sessions[token]
        return True
    return False


def cleanup_expired_sessions():
    """Remove all expired sessions from storage"""
    now = datetime.now(timezone.utc)
    expired_tokens = [
        token for token, session in sessions.items()
        if now - session["last_activity"] > SESSION_TIMEOUT
    ]

    for token in expired_tokens:
        del sessions[token]

    return len(expired_tokens)


def get_active_sessions_count() -> int:
    """Get the count of active sessions"""
    return len(sessions)

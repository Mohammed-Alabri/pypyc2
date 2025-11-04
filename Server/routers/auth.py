"""
Authentication Routes
Handles user login, logout, and session validation
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from core import security


router = APIRouter(prefix="/auth", tags=["authentication"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    role: str
    message: str


class LogoutResponse(BaseModel):
    status: str
    message: str


class VerifyResponse(BaseModel):
    authenticated: bool
    username: Optional[str] = None
    role: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    """
    Authenticate user and create a session
    Returns a bearer token for subsequent requests
    """
    # Authenticate user
    user = security.authenticate_user(credentials.username, credentials.password)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    # Create session and generate token
    token = security.create_session(credentials.username)

    # Clean up expired sessions periodically
    security.cleanup_expired_sessions()

    return LoginResponse(
        token=token,
        username=user["username"],
        role=user["role"],
        message="Login successful"
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(authorization: str = Header(...)):
    """
    Logout user and revoke session token
    Expects: Authorization header with Bearer token
    """
    # Extract token from Authorization header
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format"
        )

    token = authorization.replace("Bearer ", "")

    # Revoke session (idempotent - succeeds even if session not found)
    revoked = security.revoke_session(token)

    return LogoutResponse(
        status="success",
        message="Logged out successfully" if revoked else "Already logged out"
    )


@router.get("/verify", response_model=VerifyResponse)
async def verify_token(authorization: str = Header(...)):
    """
    Verify if a token is valid and active
    Expects: Authorization header with Bearer token
    """
    # Extract token from Authorization header
    if not authorization.startswith("Bearer "):
        return VerifyResponse(authenticated=False)

    token = authorization.replace("Bearer ", "")

    # Validate session
    session = security.validate_session(token)

    if not session:
        return VerifyResponse(authenticated=False)

    return VerifyResponse(
        authenticated=True,
        username=session["username"],
        role=session["role"]
    )

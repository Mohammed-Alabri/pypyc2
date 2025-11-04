from fastapi import Header, HTTPException
from typing import Dict
from core import security


async def get_current_user(authorization: str = Header(...)) -> Dict:
    """
    FastAPI dependency to validate authentication for protected routes

    Extracts and validates the Bearer token from the Authorization header.
    Returns user information if valid, raises 401 HTTPException otherwise.

    Usage:
        @app.get("/protected")
        def protected_route(user: Dict = Depends(get_current_user)):
            return {"message": f"Hello {user['username']}"}
    """
    # Check Authorization header format
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format. Expected: 'Bearer <token>'"
        )

    # Extract token
    token = authorization.replace("Bearer ", "")

    # Validate session
    session = security.validate_session(token)

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please login again."
        )

    return {
        "username": session["username"],
        "role": session["role"],
        "token": session["token"]
    }

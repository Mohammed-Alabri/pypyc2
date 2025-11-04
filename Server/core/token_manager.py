"""
Payload Token Manager - Security component for payload endpoint protection
"""

import secrets
import threading
import time


class PayloadTokenManager:
    """
    Manages time-based rotating tokens for payload endpoint protection.
    Tokens rotate every TOKEN_LIFETIME seconds to prevent unauthorized access.
    """
    TOKEN_LIFETIME = 300  # 5 minutes (300 seconds)

    def __init__(self):
        self.current_token = self._generate_token()
        self.token_created_at = time.time()
        self._start_rotation_thread()

    def _generate_token(self) -> str:
        """Generate a cryptographically secure random token"""
        return secrets.token_urlsafe(16)

    def _rotate_token(self):
        """Rotate the token (called by background thread)"""
        self.current_token = self._generate_token()
        self.token_created_at = time.time()
        print(f"[*] Payload token rotated: {self.current_token[:8]}... (expires in {self.TOKEN_LIFETIME}s)")

    def _rotation_worker(self):
        """Background thread that rotates tokens periodically"""
        while True:
            time.sleep(self.TOKEN_LIFETIME)
            self._rotate_token()

    def _start_rotation_thread(self):
        """Start the background token rotation thread"""
        thread = threading.Thread(target=self._rotation_worker, daemon=True)
        thread.start()
        print(f"[*] Payload token manager started. Initial token: {self.current_token[:8]}...")

    def get_current_token(self) -> str:
        """Get the current valid token"""
        return self.current_token

    def get_time_until_expiry(self) -> int:
        """Get seconds until token expires"""
        elapsed = time.time() - self.token_created_at
        remaining = max(0, int(self.TOKEN_LIFETIME - elapsed))
        return remaining

    def validate_token(self, token: str) -> bool:
        """Validate if provided token matches current valid token"""
        return token == self.current_token

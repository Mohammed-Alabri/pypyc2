"""
Encoding Detection Utilities
Handles encoding detection for uploaded files from agents
"""

from typing import Tuple, Optional
import chardet


def detect_file_encoding(file_content: bytes, file_name: str = "") -> Tuple[str, str, bool]:
    """
    Detect the encoding of a file and decode it.

    Args:
        file_content: Raw bytes of the file
        file_name: Optional filename for context

    Returns:
        Tuple of (decoded_content, detected_encoding, is_binary)
        - decoded_content: The file content as string (or error message for binary files)
        - detected_encoding: The detected encoding name (e.g., 'utf-8', 'binary')
        - is_binary: True if file is binary, False if text
    """
    # Check if file appears to be binary (contains null bytes)
    if b'\x00' in file_content:
        return "Binary file - cannot display as text", "binary", True

    # Try to detect encoding using chardet
    detection = chardet.detect(file_content)
    detected_encoding = detection.get('encoding', 'utf-8')
    confidence = detection.get('confidence', 0)

    # List of encodings to try in order of preference
    encodings_to_try = [
        detected_encoding,
        'utf-8',
        'utf-8-sig',  # UTF-8 with BOM
        'latin-1',
        'cp1252',     # Windows-1252
        'iso-8859-1',
        'ascii'
    ]

    # Remove duplicates while preserving order
    seen = set()
    encodings_to_try = [x for x in encodings_to_try if x and x.lower() not in seen and not seen.add(x.lower())]

    # Try each encoding
    last_error = None
    for encoding in encodings_to_try:
        try:
            decoded_content = file_content.decode(encoding)
            return decoded_content, encoding, False
        except (UnicodeDecodeError, LookupError) as e:
            last_error = e
            continue

    # If all encodings failed, treat as binary
    return f"Could not decode file - likely binary. Last error: {str(last_error)}", "binary", True


def detect_encoding_only(file_content: bytes) -> str:
    """
    Detect only the encoding name without decoding.

    Args:
        file_content: Raw bytes of the file

    Returns:
        The detected encoding name (e.g., 'utf-8', 'binary')
    """
    if b'\x00' in file_content:
        return "binary"

    detection = chardet.detect(file_content)
    return detection.get('encoding', 'utf-8') or 'utf-8'

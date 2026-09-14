"""PIN 해싱 및 검증 유틸리티.

작업자 식별용 — 실제 보안 인증이 아님.
4자리 PIN으로 작업자를 식별하는 경량 인증 헬퍼.
"""

import base64
import hashlib
import hmac

from fastapi import HTTPException

DEFAULT_PIN = "0000"
PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_SALT_BYTES = 16
PBKDF2_DIGEST_BYTES = 32
_MAX_ACCEPTED_ITERATIONS = 2_000_000
_MAX_ITERATIONS_TEXT_LENGTH = len(str(_MAX_ACCEPTED_ITERATIONS))
_PBKDF2_SALT_ENCODED_LENGTH = 24
_PBKDF2_DIGEST_ENCODED_LENGTH = 44
_MAX_PBKDF2_HASH_LENGTH = (
    len(PBKDF2_ALGORITHM)
    + 3
    + _MAX_ITERATIONS_TEXT_LENGTH
    + _PBKDF2_SALT_ENCODED_LENGTH
    + _PBKDF2_DIGEST_ENCODED_LENGTH
)
_BASE64URL_ALPHABET = frozenset(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
)


def validate_pin(pin: str) -> None:
    """PIN이 정확히 4자리 숫자인지 검증. 아니면 HTTP 422."""
    if not (len(pin) == 4 and pin.isdigit()):
        raise HTTPException(status_code=422, detail="PIN 은 4자리 숫자여야 합니다")


def hash_pin(pin: str) -> str:
    """PIN 문자열을 SHA-256 해시로 변환."""
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def _encode(value: bytes) -> str:
    """PBKDF2 구성 요소를 canonical URL-safe Base64로 인코딩한다."""
    return base64.urlsafe_b64encode(value).decode("ascii")


def _decode(value: str) -> bytes:
    """검증을 마친 Base64 구성 요소를 엄격하게 디코딩한다."""
    return base64.b64decode(value.encode("ascii"), altchars=b"-_", validate=True)


def _is_legacy_sha256(value: str) -> bool:
    """레거시 소문자 SHA-256 hex 형식인지 판별한다."""
    return len(value) == 64 and all(
        character in "0123456789abcdef" for character in value
    )


def _has_canonical_base64url_shape(
    value: str,
    *,
    encoded_length: int,
    padding: str,
) -> bool:
    """디코딩 전에 고정 길이와 URL-safe alphabet을 제한한다."""
    if len(value) != encoded_length or not value.endswith(padding):
        return False
    return all(
        character in _BASE64URL_ALPHABET for character in value[: -len(padding)]
    )


def _verify_pbkdf2(stored_hash: str, input_pin: str) -> bool:
    """비용과 구성 요소 크기를 제한하며 canonical PBKDF2 해시를 검증한다."""
    if len(stored_hash) > _MAX_PBKDF2_HASH_LENGTH:
        return False
    segments = stored_hash.split("$")
    if len(segments) != 4:
        return False
    algorithm, iterations_text, salt_text, digest_text = segments
    if (
        algorithm != PBKDF2_ALGORITHM
        or not iterations_text
        or len(iterations_text) > _MAX_ITERATIONS_TEXT_LENGTH
        or not iterations_text.isascii()
        or not iterations_text.isdigit()
        or iterations_text.startswith("0")
        or not _has_canonical_base64url_shape(
            salt_text,
            encoded_length=_PBKDF2_SALT_ENCODED_LENGTH,
            padding="==",
        )
        or not _has_canonical_base64url_shape(
            digest_text,
            encoded_length=_PBKDF2_DIGEST_ENCODED_LENGTH,
            padding="=",
        )
    ):
        return False
    iterations = int(iterations_text)
    if iterations > _MAX_ACCEPTED_ITERATIONS:
        return False
    try:
        salt = _decode(salt_text)
        expected = _decode(digest_text)
    except (UnicodeError, ValueError):
        return False
    if (
        len(salt) != PBKDF2_SALT_BYTES
        or len(expected) != PBKDF2_DIGEST_BYTES
        or _encode(salt) != salt_text
        or _encode(expected) != digest_text
    ):
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256",
        input_pin.encode("utf-8"),
        salt,
        iterations,
        dklen=PBKDF2_DIGEST_BYTES,
    )
    return hmac.compare_digest(actual, expected)


def verify_pin(stored_hash: str | None, input_pin: str) -> bool:
    """PBKDF2 또는 legacy SHA-256 해시를 읽기 전용으로 검증한다."""
    if stored_hash is None:
        return hmac.compare_digest(hash_pin(input_pin), DEFAULT_PIN_HASH)
    if stored_hash.startswith(f"{PBKDF2_ALGORITHM}$"):
        return _verify_pbkdf2(stored_hash, input_pin)
    if not _is_legacy_sha256(stored_hash):
        return False
    return hmac.compare_digest(stored_hash, hash_pin(input_pin))


DEFAULT_PIN_HASH: str = hash_pin(DEFAULT_PIN)

"""직원 PIN의 버전형 해시 생성과 legacy 검증."""

from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import hmac
import secrets


DEFAULT_PIN = "0000"
PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600_000
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


def _legacy_hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


# 마이그레이션과 legacy fixture 판별 전용이다. 신규 저장에는 사용하지 않는다.
DEFAULT_PIN_HASH: str = _legacy_hash_pin(DEFAULT_PIN)


@dataclass(frozen=True)
class PinVerificationResult:
    """검증 결과와 같은 transaction에서 저장할 선택적 업그레이드 해시."""

    is_valid: bool
    upgraded_hash: str | None = None


def validate_pin(pin: str) -> None:
    """PIN이 정확히 4자리 숫자인지 검증한다."""
    if not (len(pin) == 4 and pin.isascii() and pin.isdigit()):
        raise ValueError("PIN 은 4자리 숫자여야 합니다")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _decode(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"), altchars=b"-_", validate=True)


def hash_pin(pin: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    """각 credential마다 새 salt를 사용하는 PBKDF2-HMAC-SHA256 해시를 만든다."""
    if not isinstance(iterations, int) or not (
        PBKDF2_ITERATIONS <= iterations <= _MAX_ACCEPTED_ITERATIONS
    ):
        raise ValueError("iterations must use the approved PBKDF2 work factor")
    salt = secrets.token_bytes(PBKDF2_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        iterations,
        dklen=PBKDF2_DIGEST_BYTES,
    )
    return f"{PBKDF2_ALGORITHM}${iterations}${_encode(salt)}${_encode(digest)}"


def _is_legacy_sha256(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdef" for character in value)


def _has_canonical_base64url_shape(
    value: str,
    *,
    encoded_length: int,
    padding: str,
) -> bool:
    if len(value) != encoded_length or not value.endswith(padding):
        return False
    return all(character in _BASE64URL_ALPHABET for character in value[: -len(padding)])


def _verify_pbkdf2(stored_hash: str, input_pin: str) -> bool:
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


def verify_pin_and_upgrade(
    stored_hash: str | None,
    input_pin: str,
) -> PinVerificationResult:
    """PBKDF2와 legacy SHA-256을 검증하고 legacy 성공 시 새 해시를 반환한다."""
    if stored_hash is None:
        valid = hmac.compare_digest(input_pin, DEFAULT_PIN)
        return PinVerificationResult(valid, hash_pin(input_pin) if valid else None)
    if stored_hash.startswith(f"{PBKDF2_ALGORITHM}$"):
        valid = _verify_pbkdf2(stored_hash, input_pin)
        if not valid:
            return PinVerificationResult(False)
        iterations = int(stored_hash.split("$", 2)[1])
        upgraded_hash = hash_pin(input_pin) if iterations < PBKDF2_ITERATIONS else None
        return PinVerificationResult(True, upgraded_hash)
    if not _is_legacy_sha256(stored_hash):
        return PinVerificationResult(False)
    valid = hmac.compare_digest(stored_hash, _legacy_hash_pin(input_pin))
    return PinVerificationResult(valid, hash_pin(input_pin) if valid else None)


def verify_pin(stored_hash: str | None, input_pin: str) -> bool:
    """저장 형식과 무관하게 PIN을 검증한다."""
    return verify_pin_and_upgrade(stored_hash, input_pin).is_valid

"""Friday PIN 계약에 PBKDF2 읽기 호환성을 추가하는 회귀 테스트."""

from __future__ import annotations

import base64
import hashlib

import pytest
from fastapi import HTTPException

from app.services import pin_auth
from app.services.pin_auth import (
    DEFAULT_PIN_HASH,
    hash_pin,
    validate_pin,
    verify_pin,
)


def _encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _pbkdf2_hash(pin: str, *, iterations: int = 600_000) -> str:
    salt = b"compat-test-salt"
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        iterations,
        dklen=32,
    )
    return f"pbkdf2_sha256${iterations}${_encoded(salt)}${_encoded(digest)}"


def test_verify_pin_accepts_valid_pbkdf2_hash() -> None:
    assert verify_pin(_pbkdf2_hash("2468"), "2468") is True


def test_verify_pin_rejects_wrong_pin_for_pbkdf2_hash() -> None:
    assert verify_pin(_pbkdf2_hash("2468"), "1357") is False


@pytest.mark.parametrize(
    "stored_hash",
    [
        "pbkdf2_sha256$600000$broken",
        "pbkdf2_sha256$0$AA==$AA==",
        f"pbkdf2_sha256$600000${'A' * 4096}${_encoded(b'd' * 32)}",
        "１２３４" * 16,
    ],
    ids=["missing-segment", "zero-iterations", "oversized-salt", "non-ascii"],
)
def test_malformed_stored_hash_fails_closed(stored_hash: str) -> None:
    assert verify_pin(stored_hash, "1234") is False


def test_excessive_pbkdf2_iterations_are_rejected_before_kdf(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stored_hash = (
        f"pbkdf2_sha256$2000001${_encoded(b's' * 16)}${_encoded(b'd' * 32)}"
    )
    kdf_called = False

    def track_kdf(*_args: object, **_kwargs: object) -> bytes:
        nonlocal kdf_called
        kdf_called = True
        return b""

    monkeypatch.setattr(pin_auth.hashlib, "pbkdf2_hmac", track_kdf)

    assert verify_pin(stored_hash, "1234") is False
    assert kdf_called is False


def test_hash_pin_preserves_legacy_sha256_write_contract() -> None:
    assert hash_pin("1234") == hashlib.sha256(b"1234").hexdigest()
    assert DEFAULT_PIN_HASH == hashlib.sha256(b"0000").hexdigest()


def test_verify_pin_preserves_legacy_sha256_compatibility() -> None:
    assert verify_pin(hash_pin("1234"), "1234") is True
    assert verify_pin(hash_pin("1234"), "9999") is False


def test_verify_pin_preserves_null_default_pin_compatibility() -> None:
    assert verify_pin(None, "0000") is True
    assert verify_pin(None, "1234") is False


def test_validate_pin_preserves_http_422_contract() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_pin("12ab")

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "PIN 은 4자리 숫자여야 합니다"

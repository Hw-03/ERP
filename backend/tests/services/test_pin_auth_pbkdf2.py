"""IC-01 PIN credential 전환 계약."""

from __future__ import annotations

import base64
import hashlib

import pytest

from app.services import pin_auth
from app.services.pin_auth import DEFAULT_PIN, DEFAULT_PIN_HASH, hash_pin, verify_pin


def _encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _verifier(
    *,
    iterations: str = "600000",
    salt: bytes = b"s" * 16,
    digest: bytes = b"d" * 32,
) -> str:
    return f"pbkdf2_sha256${iterations}${_encoded(salt)}${_encoded(digest)}"


def test_hash_pin_uses_versioned_pbkdf2_with_unique_salts() -> None:
    first = hash_pin("1234")
    second = hash_pin("1234")

    assert first.startswith("pbkdf2_sha256$600000$")
    assert second.startswith("pbkdf2_sha256$600000$")
    assert first != second
    assert verify_pin(first, "1234") is True
    assert verify_pin(first, "9999") is False
    _, _, salt_text, digest_text = first.split("$")
    assert len(salt_text) == 24
    assert len(base64.urlsafe_b64decode(salt_text)) == 16
    assert len(digest_text) == 44
    assert len(base64.urlsafe_b64decode(digest_text)) == 32


def test_legacy_sha256_success_requests_pbkdf2_upgrade() -> None:
    upgrade = getattr(pin_auth, "verify_pin_and_upgrade", None)
    assert callable(upgrade)

    result = upgrade(DEFAULT_PIN_HASH, DEFAULT_PIN)

    assert result.is_valid is True
    assert result.upgraded_hash is not None
    assert result.upgraded_hash.startswith("pbkdf2_sha256$600000$")
    assert verify_pin(result.upgraded_hash, DEFAULT_PIN) is True


def test_pbkdf2_success_does_not_request_upgrade() -> None:
    stored = hash_pin("2468")
    upgrade = getattr(pin_auth, "verify_pin_and_upgrade", None)
    assert callable(upgrade)

    result = upgrade(stored, "2468")

    assert result.is_valid is True
    assert result.upgraded_hash is None


def test_weak_pbkdf2_is_upgraded_but_new_weak_hashes_are_rejected() -> None:
    salt = b"w" * 16
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        b"2468",
        salt,
        1,
        dklen=32,
    )
    weak = _verifier(iterations="1", salt=salt, digest=digest)

    result = pin_auth.verify_pin_and_upgrade(weak, "2468")

    assert result.is_valid is True
    assert result.upgraded_hash is not None
    assert result.upgraded_hash.startswith("pbkdf2_sha256$600000$")
    with pytest.raises(ValueError, match="iterations"):
        hash_pin("2468", iterations=1)


def test_null_hash_keeps_legacy_default_pin_compatibility() -> None:
    assert verify_pin(None, DEFAULT_PIN) is True
    assert verify_pin(None, "1234") is False


def test_malformed_pbkdf2_hash_fails_closed() -> None:
    assert verify_pin("pbkdf2_sha256$600000$broken", "1234") is False
    assert verify_pin("pbkdf2_sha256$0$AA==$AA==", "1234") is False


@pytest.mark.parametrize(
    "stored_hash",
    [
        _verifier(iterations="1", salt=b"s" * 20),
        _verifier(iterations="1", digest=b"d" * 36),
        f"pbkdf2_sha256$1${'A' * 4096}${_encoded(b'd' * 32)}",
    ],
    ids=["salt-segment", "digest-segment", "stored-hash"],
)
def test_oversized_pbkdf2_verifier_is_rejected_before_decode_or_kdf(
    monkeypatch: pytest.MonkeyPatch,
    stored_hash: str,
) -> None:
    decode_calls = 0
    kdf_calls = 0
    original_decode = pin_auth._decode

    def track_decode(value: str) -> bytes:
        nonlocal decode_calls
        decode_calls += 1
        return original_decode(value)

    def track_kdf(*_args, **kwargs) -> bytes:
        nonlocal kdf_calls
        kdf_calls += 1
        return b"x" * int(kwargs["dklen"])

    monkeypatch.setattr(pin_auth, "_decode", track_decode)
    monkeypatch.setattr(pin_auth.hashlib, "pbkdf2_hmac", track_kdf)

    assert verify_pin(stored_hash, "1234") is False
    assert decode_calls == 0
    assert kdf_calls == 0


_ZERO_SALT = _encoded(bytes(16))
_NONCANONICAL_ZERO_SALT = f"{_ZERO_SALT[:-3]}B=="
_STANDARD_ALPHABET_SALT = _encoded(bytes([251]) * 16).replace("-", "+").replace("_", "/")


@pytest.mark.parametrize(
    "stored_hash",
    [
        _verifier(salt=b"s" * 15),
        _verifier(salt=b"s" * 17),
        _verifier(digest=b"d" * 31),
        _verifier(digest=b"d" * 33),
        _verifier(iterations="0600000"),
        _verifier(iterations="+600000"),
        f"pbkdf2_sha256$600000${_NONCANONICAL_ZERO_SALT}${_encoded(b'd' * 32)}",
        f"pbkdf2_sha256$600000${_STANDARD_ALPHABET_SALT}${_encoded(b'd' * 32)}",
    ],
    ids=[
        "salt-15-bytes",
        "salt-17-bytes",
        "digest-31-bytes",
        "digest-33-bytes",
        "leading-zero-iterations",
        "signed-iterations",
        "noncanonical-trailing-bits",
        "standard-base64-alphabet",
    ],
)
def test_noncanonical_pbkdf2_verifier_is_rejected_without_kdf(
    monkeypatch: pytest.MonkeyPatch,
    stored_hash: str,
) -> None:
    kdf_calls = 0

    def track_kdf(*_args, **kwargs) -> bytes:
        nonlocal kdf_calls
        kdf_calls += 1
        return b"d" * int(kwargs["dklen"])

    monkeypatch.setattr(pin_auth.hashlib, "pbkdf2_hmac", track_kdf)

    assert verify_pin(stored_hash, "1234") is False
    assert kdf_calls == 0

"""PIN 해싱 및 검증 유틸리티.

작업자 식별용 — 실제 보안 인증이 아님.
4자리 PIN으로 작업자를 식별하는 경량 인증 헬퍼.
"""

import hashlib

DEFAULT_PIN = "0000"


def hash_pin(pin: str) -> str:
    """PIN 문자열을 SHA-256 해시로 변환."""
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def verify_pin(stored_hash: str | None, input_pin: str) -> bool:
    """저장된 해시와 입력 PIN을 비교. stored_hash가 None이면 기본 PIN 0000과 비교."""
    if stored_hash is None:
        return input_pin == DEFAULT_PIN
    return stored_hash == hash_pin(input_pin)


DEFAULT_PIN_HASH: str = hash_pin(DEFAULT_PIN)

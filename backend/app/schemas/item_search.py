"""Strict input contracts for staff maintained search terms."""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.utils.search import normalize_search_text


class AliasCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    alias: str = Field(min_length=1, max_length=200)

    @field_validator("alias")
    @classmethod
    def meaningful_alias(cls, value: str) -> str:
        """Reject separator-only aliases before they enter the natural key."""
        if not normalize_search_text(value):
            raise ValueError("검색 가능한 별칭을 입력해 주세요.")
        return value.strip()


class SynonymCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    terms: list[str] = Field(min_length=2, max_length=50)

    @field_validator("terms")
    @classmethod
    def meaningful_terms(cls, values: list[str]) -> list[str]:
        """A group requires two distinct normalized meaningful terms."""
        terms = [value.strip() for value in values]
        keys = [normalize_search_text(value) for value in terms]
        if any(not key or len(term) > 200 for key, term in zip(keys, terms)):
            raise ValueError("동의어는 중복 없이 검색 가능한 문구로 입력해 주세요.")
        unique = {}
        for key, term in zip(keys, terms):
            unique.setdefault(key, term)
        if len(unique) < 2:
            raise ValueError("서로 다른 동의어를 두 개 이상 입력해 주세요.")
        return list(unique.values())


class SynonymUpdate(SynonymCreate):
    expected_version: int = Field(ge=1)

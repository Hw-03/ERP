"""개인 메모 요청에는 소유자나 공유·이력 정보를 받지 않는다."""

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UtcDatetime


class PersonalMemoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(max_length=5000)


class PersonalMemoResponse(BaseModel):
    content: str
    updated_at: UtcDatetime | None

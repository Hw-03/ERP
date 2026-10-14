"""Strict wire contracts: null is uncounted, zero is an explicit observation."""
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Quantity = Annotated[int, Field(strict=True, ge=0, le=2147483647)]
Version = Annotated[int, Field(strict=True, ge=0)]


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MenuVisibilityUpdate(Command):
    enabled: bool = Field(strict=True)


class MenuVisibilityResponse(BaseModel):
    enabled: bool
    employee_visible: bool
    participant_departments: list[str]
    participant_count: int


class Quantities(Command):
    normal: Quantity | None
    defect: Quantity | None
    b_grade: Quantity | None
    obsolete: Quantity | None

    @model_validator(mode="after")
    def check_total(self) -> "Quantities":
        """The physical inventory total must also fit the existing integer model."""
        if sum(value or 0 for value in self.model_dump().values()) > 2147483647:
            raise ValueError("네 분류 수량의 합이 허용 범위를 초과합니다.")
        return self


class RoundStartPreview(Command):
    title: str = Field(min_length=1, max_length=120)


class PreviewRef(Command):
    preview_id: UUID
    preview_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class TargetAppendPreview(Command):
    round_id: UUID


class TargetAppend(PreviewRef):
    round_id: UUID


class CountStart(Command):
    target_id: UUID
    expected_target_version: Version
    round_epoch: Version


class CountCommand(Command):
    count_id: UUID
    expected_version: Version
    fence: Version


class CountSave(CountCommand):
    quantities: Quantities


class CountRelease(CountCommand):
    reason_code: str = Field(min_length=1, max_length=40)
    reason: str = Field(min_length=1, max_length=1000)


class SelectionBody(Command):
    confirmation_revision_ids: list[UUID] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_selection(self) -> "SelectionBody":
        """Duplicate selections must never silently alter the requested set."""
        if len(set(self.confirmation_revision_ids)) != len(self.confirmation_revision_ids):
            raise ValueError("중복된 확인 결과는 선택할 수 없습니다.")
        return self


class ApplicationPreview(SelectionBody):
    round_id: UUID


class BulkSelectionBody(SelectionBody):
    """The service bounds whole-round selections using actual admitted membership."""
    confirmation_revision_ids: list[UUID] = Field(min_length=1)


class BulkApplicationPreview(BulkSelectionBody):
    round_id: UUID


class ApplicationApply(PreviewRef):
    round_id: UUID


class ClosePreviewBody(Command):
    mode: Literal["FULL", "PARTIAL"]
    reason: str = Field(default="", max_length=1000)
    confirmation_revision_ids: list[UUID] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def validate_close(self) -> "ClosePreviewBody":
        """Partial close records a meaningful reason and an exact optional selection."""
        self.reason = self.reason.strip()
        if self.mode == "PARTIAL" and not self.reason:
            raise ValueError("부분 종료 사유를 입력해 주세요.")
        if len(set(self.confirmation_revision_ids)) != len(self.confirmation_revision_ids):
            raise ValueError("중복된 확인 결과는 선택할 수 없습니다.")
        return self


class ClosePreview(ClosePreviewBody):
    round_id: UUID


class CountStartBody(Command):
    expected_target_version: Version
    round_epoch: Version


class CountVersionBody(Command):
    expected_version: Version
    fence: Version


class CountSaveBody(CountVersionBody):
    quantities: Quantities


class CountReleaseBody(CountVersionBody):
    reason_code: str = Field(min_length=1, max_length=40)
    reason: str = Field(min_length=1, max_length=1000)


COMMANDS = {
    "round_start_preview": RoundStartPreview, "round_start": PreviewRef,
    "target_append_preview": TargetAppendPreview, "target_append": TargetAppend,
    "count_start": CountStart, "count_save": CountSave, "count_confirm": CountCommand,
    "count_resume": CountRelease, "count_abandon": CountRelease, "count_force_release": CountRelease,
    "application_preview": ApplicationPreview, "application_apply": ApplicationApply,
    "application_bulk_preview": BulkApplicationPreview, "application_bulk_apply": ApplicationApply,
    "round_close_preview": ClosePreview, "round_close": ApplicationApply,
}

from app.schemas.business_correction import CorrectionRequest, CorrectionVersion, CorrectionApprove, CorrectionDecision

COMMANDS.update(correction_request=CorrectionRequest, correction_preview=CorrectionVersion,
                correction_approve=CorrectionApprove, correction_reject=CorrectionDecision, correction_withdraw=CorrectionDecision)


class CommandResolution(Command):
    kind: str
    command_payload: dict
    reason: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def canonical_command(self) -> "CommandResolution":
        """Use the same defaults, IDs and forbidden-field rules as original execution."""
        if self.kind not in COMMANDS:
            raise ValueError("지원하지 않는 명령 종류입니다.")
        self.reason = self.reason.strip()
        if not self.reason:
            raise ValueError("정리 사유를 입력해 주세요.")
        self.command_payload = COMMANDS[self.kind].model_validate(self.command_payload).model_dump(mode="json")
        return self

"""직원·PIN schema."""

from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models import EmployeeLevelEnum

from app.schemas.common import UtcDatetime


class PinVerifyRequest(BaseModel):
    # 작업자 식별용 PIN 검증 요청 — 실제 보안 인증이 아님
    pin: str = Field(..., min_length=1, max_length=20)


class EmployeePinResetRequest(BaseModel):
    # 직원 PIN 초기화 — 관리자 PIN 검증 필요
    pin: str = Field(..., min_length=1, max_length=32)


class EmployeePinChangeRequest(BaseModel):
    # 본인 PIN 변경 — 현재 PIN 검증 필요
    current_pin: str = Field(..., min_length=1, max_length=4)
    new_pin: str = Field(..., min_length=4, max_length=4)


class EmployeeCreate(BaseModel):
    employee_code: Optional[str] = Field(None, max_length=30)
    name: str = Field(..., max_length=100)
    role: str = Field(..., max_length=100)
    phone: Optional[str] = Field(None, max_length=30)
    department: str
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF
    warehouse_role: str = Field("none", description="창고 결재 역할 (none/primary/deputy)")
    department_role: str = Field("none", description="부서 결재 역할 (none/primary/deputy)")
    display_order: int = 0
    is_active: bool = True
    # W12-#7: 직원별 입출고 권한. 부서 io_enabled 와 AND 결합.
    io_enabled: Optional[bool] = True
    # 조립 부서 직원의 담당 모델 slot 목록. 리스트 순서 = priority (앞=상위).
    assigned_model_slots: Optional[List[int]] = None
    # 직원별 좌측 사이드바/모바일 탭 숨김 목록. 빈 목록이면 모든 탭 표시.
    hidden_sidebar_tabs: List[str] = Field(default_factory=list)


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=30)
    department: Optional[str] = None
    level: Optional[EmployeeLevelEnum] = None
    warehouse_role: Optional[str] = Field(None, description="창고 결재 역할 (none/primary/deputy)")
    department_role: Optional[str] = Field(None, description="부서 결재 역할 (none/primary/deputy)")
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    # W12-#7: 직원별 입출고 권한. None=변경 없음.
    io_enabled: Optional[bool] = None
    # 조립 부서 직원의 담당 모델 slot 목록. None=변경 없음, []=전부 제거.
    assigned_model_slots: Optional[List[int]] = None
    # None=변경 없음, []=모든 탭 표시.
    hidden_sidebar_tabs: Optional[List[str]] = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    employee_id: uuid.UUID
    employee_code: str
    name: str
    role: str
    phone: Optional[str]
    department: str
    level: EmployeeLevelEnum
    warehouse_role: str = "none"
    department_role: str = "none"
    display_order: int
    is_active: bool
    # W12-#7: 직원별 입출고 권한. 마이그레이션 이전 응답 호환을 위해 기본 True.
    io_enabled: bool = True
    created_at: UtcDatetime
    updated_at: UtcDatetime
    pin_last_changed: Optional[UtcDatetime] = None
    pin_is_default: bool = True
    theme: Optional[str] = None
    # 담당 모델 slot 목록 (priority 순서대로 정렬되어 반환됨)
    assigned_model_slots: List[int] = Field(default_factory=list)
    # 직원별 좌측 사이드바/모바일 탭 숨김 목록.
    hidden_sidebar_tabs: List[str] = Field(default_factory=list)


class EmployeeThemeUpdate(BaseModel):
    theme: Optional[str] = Field(None, max_length=10)

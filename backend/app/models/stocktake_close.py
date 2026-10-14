"""Prepared close evidence is immutable; a seal publishes only complete chunks."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, JSON, String, func

from app.models.base import Base, UUIDString


class StocktakeCloseManifest(Base):
    __tablename__ = "stocktake_close_manifests"
    manifest_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), nullable=False, index=True)
    header = Column(JSON, nullable=False)
    manifest_hash = Column(String(64), nullable=False)
    chunk_count = Column(Integer, nullable=False)
    row_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    __table_args__ = (CheckConstraint("chunk_count >= 0 AND row_count >= 0", name="ck_stocktake_manifest_size"),)


class StocktakeCloseChunk(Base):
    __tablename__ = "stocktake_close_chunks"
    manifest_id = Column(UUIDString, ForeignKey("stocktake_close_manifests.manifest_id", ondelete="RESTRICT"), primary_key=True)
    chunk_index = Column(Integer, primary_key=True)
    entries = Column(JSON, nullable=False)
    chunk_hash = Column(String(64), nullable=False)
    __table_args__ = (CheckConstraint("chunk_index >= 0", name="ck_stocktake_chunk_index"),)


class StocktakeCloseSeal(Base):
    __tablename__ = "stocktake_close_seals"
    manifest_id = Column(UUIDString, ForeignKey("stocktake_close_manifests.manifest_id", ondelete="RESTRICT"), primary_key=True)
    preview_id = Column(UUIDString, ForeignKey("stocktake_previews.preview_id", ondelete="RESTRICT"), nullable=False, unique=True)
    sealed_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())


class StocktakeCloseCommit(Base):
    __tablename__ = "stocktake_close_commits"
    round_id = Column(UUIDString, ForeignKey("stocktake_rounds.round_id", ondelete="RESTRICT"), primary_key=True)
    manifest_id = Column(UUIDString, ForeignKey("stocktake_close_seals.manifest_id", ondelete="RESTRICT"), nullable=False, unique=True)
    actor_id = Column(UUIDString, ForeignKey("employees.employee_id", ondelete="RESTRICT"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    applications = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())

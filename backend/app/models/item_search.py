"""Empty-by-default staff maintained item search configuration."""
import uuid

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import Base, UUIDString


class ItemAlias(Base):
    __tablename__ = "item_aliases"
    __table_args__ = (UniqueConstraint("item_id", "normalized_alias", name="uq_item_alias_normalized"),)
    alias_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    alias = Column(String(200), nullable=False)
    normalized_alias = Column(String(200), nullable=False)


class ItemSynonymGroup(Base):
    __tablename__ = "item_synonym_groups"
    group_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    version = Column(Integer, nullable=False, default=1)


class ItemSynonymTerm(Base):
    __tablename__ = "item_synonym_terms"
    term_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    group_id = Column(UUIDString, ForeignKey("item_synonym_groups.group_id", ondelete="CASCADE"), nullable=False, index=True)
    term = Column(String(200), nullable=False)
    normalized_term = Column(String(200), nullable=False, unique=True)

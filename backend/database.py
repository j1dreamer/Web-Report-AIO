from sqlalchemy import Column, Integer, String, DateTime, Float, Index, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./reports.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class ReportRecord(Base):
    __tablename__ = "report_records"

    id = Column(Integer, primary_key=True, index=True)
    dt_obj = Column(DateTime, index=True)
    site = Column(String, index=True)
    device = Column(String, index=True)
    clients = Column(Integer)
    health = Column(String)
    state = Column(String)
    model = Column(String)
    ip = Column(String)

    # Composite index for faster filtering
    __table_args__ = (
        Index('ix_report_record_lookup', 'dt_obj', 'site', 'device'),
    )

class ProcessedFile(Base):
    __tablename__ = "processed_files"
    filename = Column(String, primary_key=True)
    processed_at = Column(DateTime, default=datetime.datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

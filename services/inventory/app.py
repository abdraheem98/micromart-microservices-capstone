import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Integer, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./micromart.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class InventoryStock(Base):
    __tablename__ = "inventory"
    product_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    available: Mapped[int] = mapped_column(Integer, nullable=False)

def initialize_database():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(InventoryStock.product_id).limit(1)) is None:
            db.add_all([InventoryStock(product_id=1, available=10), InventoryStock(product_id=2, available=5), InventoryStock(product_id=3, available=3)])
            db.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield

app = FastAPI(title="MicroMart Inventory Service", version="2.0.0", lifespan=lifespan)

class Reservation(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)

@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"service": "inventory", "status": "ok", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

@app.get("/stock/{product_id}")
def get_stock(product_id: int):
    with SessionLocal() as db:
        stock = db.get(InventoryStock, product_id)
        if stock is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return {"product_id": product_id, "available": stock.available}

@app.post("/reserve")
def reserve(request: Reservation):
    # Atomic conditional UPDATE prevents concurrent requests overselling stock.
    from sqlalchemy import update
    with SessionLocal.begin() as db:
        result = db.execute(update(InventoryStock).where(InventoryStock.product_id == request.product_id, InventoryStock.available >= request.quantity).values(available=InventoryStock.available - request.quantity))
        if result.rowcount == 0:
            exists = db.get(InventoryStock, request.product_id)
            if exists is None:
                raise HTTPException(status_code=404, detail="Product not found")
            raise HTTPException(status_code=409, detail="Insufficient stock")
        remaining = db.get(InventoryStock, request.product_id).available
    return {"status": "reserved", "product_id": request.product_id, "quantity": request.quantity, "remaining": remaining}

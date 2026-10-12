import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Integer, String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./micromart.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
INVENTORY_URL = os.getenv("INVENTORY_URL", "http://inventory:8000")

class Base(DeclarativeBase):
    pass

class OrderRecord(Base):
    __tablename__ = "orders"
    order_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="confirmed")

def initialize_database():
    Base.metadata.create_all(engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield

app = FastAPI(title="MicroMart Order Service", version="2.0.0", lifespan=lifespan)

class OrderRequest(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)

def serialize(order):
    return {"order_id": order.order_id, "product_id": order.product_id, "quantity": order.quantity, "status": order.status}

@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"service": "orders", "status": "ok", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

@app.get("/orders")
def list_orders():
    with SessionLocal() as db:
        return [serialize(o) for o in db.scalars(select(OrderRecord).order_by(OrderRecord.order_id)).all()]

@app.post("/orders")
async def create_order(request: OrderRequest):
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(f"{INVENTORY_URL}/reserve", json=request.model_dump())
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.json().get("detail", "Inventory request failed"))
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Inventory service unavailable") from exc

    with SessionLocal.begin() as db:
        order = OrderRecord(product_id=request.product_id, quantity=request.quantity, status="confirmed")
        db.add(order)
        db.flush()
        result = serialize(order)
    return result

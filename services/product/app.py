import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine, Integer, String, Numeric, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./micromart.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)

def initialize_database():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(Product.id).limit(1)) is None:
            db.add_all([Product(id=1, name="Keyboard", price=1200), Product(id=2, name="Mouse", price=600), Product(id=3, name="USB-C Hub", price=1800)])
            db.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield

app = FastAPI(title="MicroMart Product Service", version="2.0.0", lifespan=lifespan)

@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"service": "product", "status": "ok", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

@app.get("/")
def list_products():
    with SessionLocal() as db:
        return [{"id": p.id, "name": p.name, "price": p.price} for p in db.scalars(select(Product).order_by(Product.id)).all()]

@app.get("/{product_id}")
def get_product(product_id: int):
    with SessionLocal() as db:
        product = db.get(Product, product_id)
        if product is None:
            raise HTTPException(status_code=404, detail="Product not found")
        return {"id": product.id, "name": product.name, "price": product.price}

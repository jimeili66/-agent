from collections.abc import Callable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .data import PRODUCTS
from .database import AccountRecord, OrderRecord, ProductRecord, QaLogRecord, ReviewReportRecord, ToolLogRecord
from .models import Account, AccountCreateRequest, Order, Product, ProductCreateRequest, QaLog, ReviewReportData, ToolLog
from .auth import hash_password, public_account


class ProductRepository:
    def __init__(self, session_factory: Callable[[], Session]):
        self.session_factory = session_factory

    def list_products(self) -> list[Product]:
        with self.session_factory() as session:
            records = session.scalars(select(ProductRecord).order_by(ProductRecord.id)).all()
            return [record_to_product(record) for record in records]

    def get_product(self, product_id: int) -> Product | None:
        with self.session_factory() as session:
            record = session.get(ProductRecord, product_id)
            return record_to_product(record) if record else None

    def create_product(self, payload: ProductCreateRequest) -> Product:
        with self.session_factory() as session:
            record = ProductRecord(**payload_to_record(payload))
            session.add(record)
            session.commit()
            session.refresh(record)
            return record_to_product(record)

    def delete_product(self, product_id: int) -> bool:
        with self.session_factory() as session:
            record = session.get(ProductRecord, product_id)
            if record is None:
                return False
            session.delete(record)
            session.commit()
            return True

    def seed_defaults(self) -> None:
        with self.session_factory() as session:
            has_products = session.scalar(select(ProductRecord.id).limit(1))
            if has_products:
                return
            session.add_all(ProductRecord(**product_to_record(product)) for product in PRODUCTS)
            session.commit()

    def save_qa_log(self, qa_log: QaLog) -> QaLog:
        with self.session_factory() as session:
            record_data = qa_log_to_record(qa_log)
            record_data["created_at"] = datetime.now()
            record = QaLogRecord(**record_data)
            session.merge(record)
            session.commit()
            return qa_log

    def list_qa_logs(self, limit: int = 50) -> list[QaLog]:
        with self.session_factory() as session:
            records = session.scalars(select(QaLogRecord).order_by(QaLogRecord.created_at.desc()).limit(limit)).all()
            return [record_to_qa_log(record) for record in records]

    def save_tool_logs(self, tool_logs: list[ToolLog], qa_log_id: int | None = None) -> list[ToolLog]:
        with self.session_factory() as session:
            for tool_log in tool_logs:
                session.merge(ToolLogRecord(**tool_log_to_record(tool_log, qa_log_id)))
            session.commit()
            return tool_logs

    def list_tool_logs(self, limit: int = 50) -> list[ToolLog]:
        with self.session_factory() as session:
            records = session.scalars(select(ToolLogRecord).order_by(ToolLogRecord.id.desc()).limit(limit)).all()
            return [record_to_tool_log(record) for record in records]

    def save_order(self, order: Order) -> Order:
        with self.session_factory() as session:
            record = OrderRecord(**order_to_record(order))
            session.add(record)
            session.commit()
            session.refresh(record)
            return record_to_order(record)

    def list_orders(self, limit: int = 50) -> list[Order]:
        with self.session_factory() as session:
            records = session.scalars(select(OrderRecord).order_by(OrderRecord.created_at.desc()).limit(limit)).all()
            return [record_to_order(record) for record in records]

    def save_review_report(self, report: ReviewReportData) -> ReviewReportData:
        with self.session_factory() as session:
            session.add(ReviewReportRecord(report=report.model_dump()))
            session.commit()
            return report

    def latest_review_report(self) -> ReviewReportData | None:
        with self.session_factory() as session:
            record = session.scalars(select(ReviewReportRecord).order_by(ReviewReportRecord.id.desc()).limit(1)).first()
            return ReviewReportData(**record.report) if record else None

    def create_account(self, payload: AccountCreateRequest) -> Account:
        with self.session_factory() as session:
            existing = session.scalars(select(AccountRecord).where(AccountRecord.username == payload.username)).first()
            if existing is not None:
                raise ValueError("账号已存在")
            record = AccountRecord(
                username=payload.username,
                password_hash=hash_password(payload.password),
                role=payload.role,
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return record_to_account(record)

    def get_account_by_username(self, username: str) -> tuple[Account, str] | None:
        with self.session_factory() as session:
            record = session.scalars(select(AccountRecord).where(AccountRecord.username == username)).first()
            if record is None:
                return None
            return record_to_account(record), record.password_hash

    def get_account_by_id(self, account_id: int) -> Account | None:
        with self.session_factory() as session:
            record = session.get(AccountRecord, account_id)
            return record_to_account(record) if record else None

    def list_accounts(self) -> list[Account]:
        with self.session_factory() as session:
            records = session.scalars(select(AccountRecord).order_by(AccountRecord.id)).all()
            return [record_to_account(record) for record in records]

    def update_account_password(self, account_id: int, password: str) -> Account | None:
        with self.session_factory() as session:
            record = session.get(AccountRecord, account_id)
            if record is None:
                return None
            record.password_hash = hash_password(password)
            session.commit()
            session.refresh(record)
            return record_to_account(record)


def record_to_product(record: ProductRecord) -> Product:
    return Product(
        id=record.id,
        name=record.name,
        category=record.category,
        sellingPoints=record.selling_points,
        price=record.price,
        livePrice=record.live_price,
        promotionRule=record.promotion_rule,
        stock=record.stock,
        notes=record.notes,
        suitableFor=record.suitable_for,
        imageUrl=record.image_url,
        imageAlt=record.image_alt,
        imageCredit=record.image_credit,
    )


def payload_to_record(payload: ProductCreateRequest) -> dict:
    return {
        "name": payload.name,
        "category": payload.category,
        "selling_points": payload.sellingPoints,
        "price": payload.price,
        "live_price": payload.livePrice,
        "promotion_rule": payload.promotionRule,
        "stock": payload.stock,
        "notes": payload.notes,
        "suitable_for": payload.suitableFor,
        "image_url": payload.imageUrl,
        "image_alt": payload.imageAlt,
        "image_credit": payload.imageCredit,
    }


def product_to_record(product: Product) -> dict:
    data = payload_to_record(ProductCreateRequest(**product.model_dump(exclude={"id"})))
    data["id"] = product.id
    return data


def qa_log_to_record(qa_log: QaLog) -> dict:
    return {
        "id": qa_log.id,
        "question": qa_log.question,
        "answer": qa_log.answer,
        "category": qa_log.category,
        "emotion": qa_log.emotion,
        "product_name": qa_log.productName,
    }


def record_to_qa_log(record: QaLogRecord) -> QaLog:
    return QaLog(
        id=record.id,
        question=record.question,
        answer=record.answer,
        category=record.category,
        emotion=record.emotion,
        productName=record.product_name,
    )


def tool_log_to_record(tool_log: ToolLog, qa_log_id: int | None = None) -> dict:
    return {
        "id": tool_log.id,
        "tool": tool_log.tool,
        "input": tool_log.input,
        "output": tool_log.output,
        "time": tool_log.time,
        "qa_log_id": qa_log_id,
    }


def record_to_tool_log(record: ToolLogRecord) -> ToolLog:
    return ToolLog(
        id=record.id,
        tool=record.tool,
        input=record.input,
        output=record.output,
        time=record.time,
    )


def order_to_record(order: Order) -> dict:
    return {
        "profile": order.profile,
        "items": [item.model_dump() for item in order.items],
        "total_amount": order.totalAmount,
        "status": order.status,
    }


def record_to_order(record: OrderRecord) -> Order:
    created_at = record.created_at.isoformat(sep=" ", timespec="seconds") if hasattr(record.created_at, "isoformat") else str(record.created_at)
    return Order(
        id=record.id,
        profile=record.profile,
        items=record.items,
        totalAmount=record.total_amount,
        status=record.status,
        createdAt=created_at,
    )


def record_to_account(record: AccountRecord) -> Account:
    return public_account(record.id, record.username, record.role, record.created_at)

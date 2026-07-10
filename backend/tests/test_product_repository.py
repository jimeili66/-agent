from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.data import DANMU_LIST, PRODUCTS
from backend.app.database import Base
from backend.app.models import ProductCreateRequest, QaLog, ToolLog
from backend.app.product_repository import ProductRepository
from backend.app.services import generate_review


def make_repository() -> ProductRepository:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return ProductRepository(session_factory)


def test_product_repository_seeds_defaults_and_persists_created_product():
    repository = make_repository()

    repository.seed_defaults()
    products = repository.list_products()
    assert len(products) >= 10
    assert products[0].name == PRODUCTS[0].name

    created = repository.create_product(
        ProductCreateRequest(
            name="Navicat visible nuts",
            category="food",
            sellingPoints=["portable", "daily supply", "campus friendly"],
            price=59,
            livePrice=39,
            promotionRule="second item half price",
            stock=88,
            notes="check ingredients before ordering",
            suitableFor=["student"],
            imageUrl="/products/oatmeal.jpg",
            imageAlt="nuts product image",
            imageCredit="user input",
        )
    )

    assert created.id > 10
    assert repository.get_product(created.id).name == "Navicat visible nuts"
    assert any(product.name == "Navicat visible nuts" for product in repository.list_products())


def test_product_repository_deletes_created_product():
    repository = make_repository()
    repository.seed_defaults()
    created = repository.create_product(
        ProductCreateRequest(
            name="Product to delete",
            category="food",
            sellingPoints=["portable"],
            price=20,
            livePrice=15,
            promotionRule="live price",
            stock=12,
            notes="check details before ordering",
            suitableFor=["student"],
            imageUrl="/products/oatmeal.jpg",
            imageAlt="product image",
            imageCredit="user input",
        )
    )

    assert repository.delete_product(created.id) is True
    assert repository.get_product(created.id) is None
    assert all(product.id != created.id for product in repository.list_products())
    assert repository.delete_product(created.id) is False


def test_product_repository_persists_live_records():
    repository = make_repository()
    danmu = DANMU_LIST[1]
    qa_log = QaLog(
        id=9001,
        question=danmu.text,
        answer="answer",
        category=danmu.category,
        emotion=danmu.emotion,
        productName=PRODUCTS[0].name,
    )
    tool_log = ToolLog(
        id=9002,
        tool="calculateDiscount",
        input="product x2",
        output="total 128",
        time="12:00:00",
    )
    report = generate_review([qa_log], PRODUCTS)

    repository.save_qa_log(qa_log)
    repository.save_tool_logs([tool_log], qa_log.id)
    repository.save_review_report(report)

    assert repository.list_qa_logs()[0].id == qa_log.id
    assert repository.list_tool_logs()[0].tool == "calculateDiscount"
    assert repository.latest_review_report().emotionSummary[danmu.emotion] == 1


def test_product_repository_lists_qa_logs_by_save_order_not_external_id():
    repository = make_repository()
    older_log = QaLog(
        id=9999,
        question="older question",
        answer="older answer",
        category="价格",
        emotion="感兴趣",
        productName=PRODUCTS[0].name,
    )
    newer_log = QaLog(
        id=100,
        question="newer question",
        answer="newer answer",
        category="售后",
        emotion="犹豫",
        productName=PRODUCTS[0].name,
    )

    repository.save_qa_log(older_log)
    repository.save_qa_log(newer_log)

    logs = repository.list_qa_logs()

    assert [item.question for item in logs[:2]] == ["newer question", "older question"]

from .data import PRODUCTS
from .database import create_session_factory, get_database_url
from .auth import account_created_at_now, hash_password, verify_password
from .models import Account, AccountCreateRequest, Danmu, Order, Product, ProductCreateRequest, QaLog, ReviewReportData, ToolLog
from .product_repository import ProductRepository


_repository: ProductRepository | None = None
_qa_logs: list[QaLog] = []
_tool_logs: list[ToolLog] = []
_orders: list[Order] = []
_accounts: list[tuple[Account, str]] = []
_latest_review: ReviewReportData | None = None


def init_storage() -> None:
    global _repository
    database_url = get_database_url()
    if not database_url:
        _repository = None
        ensure_default_admin()
        return

    repository = ProductRepository(create_session_factory(database_url))
    repository.seed_defaults()
    _repository = repository
    ensure_default_admin()


def list_products() -> list[Product]:
    if _repository is None:
        return PRODUCTS
    return _repository.list_products()


def list_danmu_items(limit: int = 50) -> list[Danmu]:
    live_items: list[Danmu] = []
    seen_live_keys: set[tuple[str, str, str]] = set()
    for qa_log in list_qa_logs(limit):
        key = (qa_log.question.strip(), qa_log.category, qa_log.emotion)
        if key in seen_live_keys:
            continue
        seen_live_keys.add(key)
        live_items.append(Danmu(id=qa_log.id, text=qa_log.question, category=qa_log.category, emotion=qa_log.emotion))

    seen_text = {item.text for item in live_items}
    from .data import DANMU_LIST

    seed_items = [item for item in DANMU_LIST if item.text not in seen_text]
    return [*live_items, *seed_items]


def get_product(product_id: int) -> Product | None:
    if _repository is None:
        return next((product for product in PRODUCTS if product.id == product_id), None)
    return _repository.get_product(product_id)


def create_product(payload: ProductCreateRequest) -> Product:
    if _repository is None:
        next_id = max((product.id for product in PRODUCTS), default=0) + 1
        product = Product(id=next_id, **payload.model_dump())
        PRODUCTS.append(product)
        return product
    return _repository.create_product(payload)


def delete_product(product_id: int) -> bool:
    if _repository is None:
        for index, product in enumerate(PRODUCTS):
            if product.id == product_id:
                del PRODUCTS[index]
                return True
        return False
    return _repository.delete_product(product_id)


def save_qa_log(qa_log: QaLog) -> QaLog:
    if _repository is None:
        _qa_logs.insert(0, qa_log)
        del _qa_logs[50:]
        return qa_log
    return _repository.save_qa_log(qa_log)


def list_qa_logs(limit: int = 50) -> list[QaLog]:
    if _repository is None:
        return _qa_logs[:limit]
    return _repository.list_qa_logs(limit)


def save_tool_logs(tool_logs: list[ToolLog], qa_log_id: int | None = None) -> list[ToolLog]:
    if _repository is None:
        _tool_logs[:0] = tool_logs
        del _tool_logs[50:]
        return tool_logs
    return _repository.save_tool_logs(tool_logs, qa_log_id)


def list_tool_logs(limit: int = 50) -> list[ToolLog]:
    if _repository is None:
        return _tool_logs[:limit]
    return _repository.list_tool_logs(limit)


def save_order(order: Order) -> Order:
    if _repository is None:
        next_id = (_orders[0].id + 1) if _orders else 1
        saved = order.model_copy(update={"id": next_id})
        _orders.insert(0, saved)
        return saved
    return _repository.save_order(order)


def list_orders(limit: int | None = 50) -> list[Order]:
    if _repository is None:
        return _orders[:limit]
    return _repository.list_orders(limit)


def save_review_report(report: ReviewReportData) -> ReviewReportData:
    global _latest_review
    if _repository is None:
        _latest_review = report
        return report
    return _repository.save_review_report(report)


def latest_review_report() -> ReviewReportData | None:
    if _repository is None:
        return _latest_review
    return _repository.latest_review_report()


def create_account(payload: AccountCreateRequest) -> Account:
    if _repository is None:
        if any(account.username == payload.username for account, _ in _accounts):
            raise ValueError("账号已存在")
        next_id = max((account.id for account, _ in _accounts), default=0) + 1
        account = Account(id=next_id, username=payload.username, role=payload.role, createdAt=account_created_at_now())
        _accounts.append((account, hash_password(payload.password)))
        return account
    return _repository.create_account(payload)


def ensure_default_admin() -> None:
    if list_accounts():
        return
    create_account(AccountCreateRequest(username="admin", password="123456", role="admin"))


def authenticate_account(username: str, password: str) -> Account | None:
    if _repository is None:
        for account, password_hash in _accounts:
            if account.username == username and verify_password(password, password_hash):
                return account
        return None

    record = _repository.get_account_by_username(username)
    if record is None:
        return None
    account, password_hash = record
    return account if verify_password(password, password_hash) else None


def get_account(account_id: int) -> Account | None:
    if _repository is None:
        return next((account for account, _ in _accounts if account.id == account_id), None)
    return _repository.get_account_by_id(account_id)


def list_accounts() -> list[Account]:
    if _repository is None:
        return [account for account, _ in _accounts]
    return _repository.list_accounts()


def update_account_password(account_id: int, password: str) -> Account | None:
    if _repository is None:
        for index, (account, _) in enumerate(_accounts):
            if account.id == account_id:
                _accounts[index] = (account, hash_password(password))
                return account
        return None
    return _repository.update_account_password(account_id, password)


def reset_live_records() -> None:
    global _latest_review
    if _repository is None:
        _qa_logs.clear()
        _tool_logs.clear()
        _orders.clear()
        _latest_review = None

from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Header, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .models import (
    Account,
    AccountCreateRequest,
    AccountsResponse,
    Danmu,
    DanmuAnswerRequest,
    DanmuAnswerResponse,
    ImageUploadResponse,
    ItemsResponse,
    LatestReviewResponse,
    Order,
    OrderCreateRequest,
    OrdersResponse,
    ReviewReportData,
    ReviewRequest,
    Product,
    ProductCreateRequest,
    ProductDraftRequest,
    ProductDraftResponse,
    QaLogsResponse,
    LoginRequest,
    LoginResponse,
    PasswordUpdateRequest,
    ScriptRequest,
    ScriptResponse,
    ScriptSectionsRequest,
    ScriptSectionsResponse,
    ToolLogsResponse,
)
from .auth import create_access_token, get_account_id_for_token
from .services import answer_danmu, create_order_from_payload, generate_ai_script, generate_ai_script_sections, generate_product_draft, generate_review
from .storage import authenticate_account
from .storage import create_account as save_account
from .storage import create_product as save_product
from .storage import delete_product as remove_product
from .storage import get_account, get_product, init_storage, list_accounts as load_accounts, list_products as load_products, update_account_password
from .storage import list_danmu_items
from .storage import latest_review_report, list_orders, list_qa_logs, list_tool_logs, save_order, save_qa_log, save_review_report, save_tool_logs


app = FastAPI(title="直播带货 Agent API")
UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
PRODUCT_UPLOAD_ROOT = UPLOAD_ROOT / "products"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
PRODUCT_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
init_storage()


@app.get("/api/health/")
def health() -> dict[str, str]:
    return {"status": "ok"}


def account_from_authorization(authorization: str | None) -> Account:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录")
    token = authorization.removeprefix("Bearer ").strip()
    account_id = get_account_id_for_token(token)
    if account_id is None:
        raise HTTPException(status_code=401, detail="登录已失效")
    account = get_account(account_id)
    if account is None:
        raise HTTPException(status_code=401, detail="账号不存在")
    return account


@app.post("/api/auth/register/", response_model=Account)
def register_account(payload: AccountCreateRequest, authorization: str | None = Header(default=None)) -> Account:
    account_from_authorization(authorization)
    try:
        return save_account(payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/auth/login/", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    account = authenticate_account(payload.username, payload.password)
    if account is None:
        raise HTTPException(status_code=401, detail="账号或密码错误")
    return LoginResponse(accessToken=create_access_token(account.id), account=account)


@app.get("/api/auth/me/", response_model=Account)
def current_account(authorization: str | None = Header(default=None)) -> Account:
    return account_from_authorization(authorization)


@app.get("/api/accounts/", response_model=AccountsResponse)
def list_accounts(authorization: str | None = Header(default=None)) -> dict[str, list]:
    account_from_authorization(authorization)
    return {"items": load_accounts()}


@app.patch("/api/accounts/{account_id}/password/", response_model=Account)
def change_account_password(account_id: int, payload: PasswordUpdateRequest, authorization: str | None = Header(default=None)) -> Account:
    account_from_authorization(authorization)
    account = update_account_password(account_id, payload.password)
    if account is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    return account


@app.get("/api/products/", response_model=ItemsResponse)
def list_products() -> dict[str, list]:
    return {"items": load_products()}


@app.post("/api/products/", response_model=Product)
def create_product(payload: ProductCreateRequest) -> Product:
    return save_product(payload)


@app.delete("/api/products/{product_id}/", status_code=204)
def delete_product(product_id: int) -> Response:
    if not remove_product(product_id):
        raise HTTPException(status_code=404, detail="商品不存在")
    return Response(status_code=204)


@app.post("/api/uploads/product-image/", response_model=ImageUploadResponse)
async def upload_product_image(file: UploadFile = File(...)) -> ImageUploadResponse:
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(status_code=400, detail="仅支持上传图片文件")

    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image size must be 5MB or smaller")
    if not is_supported_image(content, file.content_type):
        raise HTTPException(status_code=400, detail="Invalid image file content")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg" if file.content_type == "image/jpeg" else ".png"

    file_name = f"{uuid4().hex}{suffix}"
    target = PRODUCT_UPLOAD_ROOT / file_name
    target.write_bytes(content)
    return ImageUploadResponse(imageUrl=f"/uploads/products/{file_name}", fileName=file_name)


@app.post("/api/products/draft/", response_model=ProductDraftResponse)
def create_product_draft(payload: ProductDraftRequest) -> ProductDraftResponse:
    return generate_product_draft(payload)


@app.get("/api/danmu/", response_model=ItemsResponse)
def list_danmu() -> dict[str, list]:
    return {"items": list_danmu_items()}


@app.post("/api/script/generate/", response_model=ScriptResponse)
def create_script(payload: ScriptRequest) -> ScriptResponse:
    product = get_product(payload.productId)
    if product is None:
        raise HTTPException(status_code=404, detail="商品不存在")

    script, source = generate_ai_script(product, payload.profile, payload.scriptType)
    return ScriptResponse(script=script, source=source)


@app.post("/api/script/sections/", response_model=ScriptSectionsResponse)
def create_script_sections(payload: ScriptSectionsRequest) -> ScriptSectionsResponse:
    product = get_product(payload.productId)
    if product is None:
        raise HTTPException(status_code=404, detail="商品不存在")

    sections, source = generate_ai_script_sections(product, payload.profile)
    return ScriptSectionsResponse(sections=sections, source=source)


@app.post("/api/danmu/answer/", response_model=DanmuAnswerResponse)
def create_danmu_answer(payload: DanmuAnswerRequest) -> DanmuAnswerResponse:
    product = get_product(payload.productId)
    if product is None:
        raise HTTPException(status_code=404, detail="商品不存在")

    answer, logs, qa_log, agent_trace, source = answer_danmu(
        product,
        Danmu(id=payload.danmuId, text=payload.text, category=payload.category, emotion=payload.emotion),
        payload.profile,
    )
    save_qa_log(qa_log)
    save_tool_logs(logs, qa_log.id)
    return DanmuAnswerResponse(answer=answer, logs=logs, qaLog=qa_log, agentTrace=agent_trace, source=source)


@app.post("/api/orders/", response_model=Order)
def create_order(payload: OrderCreateRequest) -> Order:
    order = create_order_from_payload(payload, load_products())
    if order is None:
        raise HTTPException(status_code=404, detail="订单包含不存在的商品")
    return save_order(order)


@app.get("/api/orders/", response_model=OrdersResponse)
def get_orders() -> dict[str, list]:
    return {"items": list_orders()}


@app.post("/api/review/generate/", response_model=ReviewReportData)
def create_review(payload: ReviewRequest) -> ReviewReportData:
    orders = list_orders(limit=None)
    if payload.sessionStartedAt:
        # 只统计本场直播（场次起点之后）的订单
        orders = [order for order in orders if order.createdAt >= payload.sessionStartedAt]
    report = generate_review(payload.qaLogs, load_products(), orders)
    return save_review_report(report)


@app.get("/api/live/qa-logs/", response_model=QaLogsResponse)
def get_qa_logs() -> dict[str, list]:
    return {"items": list_qa_logs()}


@app.get("/api/live/tool-logs/", response_model=ToolLogsResponse)
def get_tool_logs() -> dict[str, list]:
    return {"items": list_tool_logs()}


@app.get("/api/review/latest/", response_model=LatestReviewResponse)
def get_latest_review() -> LatestReviewResponse:
    return LatestReviewResponse(report=latest_review_report())


def is_supported_image(content: bytes, content_type: str) -> bool:
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/gif":
        return content.startswith((b"GIF87a", b"GIF89a"))
    if content_type == "image/webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False

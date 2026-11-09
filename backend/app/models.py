from typing import Literal

from pydantic import BaseModel, Field, field_validator


UserProfile = Literal["学生党", "宝妈", "精致白领"]
Emotion = Literal["感兴趣", "犹豫", "质疑", "投诉"]
DanmuCategory = Literal["价格", "规格", "售后", "适用人群", "优惠计算", "异议质疑", "异常合规"]
ScriptType = Literal["开场", "产品介绍", "促销提醒", "互动提问", "收尾"]
ToolName = Literal["calculateDiscount", "queryStock", "recommendProduct", "complianceCheck"]
AccountRole = Literal["admin", "operator"]


class Product(BaseModel):
    id: int
    name: str
    category: str
    sellingPoints: list[str]
    price: int
    livePrice: int
    promotionRule: str
    stock: int
    notes: str
    suitableFor: list[str]
    imageUrl: str
    imageAlt: str
    imageCredit: str


class ProductCreateRequest(BaseModel):
    name: str
    category: str
    sellingPoints: list[str] = Field(min_length=1)
    price: int = Field(ge=0)
    livePrice: int = Field(ge=0)
    promotionRule: str
    stock: int = Field(ge=0)
    notes: str
    suitableFor: list[str] = Field(min_length=1)
    imageUrl: str = "/products/cup.jpg"
    imageAlt: str = "用户录入商品图片"
    imageCredit: str = "用户录入"

    @field_validator("name", "category", "promotionRule", "notes", "imageUrl", "imageAlt", "imageCredit")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("字段不能为空")
        return value

    @field_validator("sellingPoints", "suitableFor")
    @classmethod
    def list_items_must_not_be_blank(cls, value: list[str]) -> list[str]:
        items = [item.strip() for item in value if item.strip()]
        if not items:
            raise ValueError("列表字段至少需要一项")
        return items


class ImageUploadResponse(BaseModel):
    imageUrl: str
    fileName: str


class ProductDraftRequest(BaseModel):
    name: str
    price: int | None = None
    livePrice: int | None = None
    promotionRule: str | None = None
    stock: int | None = None
    imageUrl: str | None = None
    profile: UserProfile = "学生党"

    @field_validator("name")
    @classmethod
    def draft_name_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("商品名称不能为空")
        return value


class ProductDraftResponse(BaseModel):
    product: ProductCreateRequest
    sections: list["ScriptSection"]
    source: Literal["llm", "fallback"]
    message: str


class OrderItemRequest(BaseModel):
    productId: int
    quantity: int = Field(ge=1)


class OrderCreateRequest(BaseModel):
    profile: UserProfile
    items: list[OrderItemRequest] = Field(min_length=1)


class OrderItem(BaseModel):
    productId: int
    productName: str
    imageUrl: str
    livePrice: int
    quantity: int
    subtotal: int


class Order(BaseModel):
    id: int
    profile: UserProfile
    items: list[OrderItem]
    totalAmount: int
    status: Literal["已下单"]
    createdAt: str


class Danmu(BaseModel):
    id: int
    text: str
    category: DanmuCategory
    emotion: Emotion


class ToolLog(BaseModel):
    id: int
    tool: ToolName
    input: str
    output: str
    time: str


class QaLog(BaseModel):
    id: int
    question: str
    answer: str
    category: DanmuCategory
    emotion: Emotion
    productName: str


class AgentTraceItem(BaseModel):
    agent: str
    action: str
    result: str
    status: Literal["已完成", "需注意", "风险"]


class ProductSalesItem(BaseModel):
    productId: int
    productName: str
    quantity: int
    amount: int


class SalesSummary(BaseModel):
    totalOrders: int
    totalQuantity: int
    totalAmount: int
    avgOrderValue: float
    productSales: list[ProductSalesItem]


class ReviewReportData(BaseModel):
    highFrequencyQuestions: list[str]
    emotionSummary: dict[Emotion, int]
    blockers: list[str]
    suggestions: list[str]
    nextProductOrder: list[str]
    salesSummary: SalesSummary | None = None


class ScriptSection(BaseModel):
    title: str
    value: str


class ItemsResponse(BaseModel):
    items: list[Product] | list[Danmu]


class OrdersResponse(BaseModel):
    items: list[Order]


class ScriptRequest(BaseModel):
    productId: int
    profile: UserProfile
    scriptType: ScriptType


class ScriptResponse(BaseModel):
    script: str
    source: Literal["llm", "fallback"] = "fallback"


class ScriptSectionsRequest(BaseModel):
    productId: int
    profile: UserProfile


class ScriptSectionsResponse(BaseModel):
    sections: list[ScriptSection]
    source: Literal["llm", "fallback"] = "fallback"


class DanmuAnswerRequest(BaseModel):
    productId: int
    profile: UserProfile
    danmuId: int
    text: str
    category: DanmuCategory
    emotion: Emotion


class DanmuAnswerResponse(BaseModel):
    answer: str
    logs: list[ToolLog]
    qaLog: QaLog
    agentTrace: list[AgentTraceItem]
    source: Literal["llm", "fallback"] = "fallback"


class ReviewRequest(BaseModel):
    qaLogs: list[QaLog]
    sessionStartedAt: str | None = None  # 场次起点（YYYY-MM-DD HH:MM:SS），复盘只统计之后的订单


class QaLogsResponse(BaseModel):
    items: list[QaLog]


class ToolLogsResponse(BaseModel):
    items: list[ToolLog]


class LatestReviewResponse(BaseModel):
    report: ReviewReportData | None


class Account(BaseModel):
    id: int
    username: str
    role: AccountRole
    createdAt: str


class AccountCreateRequest(BaseModel):
    username: str
    password: str = Field(min_length=6)
    role: AccountRole = "operator"

    @field_validator("username")
    @classmethod
    def username_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("账号不能为空")
        return value


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    accessToken: str
    tokenType: Literal["bearer"] = "bearer"
    account: Account


class AccountsResponse(BaseModel):
    items: list[Account]


class PasswordUpdateRequest(BaseModel):
    password: str = Field(min_length=6)

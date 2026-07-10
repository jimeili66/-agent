import json
import os
from typing import get_args

from fastapi.testclient import TestClient
import pytest

os.environ.setdefault("DATABASE_URL", "")

from backend.app.main import app
from backend.app.models import ScriptType, UserProfile
from backend.app.services import make_record_id


client = TestClient(app)


def test_generated_record_id_fits_mysql_int_range():
    assert 0 <= make_record_id() <= 2_000_000_000


def test_products_endpoint_returns_product_items():
    response = client.get("/api/products/")

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) >= 10
    assert data["items"][0]["name"] == "云朵保温杯"
    assert data["items"][0]["imageUrl"] == "/products/cup.jpg"


def test_create_product_endpoint_appends_custom_product():
    response = client.post(
        "/api/products/",
        json={
            "name": "校园能量坚果包",
            "category": "食品饮品",
            "sellingPoints": ["独立小包装", "每日坚果搭配", "适合课间补给"],
            "price": 59,
            "livePrice": 39,
            "promotionRule": "直播间第二件半价",
            "stock": 88,
            "notes": "含坚果，过敏人群留意配料",
            "suitableFor": ["学生党", "精致白领"],
            "imageUrl": "/products/oatmeal.jpg",
            "imageAlt": "坚果包产品图",
            "imageCredit": "用户上传",
        },
    )

    assert response.status_code == 200
    created = response.json()
    assert created["id"] > 10
    assert created["name"] == "校园能量坚果包"
    assert created["sellingPoints"] == ["独立小包装", "每日坚果搭配", "适合课间补给"]

    products = client.get("/api/products/").json()["items"]
    assert any(item["id"] == created["id"] and item["name"] == "校园能量坚果包" for item in products)


def test_delete_product_endpoint_removes_product_from_catalog():
    create_response = client.post(
        "/api/products/",
        json={
            "name": "Temporary delete product",
            "category": "food",
            "sellingPoints": ["portable"],
            "price": 29,
            "livePrice": 19,
            "promotionRule": "live price",
            "stock": 10,
            "notes": "check details before ordering",
            "suitableFor": ["student"],
            "imageUrl": "/products/oatmeal.jpg",
            "imageAlt": "temporary product image",
            "imageCredit": "user input",
        },
    )
    product_id = create_response.json()["id"]

    delete_response = client.delete(f"/api/products/{product_id}/")

    assert delete_response.status_code == 204
    products = client.get("/api/products/").json()["items"]
    assert all(item["id"] != product_id for item in products)
    assert client.delete(f"/api/products/{product_id}/").status_code == 404


def test_create_order_persists_for_admin_order_feed():
    response = client.post(
        "/api/orders/",
        json={
            "profile": "学生党",
            "items": [
                {"productId": 1, "quantity": 2},
                {"productId": 2, "quantity": 1},
            ],
        },
    )

    assert response.status_code == 200
    order = response.json()
    assert order["id"] > 0
    assert order["profile"] == "学生党"
    assert order["items"][0]["productName"] == "云朵保温杯"
    assert order["items"][0]["subtotal"] == 69 * 2
    assert order["totalAmount"] == 138 + 59
    assert order["status"] == "已下单"

    orders_response = client.get("/api/orders/")
    assert orders_response.status_code == 200
    assert any(item["id"] == order["id"] for item in orders_response.json()["items"])


def test_account_register_login_me_and_list_flow():
    username = "operator_auth_flow"
    password = "AuthFlow123"
    admin_login_response = client.post(
        "/api/auth/login/",
        json={"username": "admin", "password": "123456"},
    )
    admin_token = admin_login_response.json()["accessToken"]

    register_response = client.post(
        "/api/auth/register/",
        json={"username": username, "password": password, "role": "operator"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert register_response.status_code == 200
    created = register_response.json()
    assert created["username"] == username
    assert created["role"] == "operator"
    assert "password" not in created
    assert "passwordHash" not in created

    login_response = client.post(
        "/api/auth/login/",
        json={"username": username, "password": password},
    )

    assert login_response.status_code == 200
    token = login_response.json()["accessToken"]
    assert token

    me_response = client.get("/api/auth/me/", headers={"Authorization": f"Bearer {token}"})

    assert me_response.status_code == 200
    assert me_response.json()["username"] == username

    accounts_response = client.get("/api/accounts/", headers={"Authorization": f"Bearer {token}"})

    assert accounts_response.status_code == 200
    assert any(item["username"] == username for item in accounts_response.json()["items"])


def test_login_rejects_wrong_password():
    username = "operator_wrong_password"
    admin_login_response = client.post(
        "/api/auth/login/",
        json={"username": "admin", "password": "123456"},
    )
    admin_token = admin_login_response.json()["accessToken"]
    client.post(
        "/api/auth/register/",
        json={"username": username, "password": "RightPass123", "role": "admin"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    response = client.post(
        "/api/auth/login/",
        json={"username": username, "password": "WrongPass123"},
    )

    assert response.status_code == 401


def test_account_management_requires_login():
    response = client.get("/api/accounts/")

    assert response.status_code == 401


def test_create_product_rejects_invalid_payload():
    response = client.post(
        "/api/products/",
        json={
            "name": " ",
            "category": "食品饮品",
            "sellingPoints": [],
            "price": -1,
            "livePrice": 39,
            "promotionRule": "直播间第二件半价",
            "stock": 88,
            "notes": "含坚果，过敏人群留意配料",
            "suitableFor": ["学生党"],
            "imageUrl": "/products/oatmeal.jpg",
            "imageAlt": "坚果包产品图",
            "imageCredit": "用户上传",
        },
    )

    assert response.status_code == 422


def test_upload_product_image_returns_static_url():
    response = client.post(
        "/api/uploads/product-image/",
        files={"file": ("sample.png", b"\x89PNG\r\n\x1a\nfake-image-bytes", "image/png")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["imageUrl"].startswith("/uploads/products/")
    assert data["fileName"].endswith(".png")


def test_upload_product_image_rejects_non_image_file():
    response = client.post(
        "/api/uploads/product-image/",
        files={"file": ("sample.txt", b"not image", "text/plain")},
    )

    assert response.status_code == 400


def test_upload_product_image_rejects_spoofed_image_file():
    response = client.post(
        "/api/uploads/product-image/",
        files={"file": ("sample.png", b"not-a-real-png", "image/png")},
    )

    assert response.status_code == 400


def test_product_draft_endpoint_generates_stable_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    response = client.post(
        "/api/products/draft/",
        json={
            "name": "校园能量坚果包",
            "price": 59,
            "livePrice": 39,
            "promotionRule": "直播间第二件半价",
            "stock": 88,
            "imageUrl": "/uploads/products/nuts.png",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "fallback"
    assert data["product"]["name"] == "校园能量坚果包"
    assert data["product"]["category"] == "食品饮品"
    assert "学生党" in data["product"]["suitableFor"]
    assert len(data["product"]["sellingPoints"]) >= 3
    assert [section["title"] for section in data["sections"]] == [
        "开场引导",
        "商品卖点",
        "促销提醒",
        "互动提问",
        "成交引导",
        "合规提示",
    ]


def test_danmu_endpoint_returns_seed_danmu_items():
    response = client.get("/api/danmu/")

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) >= 50
    assert data["items"][0] == {
        "id": 1,
        "text": "这个多少钱？",
        "category": "价格",
        "emotion": "感兴趣",
    }


def test_script_generation_uses_product_profile_and_type(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    response = client.post(
        "/api/script/generate/",
        json={"productId": 1, "profile": "学生党", "scriptType": "促销提醒"},
    )

    assert response.status_code == 200
    script = response.json()["script"]
    assert "云朵保温杯" in script
    assert "直播价 69 元" in script
    assert "直播间立减 30 元" in script
    assert response.json()["source"] == "fallback"


def test_script_generation_uses_openai_when_api_key_is_configured(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"output_text": json.dumps({"script": "AI 已结合商品、画像和优惠规则生成差异化主播话术。"})}

    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()

    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("backend.app.services.httpx.post", fake_post)

    response = client.post(
        "/api/script/generate/",
        json={"productId": 1, "profile": get_args(UserProfile)[0], "scriptType": get_args(ScriptType)[0]},
    )

    assert response.status_code == 200
    assert response.json() == {"script": "AI 已结合商品、画像和优惠规则生成差异化主播话术。", "source": "llm"}
    assert calls
    assert calls[0][1]["json"]["text"]["format"]["name"] == "live_script"


def test_script_generation_uses_deepseek_chat_completions_when_configured(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": json.dumps({"script": "DeepSeek 已结合商品、画像和优惠规则生成主播话术。"})}}]}

    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr("backend.app.services.httpx.post", fake_post)

    response = client.post(
        "/api/script/generate/",
        json={"productId": 1, "profile": get_args(UserProfile)[0], "scriptType": get_args(ScriptType)[0]},
    )

    assert response.status_code == 200
    assert response.json() == {"script": "DeepSeek 已结合商品、画像和优惠规则生成主播话术。", "source": "llm"}
    assert calls
    assert calls[0][0] == "https://api.deepseek.com/chat/completions"
    assert calls[0][1]["json"]["model"] == "deepseek-chat"
    assert calls[0][1]["json"]["response_format"] == {"type": "json_object"}


def test_script_sections_endpoint_returns_structured_backend_sections(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    response = client.post(
        "/api/script/sections/",
        json={"productId": 1, "profile": "宝妈"},
    )

    assert response.status_code == 200
    data = response.json()
    assert [item["title"] for item in data["sections"]] == [
        "开场引导",
        "商品卖点",
        "促销提醒",
        "互动提问",
        "成交引导",
        "合规提示",
    ]
    assert data["sections"][2]["value"].startswith("云朵保温杯价格透明讲")
    assert data["source"] == "fallback"


def test_script_sections_endpoint_uses_deepseek_when_configured(monkeypatch):
    titles = ["开场引导", "商品卖点", "促销提醒", "互动提问", "成交引导", "合规提示"]

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "sections": [
                                        {"title": title, "value": f"DeepSeek 为{title}生成的差异化直播话术，结合商品、画像、价格和合规边界。"}
                                        for title in titles
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }

    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr("backend.app.services.httpx.post", fake_post)

    response = client.post(
        "/api/script/sections/",
        json={"productId": 1, "profile": "学生党"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "llm"
    assert [item["title"] for item in data["sections"]] == titles
    assert "DeepSeek" in data["sections"][0]["value"]
    assert calls[0][1]["json"]["model"] == "deepseek-chat"
    assert "开场引导" in calls[0][1]["json"]["messages"][1]["content"]


def test_script_sections_endpoint_accepts_deepseek_keyed_section_object(monkeypatch):
    titles = ["开场引导", "商品卖点", "促销提醒", "互动提问", "成交引导", "合规提示"]

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    title: f"DeepSeek 直接用标题做键生成的{title}话术，内容结合商品资料、用户画像和直播合规边界。"
                                    for title in titles
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr("backend.app.services.httpx.post", lambda *args, **kwargs: FakeResponse())

    response = client.post(
        "/api/script/sections/",
        json={"productId": 1, "profile": "学生党"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "llm"
    assert [item["title"] for item in data["sections"]] == titles
    assert data["sections"][0]["value"].startswith("DeepSeek 直接用标题做键")


def test_danmu_answer_returns_reply_log_and_qa_log(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/api/danmu/answer/",
        json={
            "productId": 1,
            "profile": "学生党",
            "danmuId": 2,
            "text": "两件到底便宜多少？",
            "category": "优惠计算",
            "emotion": "犹豫",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "买 2 件预估" in data["answer"]
    assert data["logs"][0]["tool"] == "calculateDiscount"
    assert data["qaLog"]["question"] == "两件到底便宜多少？"
    assert data["qaLog"]["productName"] == "云朵保温杯"
    assert [item["agent"] for item in data["agentTrace"]] == ["场控 Agent", "客服 Agent", "合规审查 Agent", "主播 Agent"]
    assert data["agentTrace"][0]["status"] == "已完成"


def test_danmu_answer_uses_deepseek_when_configured(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "answer": "DeepSeek 已结合商品资料、用户画像、工具结果和合规要求生成直播间问答回复。"
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }

    calls = []

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr("backend.app.services.httpx.post", fake_post)

    response = client.post(
        "/api/danmu/answer/",
        json={
            "productId": 1,
            "profile": "学生党",
            "danmuId": 2991,
            "text": "两件有没有优惠？",
            "category": "优惠计算",
            "emotion": "犹豫",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["answer"] == "DeepSeek 已结合商品资料、用户画像、工具结果和合规要求生成直播间问答回复。"
    assert data["qaLog"]["answer"] == data["answer"]
    assert data["logs"][0]["tool"] == "calculateDiscount"
    assert calls
    assert calls[0][0] == "https://api.deepseek.com/chat/completions"
    assert "两件有没有优惠？" in calls[0][1]["json"]["messages"][1]["content"]


def test_danmu_answer_persists_qa_and_tool_logs(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    danmu = client.get("/api/danmu/").json()["items"][1]
    response = client.post(
        "/api/danmu/answer/",
        json={
            "productId": 1,
            "profile": get_args(UserProfile)[0],
            "danmuId": danmu["id"],
            "text": danmu["text"],
            "category": danmu["category"],
            "emotion": danmu["emotion"],
        },
    )

    assert response.status_code == 200
    qa_log = response.json()["qaLog"]

    qa_response = client.get("/api/live/qa-logs/")
    tool_response = client.get("/api/live/tool-logs/")

    assert qa_response.status_code == 200
    assert tool_response.status_code == 200
    assert any(item["id"] == qa_log["id"] for item in qa_response.json()["items"])
    assert any(item["tool"] == "calculateDiscount" for item in tool_response.json()["items"])


def test_user_question_appears_in_danmu_feed(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/api/danmu/answer/",
        json={
            "productId": 1,
            "profile": get_args(UserProfile)[0],
            "danmuId": 991,
            "text": "用户端提问会出现在管理端吗？",
            "category": "价格",
            "emotion": "感兴趣",
        },
    )

    assert response.status_code == 200
    feed_response = client.get("/api/danmu/")
    assert feed_response.status_code == 200
    assert any(item["text"] == "用户端提问会出现在管理端吗？" for item in feed_response.json()["items"])


def test_danmu_feed_deduplicates_repeated_user_question_text(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    for danmu_id in (1991, 1992):
        response = client.post(
            "/api/danmu/answer/",
            json={
                "productId": 1,
                "profile": get_args(UserProfile)[0],
                "danmuId": danmu_id,
                "text": "你好",
                "category": "价格",
                "emotion": "感兴趣",
            },
        )
        assert response.status_code == 200

    feed_response = client.get("/api/danmu/")

    assert feed_response.status_code == 200
    matching_items = [item for item in feed_response.json()["items"] if item["text"] == "你好"]
    assert len(matching_items) == 1


def test_review_generation_returns_structured_report():
    response = client.post(
        "/api/review/generate/",
        json={
            "qaLogs": [
                {
                    "id": 1,
                    "question": "是不是全网最低价？",
                    "answer": "不能承诺全网最低价。",
                    "category": "异常合规",
                    "emotion": "质疑",
                    "productName": "云朵保温杯",
                },
                {
                    "id": 2,
                    "question": "两件到底便宜多少？",
                    "answer": "两件预估 128 元。",
                    "category": "优惠计算",
                    "emotion": "犹豫",
                    "productName": "云朵保温杯",
                },
            ]
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["emotionSummary"]["质疑"] == 1
    assert data["emotionSummary"]["犹豫"] == 1
    assert any("异常合规" in item for item in data["highFrequencyQuestions"])
    assert len(data["nextProductOrder"]) == 5

    latest = client.get("/api/review/latest/")
    assert latest.status_code == 200
    assert latest.json()["report"]["emotionSummary"]["质疑"] == 1


def test_missing_product_returns_404_for_script_generation():
    response = client.post(
        "/api/script/generate/",
        json={"productId": 999, "profile": "学生党", "scriptType": "开场"},
    )

    assert response.status_code == 404


def test_invalid_profile_returns_422_for_script_generation():
    response = client.post(
        "/api/script/generate/",
        json={"productId": 1, "profile": "未知画像", "scriptType": "开场"},
    )

    assert response.status_code == 422


def test_empty_review_logs_return_stable_report_shape():
    response = client.post("/api/review/generate/", json={"qaLogs": []})

    assert response.status_code == 200
    data = response.json()
    assert data["highFrequencyQuestions"] == ["价格、优惠、售后仍需积累样本"]
    assert data["emotionSummary"] == {"感兴趣": 0, "犹豫": 0, "质疑": 0, "投诉": 0}
    assert len(data["blockers"]) == 3
    assert len(data["suggestions"]) == 3


@pytest.mark.parametrize("product_id", range(1, 11))
@pytest.mark.parametrize(
    "payload",
    [
        {"danmuId": 101, "text": "这个多少钱？", "category": "价格", "emotion": "感兴趣"},
        {"danmuId": 102, "text": "库存还多吗？", "category": "规格", "emotion": "感兴趣"},
        {"danmuId": 103, "text": "可以七天无理由吗？", "category": "售后", "emotion": "犹豫"},
        {"danmuId": 104, "text": "是不是全网最低价？", "category": "异常合规", "emotion": "质疑"},
    ],
)
def test_each_product_handles_core_question_types(product_id, payload, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/api/danmu/answer/",
        json={"productId": product_id, "profile": "学生党", **payload},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["answer"]
    assert data["qaLog"]["productName"]
    assert len(data["logs"]) >= 1
    assert len(data["agentTrace"]) == 4

from collections import Counter
from datetime import datetime
import json
import os
from uuid import uuid4

import httpx

from .models import (
    AgentTraceItem,
    Danmu,
    Order,
    OrderCreateRequest,
    OrderItem,
    Product,
    ProductCreateRequest,
    ProductDraftRequest,
    ProductDraftResponse,
    QaLog,
    ReviewReportData,
    ScriptSection,
    ScriptType,
    ToolLog,
    UserProfile,
)


def now_time() -> str:
    return datetime.now().strftime("%H:%M:%S")


def make_record_id() -> int:
    return uuid4().int % 2_000_000_000


def calculate_discount(product: Product, quantity: int = 1) -> int:
    total = product.livePrice * quantity

    if "满 2 件" in product.promotionRule and quantity >= 2:
        total -= 10
    if "第二件半价" in product.promotionRule and quantity >= 2:
        total = product.livePrice + product.livePrice / 2
    if "满 99" in product.promotionRule and total >= 99:
        total -= 15
    if "拍 2 件" in product.promotionRule and quantity >= 2:
        total -= 25

    return max(int(total), 0)


def sanitize_script_text(text: str) -> str:
    replacements = {
        "全网最低": "直播间优惠",
        "最低价": "优惠价",
        "治愈": "舒服",
        "治疗": "日常护理",
        "疗效": "使用体验",
        "手慢无": "库存有限",
        "必备": "适合",
    }
    cleaned = text
    for source, target in replacements.items():
        cleaned = cleaned.replace(source, target)
    return cleaned.strip()


def create_order_from_payload(payload: OrderCreateRequest, products: list[Product]) -> Order | None:
    product_map = {product.id: product for product in products}
    items: list[OrderItem] = []

    for item in payload.items:
        product = product_map.get(item.productId)
        if product is None:
            return None
        subtotal = product.livePrice * item.quantity
        items.append(
            OrderItem(
                productId=product.id,
                productName=product.name,
                imageUrl=product.imageUrl,
                livePrice=product.livePrice,
                quantity=item.quantity,
                subtotal=subtotal,
            )
        )

    return Order(
        id=0,
        profile=payload.profile,
        items=items,
        totalAmount=sum(item.subtotal for item in items),
        status="已下单",
        createdAt=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )


def generate_script(product: Product, profile: UserProfile, script_type: ScriptType) -> str:
    tone = {
        "学生党": "预算友好、节奏直接、强调实用",
        "宝妈": "安心细致、先讲注意事项、少一点催促",
        "精致白领": "高效克制、强调体验和质感",
    }[profile]

    script_map = {
        "开场": f"各位晚上好，场控先把今天节奏说清楚：我们用 3 分钟讲清 {product.name} 的场景、价格和注意事项。它适合{'、'.join(product.suitableFor)}，今天直播价 {product.livePrice} 元，库存 {product.stock} 件。今天话术风格会偏{tone}。",
        "产品介绍": f"{product.name}不是靠一句口号成交，核心看三件事：{'、'.join(product.sellingPoints)}。如果你是{profile}，重点听它解决什么日常问题、有什么限制、是否值得现在拍。",
        "促销提醒": f"{product.name}价格透明讲：原价 {product.price} 元，直播价 {product.livePrice} 元；当前活动是「{product.promotionRule}」。先领券再下单，页面显示为准，不做全网最低这类绝对承诺。",
        "互动提问": "弹幕区直接打你的顾虑：价格、规格、售后、适用人群、优惠怎么算都可以。场控会把高频问题置顶，主播按问题热度来讲，不让信息散掉。",
        "收尾": f"这一轮总结：{product.name}主打{'、'.join(product.sellingPoints[:2])}，直播价 {product.livePrice} 元。注意：{product.notes}。合适再拍，不适合不要冲动，下一轮我们进入同类对比和库存提醒。",
    }
    return script_map[script_type]


def generate_script_sections(product: Product, profile: UserProfile) -> list[ScriptSection]:
    return [
        ScriptSection(title="开场引导", value=generate_script(product, profile, "开场")),
        ScriptSection(title="商品卖点", value=generate_script(product, profile, "产品介绍")),
        ScriptSection(title="促销提醒", value=generate_script(product, profile, "促销提醒")),
        ScriptSection(title="互动提问", value=generate_script(product, profile, "互动提问")),
        ScriptSection(title="成交引导", value=generate_script(product, profile, "收尾")),
        ScriptSection(
            title="合规提示",
            value="不承诺全网最低，不宣传治疗效果，价格和售后以下单页与店铺规则为准。",
        ),
    ]


def generate_ai_script(product: Product, profile: UserProfile, script_type: ScriptType) -> tuple[str, str]:
    llm_script = _generate_script_with_openai(product, profile, script_type)
    if llm_script:
        return llm_script, "llm"
    return generate_script(product, profile, script_type), "fallback"


def generate_ai_script_sections(product: Product, profile: UserProfile) -> tuple[list[ScriptSection], str]:
    llm_sections = _generate_script_sections_with_openai(product, profile)
    if llm_sections:
        return llm_sections, "llm"
    return generate_script_sections(product, profile), "fallback"


def generate_product_draft(payload: ProductDraftRequest) -> ProductDraftResponse:
    llm_product = _generate_product_with_openai(payload)
    source = "llm" if llm_product is not None else "fallback"
    product = llm_product or _fallback_product_draft(payload)
    draft_product = Product(id=0, **product.model_dump())
    sections, _ = generate_ai_script_sections(draft_product, payload.profile)

    return ProductDraftResponse(
        product=product,
        sections=sections,
        source=source,
        message="已使用大模型生成商品资料和主播话术" if source == "llm" else "未检测到可用大模型配置，已使用本地规则生成稳定草稿",
    )


def _fallback_product_draft(payload: ProductDraftRequest) -> ProductCreateRequest:
    name = payload.name
    rules = [
        (
            ("坚果", "燕麦", "咖啡", "饮品", "零食", "早餐"),
            "食品饮品",
            ["便携补给", "独立包装", "适合日常囤货"],
            ["学生党", "精致白领"],
            "食品类商品请留意配料、保质期和过敏原",
        ),
        (
            ("台灯", "文具", "笔", "书桌", "收纳", "学习"),
            "学习办公",
            ["桌面场景适配", "宿舍友好", "提升学习效率"],
            ["学生党", "精致白领"],
            "使用前请确认尺寸、功率或承重限制",
        ),
        (
            ("湿巾", "婴儿", "宝宝", "母婴", "纸尿裤"),
            "母婴用品",
            ["日常消耗刚需", "温和场景", "家庭囤货友好"],
            ["宝妈"],
            "婴幼儿使用前建议先确认成分和适用年龄",
        ),
        (
            ("洁面", "面膜", "护肤", "洗面奶", "精华"),
            "个护美妆",
            ["温和护理", "使用步骤简单", "适合日常清洁"],
            ["学生党", "精致白领"],
            "敏感肌建议先做局部测试",
        ),
        (
            ("耳机", "充电", "蓝牙", "键盘", "数码"),
            "数码配件",
            ["高频使用", "通勤学习适配", "操作简单"],
            ["学生党", "精致白领"],
            "请以详情页规格和售后政策为准",
        ),
    ]

    category = "校园好物"
    selling_points = ["直播间精选", "场景实用", "适合日常使用"]
    suitable_for = ["学生党"]
    notes = "请以下单页规格、价格和售后规则为准"
    for keywords, next_category, next_points, next_suitable, next_notes in rules:
        if any(keyword in name for keyword in keywords):
            category = next_category
            selling_points = next_points
            suitable_for = next_suitable
            notes = next_notes
            break

    price = payload.price if payload.price is not None else 99
    live_price = payload.livePrice if payload.livePrice is not None else max(price - 20, 1)
    promotion_rule = payload.promotionRule or "直播间专属价，具体优惠以下单页为准"

    return ProductCreateRequest(
        name=name,
        category=category,
        sellingPoints=selling_points,
        price=price,
        livePrice=live_price,
        promotionRule=promotion_rule,
        stock=payload.stock if payload.stock is not None else 80,
        notes=notes,
        suitableFor=suitable_for,
        imageUrl=payload.imageUrl or "/products/cup.jpg",
        imageAlt=f"{name}商品图片",
        imageCredit="用户上传",
    )


def _has_llm_key() -> bool:
    return bool(os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY"))


def _request_llm_json(system_prompt: str, prompt: dict, schema_name: str, schema: dict) -> dict | None:
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    if deepseek_key:
        return _request_deepseek_json(deepseek_key, system_prompt, prompt)

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        return _request_openai_json(openai_key, system_prompt, prompt, schema_name, schema)

    return None


def _request_deepseek_json(api_key: str, system_prompt: str, prompt: dict) -> dict | None:
    response = httpx.post(
        f"{os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            "messages": [
                {"role": "system", "content": f"{system_prompt}\n只输出合法 JSON，不要输出 Markdown。"},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": 1200,
        },
        timeout=30,
    )
    response.raise_for_status()
    content = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        return None
    return json.loads(content)


def _request_openai_json(api_key: str, system_prompt: str, prompt: dict, schema_name: str, schema: dict) -> dict | None:
    response = httpx.post(
        f"{os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')}/responses",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            "input": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "schema": schema,
                    "strict": True,
                }
            },
        },
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    output_text = data.get("output_text") or _extract_response_text(data)
    return json.loads(output_text) if output_text else None


def _generate_script_with_openai(product: Product, profile: UserProfile, script_type: ScriptType) -> str | None:
    if not _has_llm_key():
        return None

    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["script"],
        "properties": {"script": {"type": "string", "minLength": 40}},
    }
    prompt = {
        "product": product.model_dump(),
        "profile": profile,
        "scriptType": script_type,
        "requirements": [
            "必须围绕当前商品资料生成，不要套用固定模板。",
            "结合用户画像调整语气：学生党更轻快实用，宝妈更安心细致，精致白领更高效克制。",
            "必须体现直播价、库存、优惠规则和至少两个商品卖点。",
            "不得承诺全网最低、夸大效果或使用误导性表达。",
            "输出 90 到 160 字，适合主播直接口播。",
        ],
    }

    try:
        generated = _request_llm_json(
            "你是直播电商主播 Agent，负责生成自然、有转化力且合规的中文主播话术。",
            prompt,
            "live_script",
            schema,
        )
        if not generated:
            return None
        script = str(generated.get("script", "")).strip()
        return sanitize_script_text(script) or None
    except Exception:
        return None


def _generate_script_sections_with_openai(product: Product, profile: UserProfile) -> list[ScriptSection] | None:
    if not _has_llm_key():
        return None

    titles = ["开场引导", "商品卖点", "促销提醒", "互动提问", "成交引导", "合规提示"]
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["sections"],
        "properties": {
            "sections": {
                "type": "array",
                "minItems": 6,
                "maxItems": 6,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["title", "value"],
                    "properties": {
                        "title": {"type": "string", "enum": titles},
                        "value": {"type": "string", "minLength": 30},
                    },
                },
            }
        },
    }
    prompt = {
        "product": product.model_dump(),
        "profile": profile,
        "titles": titles,
        "requirements": [
            "必须严格按照 titles 生成 6 段结构化主播话术，不要增加或减少段落。",
            "每段 50 到 120 字，必须像主播能直接读出来的话，而不是说明文。",
            "每段都要结合当前商品，不要使用泛泛模板。",
            "促销提醒要提到直播价、库存和优惠规则，但最终价格以下单页为准。",
            "合规提示必须避免全网最低、绝对化承诺、治疗功效等风险表达。",
        ],
    }

    try:
        generated = _request_llm_json(
            "你是直播电商主播 Agent，负责把商品资料拆成结构化、可口播、合规的中文直播话术。",
            {
                **prompt,
                "outputFormat": {
                    "sections": [
                        {"title": title, "value": f"{title}对应的中文口播话术"}
                        for title in titles
                    ]
                },
                "formatRule": "必须返回一个 JSON 对象，且只能包含 sections 字段；sections 必须是数组。",
            },
            "live_script_sections",
            schema,
        )
        if not generated:
            return None
        raw_sections = generated.get("sections")
        if not raw_sections:
            raw_sections = [{"title": title, "value": generated.get(title, "")} for title in titles]

        sections = [
            ScriptSection(title=item["title"], value=sanitize_script_text(str(item["value"])))
            for item in raw_sections
        ]
        if len(sections) != len(titles):
            return None
        if [section.title for section in sections] != titles:
            return None
        return sections
    except Exception:
        return None


def _generate_product_with_openai(payload: ProductDraftRequest) -> ProductCreateRequest | None:
    if not _has_llm_key():
        return None

    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "name",
            "category",
            "sellingPoints",
            "price",
            "livePrice",
            "promotionRule",
            "stock",
            "notes",
            "suitableFor",
            "imageUrl",
            "imageAlt",
            "imageCredit",
        ],
        "properties": {
            "name": {"type": "string"},
            "category": {"type": "string"},
            "sellingPoints": {"type": "array", "items": {"type": "string"}, "minItems": 3},
            "price": {"type": "integer", "minimum": 0},
            "livePrice": {"type": "integer", "minimum": 0},
            "promotionRule": {"type": "string"},
            "stock": {"type": "integer", "minimum": 0},
            "notes": {"type": "string"},
            "suitableFor": {"type": "array", "items": {"type": "string"}, "minItems": 1},
            "imageUrl": {"type": "string"},
            "imageAlt": {"type": "string"},
            "imageCredit": {"type": "string"},
        },
    }
    prompt = {
        "productName": payload.name,
        "price": payload.price,
        "livePrice": payload.livePrice,
        "promotionRule": payload.promotionRule,
        "stock": payload.stock,
        "imageUrl": payload.imageUrl or "/products/cup.jpg",
        "requirements": [
            "???????????",
            "??????????",
            "????????????????????",
            "???????????????????????????",
            "??????? schema ? JSON?",
        ],
    }

    try:
        generated = _request_llm_json(
            "???????? Agent????????????????????",
            prompt,
            "product_draft",
            schema,
        )
        if not generated:
            return None
        generated["imageUrl"] = payload.imageUrl or generated.get("imageUrl") or "/products/cup.jpg"
        generated["imageCredit"] = generated.get("imageCredit") or "AI ??"
        return ProductCreateRequest(**generated)
    except Exception:
        return None


def _extract_response_text(data: dict) -> str:
    chunks: list[str] = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                chunks.append(content["text"])
    return "".join(chunks)


def build_agent_trace(product: Product, danmu: Danmu, profile: UserProfile, logs: list[ToolLog]) -> list[AgentTraceItem]:
    tool_names = "、".join(log.tool for log in logs) if logs else "基础问答"
    compliance_status = "风险" if danmu.category == "异常合规" or "治" in danmu.text or "最低价" in danmu.text else "已完成"
    service_status = "需注意" if danmu.emotion in {"犹豫", "质疑", "投诉"} else "已完成"

    return [
        AgentTraceItem(
            agent="场控 Agent",
            action="识别弹幕意图与情绪",
            result=f"问题类型：{danmu.category}；用户情绪：{danmu.emotion}",
            status="已完成",
        ),
        AgentTraceItem(
            agent="客服 Agent",
            action="选择业务处理策略",
            result=f"面向{profile}，调用：{tool_names}",
            status=service_status,
        ),
        AgentTraceItem(
            agent="合规审查 Agent",
            action="检查绝对化、疗效和误导性表达",
            result="命中风险表达，回复需纠偏" if compliance_status == "风险" else f"{product.name}回复通过基础合规检查",
            status=compliance_status,
        ),
        AgentTraceItem(
            agent="主播 Agent",
            action="组织可播报回复",
            result="生成面向直播间的简洁回答，并保留下单页规则口径",
            status="已完成",
        ),
    ]


def _generate_danmu_answer_with_llm(
    product: Product,
    danmu: Danmu,
    profile: UserProfile,
    local_answer: str,
    logs: list[ToolLog],
) -> str | None:
    if not _has_llm_key():
        return None

    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["answer"],
        "properties": {"answer": {"type": "string", "minLength": 30}},
    }
    prompt = {
        "product": product.model_dump(),
        "profile": profile,
        "danmu": danmu.model_dump(),
        "toolLogs": [log.model_dump() for log in logs],
        "localAnswerReference": local_answer,
        "requirements": [
            "你正在回复直播间用户弹幕，要像客服 Agent 和主播 Agent 协作后的最终口播回复。",
            "必须结合工具调用结果，例如优惠计算、库存查询、商品推荐或合规检查。",
            "回答要针对用户原问题，不要泛泛介绍商品。",
            "语气根据用户画像调整，学生党更直接实用，宝妈更安心细致，精致白领更克制高效。",
            "不得承诺全网最低，不得宣传治疗、治愈、疗效，不得制造库存焦虑。",
            "价格、售后、规格必须提示以下单页和店铺规则为准。",
            "输出 60 到 140 字中文，只返回 answer 字段。",
        ],
    }

    try:
        generated = _request_llm_json(
            "你是直播电商客服 Agent，负责根据商品资料、弹幕问题、用户画像和工具结果生成合规的中文问答回复。",
            prompt,
            "danmu_answer",
            schema,
        )
        if not generated:
            return None
        answer = sanitize_script_text(str(generated.get("answer", "")).strip())
        return answer or None
    except Exception:
        return None


def answer_danmu(product: Product, danmu: Danmu, profile: UserProfile) -> tuple[str, list[ToolLog], QaLog, list[AgentTraceItem], str]:
    log_id = make_record_id()
    logs: list[ToolLog] = []
    answer = ""

    if danmu.category == "异常合规" or "治" in danmu.text or "最低价" in danmu.text:
        logs.append(
            ToolLog(
                id=log_id,
                tool="complianceCheck",
                input=danmu.text,
                output="命中合规提醒：避免疗效承诺、全网最低等绝对化表述",
                time=now_time(),
            )
        )
        answer = f"这个问题要谨慎答：{product.name}不能宣传治疗、治愈等效果，也不能承诺全网最低价。能确认的是当前直播间价格 {product.livePrice} 元，活动规则是「{product.promotionRule}」，下单页信息为准。"
    elif danmu.category == "优惠计算" or "优惠" in danmu.text or "便宜" in danmu.text:
        total = calculate_discount(product, 2)
        logs.append(
            ToolLog(
                id=log_id,
                tool="calculateDiscount",
                input=f"{product.name} x 2",
                output=f"两件预估到手 {total} 元",
                time=now_time(),
            )
        )
        answer = f"按当前活动算，{product.name}买 2 件预估 {total} 元。{profile}如果只是试用，一件就够；如果要拼单或囤货，两件会更划算，最终价格以下单页为准。"
    elif danmu.category == "规格" or "库存" in danmu.text:
        logs.append(
            ToolLog(
                id=log_id,
                tool="queryStock",
                input=product.name,
                output=f"当前库存 {product.stock} 件",
                time=now_time(),
            )
        )
        answer = f"{product.name}当前库存 {product.stock} 件。规格重点看详情页，卖点是{'、'.join(product.sellingPoints)}。如果库存低于 40，场控会提醒主播加快说明但不制造焦虑。"
    elif danmu.category == "适用人群":
        logs.append(
            ToolLog(
                id=log_id,
                tool="recommendProduct",
                input=profile,
                output=f"{'匹配' if profile in product.suitableFor else '部分匹配'}当前用户画像",
                time=now_time(),
            )
        )
        answer = f"{profile}可以重点看{product.sellingPoints[0]}。这款更适合{'、'.join(product.suitableFor)}；如果你在意「{product.notes}」，建议先确认详情再决定。"
    elif danmu.category == "售后":
        logs.append(
            ToolLog(
                id=log_id,
                tool="complianceCheck",
                input=danmu.text,
                output="售后答复需以下单页和店铺规则为准",
                time=now_time(),
            )
        )
        answer = f"售后以店铺页面规则为准。下单前先确认规格、数量和注意事项：{product.notes}。收到后如果有问题，保留订单、包装和凭证联系售后处理。"
    elif danmu.category == "异议质疑":
        logs.append(
            ToolLog(
                id=log_id,
                tool="complianceCheck",
                input=danmu.text,
                output="建议用事实回应，不贬低竞品，不夸大效果",
                time=now_time(),
            )
        )
        answer = f"你的担心合理。我们只讲可验证的信息：{product.name}卖点是{'、'.join(product.sellingPoints)}，直播价 {product.livePrice} 元，注意事项是「{product.notes}」。适合再拍，不适合别冲动。"
    else:
        logs.append(
            ToolLog(
                id=log_id,
                tool="calculateDiscount",
                input=f"{product.name} x 1",
                output=f"单件直播价 {product.livePrice} 元，优惠规则：{product.promotionRule}",
                time=now_time(),
            )
        )
        answer = f"{product.name}今天直播价 {product.livePrice} 元，活动是「{product.promotionRule}」。你可以继续问价格、规格、售后或适用人群，我按问题帮你拆。"

    llm_answer = _generate_danmu_answer_with_llm(product, danmu, profile, answer, logs)
    source = "fallback"
    if llm_answer:
        answer = llm_answer
        source = "llm"

    qa_log = QaLog(
        id=log_id,
        question=danmu.text,
        answer=answer,
        category=danmu.category,
        emotion=danmu.emotion,
        productName=product.name,
    )
    return answer, logs, qa_log, build_agent_trace(product, danmu, profile, logs), source


def generate_review(qa_logs: list[QaLog], products: list[Product]) -> ReviewReportData:
    emotion_summary = {"感兴趣": 0, "犹豫": 0, "质疑": 0, "投诉": 0}
    for item in qa_logs:
        emotion_summary[item.emotion] += 1

    category_count = Counter(item.category for item in qa_logs)
    high_frequency = [
        f"{category}类问题 {count} 次"
        for category, count in sorted(category_count.items(), key=lambda item: item[1], reverse=True)[:4]
    ]

    low_stock = [product.name for product in products if product.stock < 40]

    return ReviewReportData(
        highFrequencyQuestions=high_frequency or ["价格、优惠、售后仍需积累样本"],
        emotionSummary=emotion_summary,
        blockers=[
            "用户在优惠计算和售后规则上容易犹豫",
            "异常合规问题需要主播避开绝对化表述",
            f"{'、'.join(low_stock)}库存偏低，讲解时需要提前说明" if low_stock else "暂无明显库存风险",
        ],
        suggestions=[
            "开场 3 分钟先讲活动规则，减少重复问价",
            "质疑类弹幕用事实回应，避免夸张承诺",
            "每个商品收尾固定补充售后、规格和注意事项",
        ],
        nextProductOrder=[product.name for product in sorted(products, key=lambda item: item.stock, reverse=True)[:5]],
    )

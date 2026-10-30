import type {
  Danmu,
  Emotion,
  Order,
  Product,
  QaLog,
  ReviewReportData,
  ScriptType,
  ToolLog,
  UserProfile
} from "../types";

export function nowTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

export function calculateDiscount(product: Product, quantity = 1) {
  let total = product.livePrice * quantity;

  if (product.promotionRule.includes("满 2 件") && quantity >= 2) {
    total -= 10;
  }

  if (product.promotionRule.includes("第二件半价") && quantity >= 2) {
    total = product.livePrice + product.livePrice / 2;
  }

  if (product.promotionRule.includes("满 99") && total >= 99) {
    total -= 15;
  }

  if (product.promotionRule.includes("拍 2 件") && quantity >= 2) {
    total -= 25;
  }

  return Math.max(total, 0);
}

export function generateScript(product: Product, profile: UserProfile, type: ScriptType) {
  const tone = {
    学生党: "预算友好、节奏直接、强调实用",
    宝妈: "安心细致、先讲注意事项、少一点催促",
    精致白领: "高效克制、强调体验和质感"
  }[profile];

  const scriptMap: Record<ScriptType, string> = {
    开场: `各位晚上好，场控先把今天节奏说清楚：我们用 3 分钟讲清 ${product.name} 的场景、价格和注意事项。它适合${product.suitableFor.join("、")}，今天直播价 ${product.livePrice} 元，库存 ${product.stock} 件。今天话术风格会偏${tone}。`,
    产品介绍: `${product.name}不是靠一句口号成交，核心看三件事：${product.sellingPoints.join("、")}。如果你是${profile}，重点听它解决什么日常问题、有什么限制、是否值得现在拍。`,
    促销提醒: `价格透明讲：原价 ${product.price} 元，直播价 ${product.livePrice} 元；当前活动是「${product.promotionRule}」。先领券再下单，页面显示为准，不做全网最低这类绝对承诺。`,
    互动提问: `弹幕区直接打你的顾虑：价格、规格、售后、适用人群、优惠怎么算都可以。场控会把高频问题置顶，主播按问题热度来讲，不让信息散掉。`,
    收尾: `这一轮总结：${product.name}主打${product.sellingPoints.slice(0, 2).join("、")}，直播价 ${product.livePrice} 元。注意：${product.notes}。合适再拍，不适合不要冲动，下一轮我们进入同类对比和库存提醒。`
  };

  return scriptMap[type];
}

export function answerDanmu(product: Product, danmu: Danmu, profile: UserProfile) {
  const logs: Omit<ToolLog, "id">[] = [];
  const lowerText = danmu.text.toLowerCase();
  let answer = "";

  if (danmu.category === "异常合规" || lowerText.includes("治") || lowerText.includes("最低价")) {
    logs.push({
      tool: "complianceCheck",
      input: danmu.text,
      output: "命中合规提醒：避免疗效承诺、全网最低等绝对化表述",
      time: nowTime()
    });
    answer = `这个问题要谨慎答：${product.name}不能宣传治疗、治愈等效果，也不能承诺全网最低价。能确认的是当前直播间价格 ${product.livePrice} 元，活动规则是「${product.promotionRule}」，下单页信息为准。`;
    return { answer, logs };
  }

  if (danmu.category === "优惠计算" || danmu.text.includes("优惠") || danmu.text.includes("便宜")) {
    const total = calculateDiscount(product, 2);
    logs.push({
      tool: "calculateDiscount",
      input: `${product.name} x 2`,
      output: `两件预估到手 ${total} 元`,
      time: nowTime()
    });
    answer = `按当前活动算，${product.name}买 2 件预估 ${total} 元。${profile}如果只是试用，一件就够；如果要拼单或囤货，两件会更划算，最终价格以下单页为准。`;
    return { answer, logs };
  }

  if (danmu.category === "规格" || danmu.text.includes("库存")) {
    logs.push({
      tool: "queryStock",
      input: product.name,
      output: `当前库存 ${product.stock} 件`,
      time: nowTime()
    });
    answer = `${product.name}当前库存 ${product.stock} 件。规格重点看详情页，卖点是${product.sellingPoints.join("、")}。如果库存低于 40，场控会提醒主播加快说明但不制造焦虑。`;
    return { answer, logs };
  }

  if (danmu.category === "适用人群") {
    logs.push({
      tool: "recommendProduct",
      input: profile,
      output: `${product.suitableFor.includes(profile) ? "匹配" : "部分匹配"}当前用户画像`,
      time: nowTime()
    });
    answer = `${profile}可以重点看${product.sellingPoints[0]}。这款更适合${product.suitableFor.join("、")}；如果你在意「${product.notes}」，建议先确认详情再决定。`;
    return { answer, logs };
  }

  if (danmu.category === "售后") {
    logs.push({
      tool: "complianceCheck",
      input: danmu.text,
      output: "售后答复需以下单页和店铺规则为准",
      time: nowTime()
    });
    answer = `售后以店铺页面规则为准。下单前先确认规格、数量和注意事项：${product.notes}。收到后如果有问题，保留订单、包装和凭证联系售后处理。`;
    return { answer, logs };
  }

  if (danmu.category === "异议质疑") {
    logs.push({
      tool: "complianceCheck",
      input: danmu.text,
      output: "建议用事实回应，不贬低竞品，不夸大效果",
      time: nowTime()
    });
    answer = `你的担心合理。我们只讲可验证的信息：${product.name}卖点是${product.sellingPoints.join("、")}，直播价 ${product.livePrice} 元，注意事项是「${product.notes}」。适合再拍，不适合别冲动。`;
    return { answer, logs };
  }

  logs.push({
    tool: "calculateDiscount",
    input: `${product.name} x 1`,
    output: `单件直播价 ${product.livePrice} 元，优惠规则：${product.promotionRule}`,
    time: nowTime()
  });
  answer = `${product.name}今天直播价 ${product.livePrice} 元，活动是「${product.promotionRule}」。你可以继续问价格、规格、售后或适用人群，我按问题帮你拆。`;
  return { answer, logs };
}

export function generateReview(qaLogs: QaLog[], products: Product[], orders?: Order[]): ReviewReportData {
  const emotionSummary = qaLogs.reduce<Record<Emotion, number>>(
    (acc, item) => {
      acc[item.emotion] += 1;
      return acc;
    },
    { 感兴趣: 0, 犹豫: 0, 质疑: 0, 投诉: 0 }
  );

  const categoryCount = qaLogs.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const highFrequencyQuestions = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category, count]) => `${category}类问题 ${count} 次`);

  const lowStock = products.filter((product) => product.stock < 40).map((product) => product.name);

  // 销售统计
  const orderList = orders ?? [];
  const totalOrders = orderList.length;
  const totalQuantity = orderList.reduce((sum, order) => sum + order.items.reduce((s, item) => s + item.quantity, 0), 0);
  const totalAmount = orderList.reduce((sum, order) => sum + order.totalAmount, 0);
  const avgOrderValue = totalOrders > 0 ? Math.round((totalAmount / totalOrders) * 100) / 100 : 0;

  const productSalesMap = new Map<number, { productId: number; productName: string; quantity: number; amount: number }>();
  orderList.forEach((order) => {
    order.items.forEach((item) => {
      const existing = productSalesMap.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.amount += item.subtotal;
      } else {
        productSalesMap.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          amount: item.subtotal
        });
      }
    });
  });
  const productSales = Array.from(productSalesMap.values()).sort((a, b) => b.quantity - a.quantity);

  return {
    highFrequencyQuestions: highFrequencyQuestions.length ? highFrequencyQuestions : ["价格、优惠、售后仍需积累样本"],
    emotionSummary,
    blockers: [
      "用户在优惠计算和售后规则上容易犹豫",
      "异常合规问题需要主播避开绝对化表述",
      lowStock.length ? `${lowStock.join("、")}库存偏低，讲解时需要提前说明` : "暂无明显库存风险"
    ],
    suggestions: [
      "开场 3 分钟先讲活动规则，减少重复问价",
      "质疑类弹幕用事实回应，避免夸张承诺",
      "每个商品收尾固定补充售后、规格和注意事项"
    ],
    nextProductOrder: [...products]
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 5)
      .map((product) => product.name),
    salesSummary: orders ? {
      totalOrders,
      totalQuantity,
      totalAmount,
      avgOrderValue,
      productSales
    } : null
  };
}

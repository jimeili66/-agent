import {
  Bot,
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  Package,
  Radio,
  ReceiptText,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createOrder, fetchProducts, requestDanmuAnswer } from "./api";
import { products as fallbackProducts } from "./data/products";
import type { Danmu, DanmuCategory, Emotion, Product, UserProfile } from "./types";
import { LIVE_CAMERA_CHANNEL, readLiveCameraFrame, type LiveCameraPayload } from "./utils/liveCameraSync";
import { resolveProductImageUrl } from "./utils/productImages";

type CartItem = {
  product: Product;
  quantity: number;
};

type ChatMessage = {
  id: number;
  role: "user" | "agent";
  text: string;
  category?: DanmuCategory;
  emotion?: Emotion;
  source?: "llm" | "fallback";
};

const quickQuestions = ["多少钱？", "两件有优惠吗？", "库存还多吗？", "适合学生用吗？", "售后怎么处理？"];
const profiles: UserProfile[] = ["学生党", "宝妈", "精致白领"];

function UserApp() {
  const [products, setProducts] = useState<Product[]>(() => fallbackProducts.map(enhanceProductImage));
  const [activeProductId, setActiveProductId] = useState(fallbackProducts[0]?.id ?? 1);
  const [profile, setProfile] = useState<UserProfile>("学生党");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [notice, setNotice] = useState("");
  const [liveCameraFrame, setLiveCameraFrame] = useState(() => readLiveCameraFrame());
  const isAskingRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "agent",
      text: "欢迎来到校园好物直播间。你可以直接问价格、优惠、库存、适用人群或售后，我会按当前商品帮你回答。"
    }
  ]);

  useEffect(() => {
    let mounted = true;
    fetchProducts()
      .then((remoteProducts) => {
        if (!mounted || remoteProducts.length === 0) return;
        setProducts(remoteProducts);
        setActiveProductId(remoteProducts[0].id);
      })
      .catch(() => {
        setNotice("后端暂不可用，当前展示本地商品数据。");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setLiveCameraFrame(readLiveCameraFrame());
    if (!("BroadcastChannel" in window)) {
      return undefined;
    }

    const channel = new BroadcastChannel(LIVE_CAMERA_CHANNEL);
    channel.onmessage = (event: MessageEvent<LiveCameraPayload>) => {
      const payload = event.data;
      if (payload.type === "camera-frame") {
        setLiveCameraFrame(payload.imageUrl);
      } else {
        setLiveCameraFrame("");
      }
    };

    return () => channel.close();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cachedFrame = readLiveCameraFrame();
      setLiveCameraFrame((current) => (current === cachedFrame ? current : cachedFrame));
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? products[0],
    [activeProductId, products]
  );

  const cartTotal = useMemo(
    () => cart.reduce((total, item) => total + estimatePrice(item.product, item.quantity), 0),
    [cart]
  );

  function addToCart(product = activeProduct) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...current, { product, quantity: 1 }];
    });
    setNotice(`已加入购物车：${product.name}`);
  }

  function changeQuantity(productId: number, delta: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId: number) {
    setCart((current) => current.filter((item) => item.product.id !== productId));
  }

  async function askAgent(text = question.trim()) {
    if (!text || !activeProduct || isAskingRef.current) return;

    isAskingRef.current = true;
    const danmu = classifyQuestion(text);
    setQuestion("");
    setIsAsking(true);
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text, category: danmu.category, emotion: danmu.emotion }
    ]);

    try {
      const response = await requestDanmuAnswer(activeProduct.id, profile, danmu);
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "agent",
          text: response.answer,
          category: danmu.category,
          emotion: danmu.emotion,
          source: response.source
        }
      ]);
      setNotice("");
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "agent",
          text: `${activeProduct.name}当前直播价 ¥${activeProduct.livePrice}，活动规则是「${activeProduct.promotionRule}」。售后、价格和规格以下单页为准。`,
          category: danmu.category,
          emotion: danmu.emotion
        }
      ]);
      setNotice("后端问答接口暂不可用，已使用本地兜底回复。");
    } finally {
      isAskingRef.current = false;
      setIsAsking(false);
    }
  }

  async function submitOrder() {
    if (cart.length === 0) {
      setNotice("请先把商品加入购物车。");
      return;
    }
    setIsSubmittingOrder(true);
    try {
      const order = await createOrder({
        profile,
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity }))
      });
      setNotice(`模拟下单成功：订单 #${order.id}，${cart.length} 种商品，合计 ¥${order.totalAmount}。`);
      setCart([]);
    } catch {
      setNotice("订单接口暂不可用，管理端暂时无法看到这笔下单。");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  if (!activeProduct) {
    return (
      <main className="user-live-page">
        <section className="user-empty">
          <Store size={32} />
          <h1>直播间暂未上架商品</h1>
          <p>当前直播间还没有可展示商品，请联系场控上架商品。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="user-live-page">
      <header className="user-live-header">
        <div className="user-brand">
          <span>
            <Radio size={20} />
          </span>
          <div>
            <strong>校园好物直播间</strong>
            <p>模拟直播中 · Agent 在线答疑</p>
          </div>
        </div>
        <nav>
          <a href="/user" className="active">
            用户端
          </a>
        </nav>
      </header>

      <section className="user-live-shell">
        <section className="live-stage">
          <div className="live-video">
            <img src={liveCameraFrame || activeProduct.imageUrl} alt={liveCameraFrame ? "主播摄像头实时画面" : activeProduct.imageAlt} />
            <div className="live-overlay top">
              <span className="live-dot" />
              {liveCameraFrame ? "主播直播中" : "正在讲解"}
            </div>
            <div className="live-overlay bottom">
              <strong>{activeProduct.name}</strong>
              <span>库存 {activeProduct.stock} 件</span>
            </div>
          </div>

          <div className="live-product-card">
            <p>{activeProduct.category}</p>
            <h1>{activeProduct.name}</h1>
            <div className="user-selling-points">
              {activeProduct.sellingPoints.map((point) => (
                <span key={point}>{point}</span>
              ))}
            </div>
            <div className="user-price-row">
              <div>
                <span>直播价</span>
                <strong>¥{activeProduct.livePrice}</strong>
              </div>
              <div>
                <span>原价</span>
                <del>¥{activeProduct.price}</del>
              </div>
              <div>
                <span>两件预估</span>
                <strong>¥{estimatePrice(activeProduct, 2)}</strong>
              </div>
            </div>
            <div className="promotion-strip">
              <Sparkles size={16} />
              {activeProduct.promotionRule}
            </div>
            <p className="product-note">{activeProduct.notes}</p>
            <div className="user-actions">
              <button className="buy-action" type="button" onClick={() => addToCart()}>
                <ShoppingBag size={18} />
                加入购物车
              </button>
              <button className="ghost-action" type="button" onClick={() => askAgent("这个适合我吗？")}>
                <MessageCircle size={18} />
                问问 Agent
              </button>
            </div>
          </div>
        </section>

        <aside className="user-chat-panel">
          <div className="panel-heading">
            <div>
              <Bot size={18} />
              <h2>直播间问答</h2>
            </div>
            <select value={profile} onChange={(event) => setProfile(event.target.value as UserProfile)}>
              {profiles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="quick-question-row">
            {quickQuestions.map((item) => (
              <button key={item} type="button" onClick={() => askAgent(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="chat-stream">
            {messages.slice(-8).map((message) => (
            <article key={message.id} className={`chat-message ${message.role}`}>
              <span>{message.role === "user" ? <UserRound size={15} /> : <Bot size={15} />}</span>
              <p>{message.text}</p>
              {message.role === "agent" && message.source ? (
                <small>{message.source === "llm" ? "DeepSeek Agent" : "本地兜底"}</small>
              ) : message.category ? (
                <small>{message.category}</small>
              ) : null}
            </article>
            ))}
          </div>

          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              void askAgent();
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="发弹幕问价格、库存、售后..."
            />
            <button type="submit" disabled={isAsking}>
              <Send size={17} />
            </button>
          </form>
        </aside>
      </section>

      <section className="user-lower-grid">
        <section className="user-product-list">
          <div className="section-title">
            <Package size={18} />
            <h2>本场商品</h2>
          </div>
          <div className="user-product-grid">
            {products.map((product) => (
              <button
                key={product.id}
                className={product.id === activeProduct.id ? "user-product-item active" : "user-product-item"}
                type="button"
                onClick={() => setActiveProductId(product.id)}
              >
                <img src={product.imageUrl} alt={product.imageAlt} />
                <span>{product.name}</span>
                <strong>¥{product.livePrice}</strong>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </section>

        <aside className="cart-panel">
          <div className="section-title">
            <ReceiptText size={18} />
            <h2>购物车</h2>
          </div>
          {cart.length === 0 ? (
            <p className="cart-empty">购物车为空，选择商品后可模拟下单。</p>
          ) : (
            <div className="cart-list">
              {cart.map((item) => (
                <article key={item.product.id} className="cart-item">
                  <img src={item.product.imageUrl} alt={item.product.imageAlt} />
                  <div>
                    <strong>{item.product.name}</strong>
                    <span>¥{estimatePrice(item.product, item.quantity)}</span>
                  </div>
                  <div className="quantity-stepper">
                    <button type="button" onClick={() => changeQuantity(item.product.id, -1)}>
                      -
                    </button>
                    <em>{item.quantity}</em>
                    <button type="button" onClick={() => changeQuantity(item.product.id, 1)}>
                      +
                    </button>
                  </div>
                  <button className="remove-cart" type="button" onClick={() => removeFromCart(item.product.id)}>
                    移除
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="cart-total">
            <span>预计合计</span>
            <strong>¥{cartTotal}</strong>
          </div>
          <button className="buy-action checkout" type="button" onClick={() => void submitOrder()} disabled={isSubmittingOrder}>
            <CheckCircle2 size={18} />
            {isSubmittingOrder ? "提交中" : "模拟下单"}
          </button>
          {notice ? <p className="user-notice">{notice}</p> : null}
        </aside>
      </section>
    </main>
  );
}

function classifyQuestion(text: string): Danmu {
  const category: DanmuCategory =
    /最低|治|保证|全网/.test(text)
      ? "异常合规"
      : /优惠|便宜|两件|满减|折扣/.test(text)
        ? "优惠计算"
        : /售后|退|换|七天|坏/.test(text)
          ? "售后"
          : /库存|规格|尺寸|颜色|容量/.test(text)
            ? "规格"
            : /适合|学生|宝妈|敏感|人群/.test(text)
              ? "适用人群"
              : /质量|真假|靠谱吗|值不值/.test(text)
                ? "异议质疑"
                : "价格";

  const emotion: Emotion = category === "异常合规" || category === "异议质疑" ? "质疑" : "感兴趣";

  return {
    id: Date.now(),
    text,
    category,
    emotion
  };
}

function estimatePrice(product: Product, quantity: number) {
  let total = product.livePrice * quantity;
  if (product.promotionRule.includes("第二件半价") && quantity >= 2) {
    total = product.livePrice + Math.floor(product.livePrice / 2) + product.livePrice * Math.max(quantity - 2, 0);
  }
  if (product.promotionRule.includes("满99") && total >= 99) {
    total -= 15;
  }
  if (product.promotionRule.includes("满2件") && quantity >= 2) {
    total -= 10;
  }
  if (product.promotionRule.includes("拍2件") && quantity >= 2) {
    total -= 25;
  }
  return Math.max(total, 0);
}

export default UserApp;

function enhanceProductImage<T extends Product>(product: T): T {
  return { ...product, imageUrl: resolveProductImageUrl(product) };
}

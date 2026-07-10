import {
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Eye,
  Headphones,
  LogOut,
  Mic2,
  PackageCheck,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Trash2,
  UserCircle,
  Wrench,
  Zap
} from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createProduct,
  deleteProduct,
  AUTH_TOKEN_KEY,
  fetchCurrentAccount,
  fetchDanmu,
  fetchLatestReview,
  fetchOrders,
  fetchProducts,
  fetchQaLogs,
  fetchToolLogs,
  requestDanmuAnswer,
  requestProductDraft,
  requestReview,
  requestScript,
  requestScriptSections,
  uploadProductImage
} from "./api";
import { danmuList as fallbackDanmuList } from "./data/danmu";
import { products as fallbackProducts } from "./data/products";
import { userProfiles } from "./data/userProfiles";
import type {
  AgentTraceItem,
  Account,
  Danmu,
  Emotion,
  Order,
  ProductCreatePayload,
  QaLog,
  ReviewReportData,
  ScriptSection,
  ScriptType,
  ToolLog,
  UserProfile
} from "./types";
import { answerDanmu, calculateDiscount, generateReview, generateScript } from "./utils/agent";
import { LIVE_CAMERA_CHANNEL, LIVE_CAMERA_FRAME_KEY, type LiveCameraPayload } from "./utils/liveCameraSync";
import { DEFAULT_ONLINE_PRODUCT_IMAGE, resolveProductImageUrl } from "./utils/productImages";

type ComplianceState = "通过" | "注意" | "风险";
type BadgeTone = "green" | "yellow" | "orange" | "red" | "blue" | "gray";
type AdminPage = "dashboard" | "products" | "live" | "agents" | "review" | "settings";
type CameraState = "idle" | "starting" | "on" | "blocked";

const scriptTypes: ScriptType[] = ["开场", "产品介绍", "促销提醒", "互动提问", "收尾"];
const danmuFilters = ["全部", "价格", "优惠计算", "售后", "异议质疑", "异常合规"];
const scriptLoadingText = "DeepSeek 正在根据商品资料、用户画像、直播价和优惠规则生成主播话术...";
const emotionOrder: Emotion[] = ["感兴趣", "犹豫", "质疑", "投诉"];
const emotionToneMap: Record<Emotion, BadgeTone> = {
  感兴趣: "green",
  犹豫: "yellow",
  质疑: "orange",
  投诉: "red"
};
const agentStatusToneMap: Record<AgentTraceItem["status"], BadgeTone> = {
  已完成: "green",
  需注意: "yellow",
  风险: "red"
};
const emptyProductForm = {
  name: "",
  category: "",
  sellingPoints: "",
  price: "",
  livePrice: "",
  promotionRule: "",
  stock: "",
  notes: "",
  suitableFor: "",
  imageUrl: "",
  imageAlt: "",
  imageCredit: ""
};

type ProductFormState = typeof emptyProductForm;

const adminPages: Array<{
  page: AdminPage;
  path: string;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  { page: "dashboard", path: "/admin/dashboard", label: "仪表盘", description: "全局态势", icon: <BarChart3 size={20} /> },
  { page: "products", path: "/admin/products", label: "商品库", description: "货盘与录入", icon: <PackageCheck size={20} /> },
  { page: "live", path: "/admin/live", label: "直播模拟", description: "话术与弹幕", icon: <Radio size={20} /> },
  { page: "agents", path: "/admin/agents", label: "Agent 协作", description: "分析与日志", icon: <Bot size={20} /> },
  { page: "review", path: "/admin/review", label: "复盘报告", description: "指标与建议", icon: <TrendingUp size={20} /> },
  { page: "settings", path: "/admin/settings", label: "设置", description: "接口与重置", icon: <Wrench size={20} /> }
];

function getAdminPageFromPath(): AdminPage {
  const slug = window.location.pathname.split("/").filter(Boolean)[1];
  const matchedPage = adminPages.find((item) => item.page === slug);
  return matchedPage?.page ?? "dashboard";
}

function uniqueDanmuItems(items: Danmu[]): Danmu[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function buildLocalAgentTrace(danmu: Danmu, productName: string, profile: UserProfile, toolName = "基础问答"): AgentTraceItem[] {
  const riskStatus = danmu.category === "异常合规" ? "风险" : "已完成";
  return [
    {
      agent: "场控 Agent",
      action: "识别弹幕意图与情绪",
      result: `问题类型：${danmu.category}；用户情绪：${danmu.emotion}`,
      status: "已完成"
    },
    {
      agent: "客服 Agent",
      action: "选择业务处理策略",
      result: `面向${profile}，调用：${toolName}`,
      status: danmu.emotion === "感兴趣" ? "已完成" : "需注意"
    },
    {
      agent: "合规审查 Agent",
      action: "检查绝对化、疗效和误导性表达",
      result: riskStatus === "风险" ? "命中风险表达，回复需纠偏" : `${productName}回复通过基础合规检查`,
      status: riskStatus
    },
    {
      agent: "主播 Agent",
      action: "组织可播报回复",
      result: "生成面向直播间的简洁回答，并保留下单页规则口径",
      status: "已完成"
    }
  ];
}

function buildLocalScriptSections(product: (typeof fallbackProducts)[number], profile: UserProfile): ScriptSection[] {
  return [
    { title: "开场引导", value: generateScript(product, profile, "开场") },
    { title: "商品卖点", value: generateScript(product, profile, "产品介绍") },
    { title: "促销提醒", value: generateScript(product, profile, "促销提醒") },
    { title: "互动提问", value: generateScript(product, profile, "互动提问") },
    { title: "成交引导", value: generateScript(product, profile, "收尾") },
    { title: "合规提示", value: "不承诺全网最低，不宣传治疗效果，价格和售后以下单页与店铺规则为准。" }
  ];
}

function App() {
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [activePage, setActivePage] = useState<AdminPage>(() => getAdminPageFromPath());
  const [products, setProducts] = useState(() => fallbackProducts.map(enhanceProductImage));
  const [danmuItems, setDanmuItems] = useState(fallbackDanmuList);
  const [liveDanmuItems, setLiveDanmuItems] = useState<Danmu[]>(fallbackDanmuList.slice(0, 8));
  const [isLive, setIsLive] = useState(false);
  const [activeProductId, setActiveProductId] = useState(fallbackProducts[0].id);
  const [productSearch, setProductSearch] = useState("");
  const [profile, setProfile] = useState<UserProfile>("学生党");
  const [scriptType, setScriptType] = useState<ScriptType>("开场");
  const [script, setScript] = useState(generateScript(enhanceProductImage(fallbackProducts[0]), "学生党", "开场"));
  const [scriptSections, setScriptSections] = useState<ScriptSection[]>(
    buildLocalScriptSections(enhanceProductImage(fallbackProducts[0]), "学生党")
  );
  const [activeDanmu, setActiveDanmu] = useState<Danmu>(fallbackDanmuList[0]);
  const [agentTrace, setAgentTrace] = useState<AgentTraceItem[]>(
    buildLocalAgentTrace(fallbackDanmuList[0], enhanceProductImage(fallbackProducts[0]).name, "学生党")
  );
  const [agentReply, setAgentReply] = useState("选择一条弹幕，Agent 会输出问题类型、情绪识别、工具调用和最终回复。");
  const [qaLogs, setQaLogs] = useState<QaLog[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [review, setReview] = useState<ReviewReportData | null>(null);
  const [danmuFilter, setDanmuFilter] = useState("全部");
  const [apiNotice, setApiNotice] = useState("");
  const [scriptPulse, setScriptPulse] = useState(false);
  const [analysisState, setAnalysisState] = useState<"待处理" | "正在分析" | "已完成">("待处理");
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [productFormError, setProductFormError] = useState("");
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productFormStatus, setProductFormStatus] = useState("");
  const [isDraftingProduct, setIsDraftingProduct] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const danmuFeedRef = useRef<HTMLDivElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraBroadcastRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    fetchCurrentAccount(token)
      .then(setCurrentAccount)
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
      });
  }, []);

  useEffect(() => {
    const syncPage = () => setActivePage(getAdminPageFromPath());
    const currentPage = getAdminPageFromPath();
    if (window.location.pathname === "/admin" || window.location.pathname === "/admin/") {
      window.history.replaceState(null, "", adminPages.find((item) => item.page === currentPage)?.path ?? "/admin/dashboard");
    }
    window.addEventListener("popstate", syncPage);
    return () => window.removeEventListener("popstate", syncPage);
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all([fetchProducts(), fetchDanmu()])
      .then(([remoteProducts, remoteDanmu]) => {
        if (!mounted) return;
        setProducts(remoteProducts);
        const uniqueRemoteDanmu = uniqueDanmuItems(remoteDanmu);
        setDanmuItems(uniqueRemoteDanmu);
        setLiveDanmuItems(uniqueRemoteDanmu.slice(0, 8));
        if (remoteProducts[0]) {
          setActiveProductId(remoteProducts[0].id);
          setScript(scriptLoadingText);
          void syncScriptSections(remoteProducts[0], "学生党");
          void syncCurrentScript(remoteProducts[0], "学生党", "开场");
        }
        if (remoteDanmu[0]) {
          setActiveDanmu(remoteDanmu[0]);
        }
        void Promise.all([fetchQaLogs(), fetchToolLogs(), fetchLatestReview(), fetchOrders()])
          .then(([savedQaLogs, savedToolLogs, savedReview, savedOrders]) => {
            if (!mounted) return;
            setQaLogs(savedQaLogs.slice(0, 14));
            setToolLogs(savedToolLogs.slice(0, 14));
            setReview(savedReview);
            setOrders(savedOrders.slice(0, 8));
          })
          .catch(() => {
            // History panels stay empty when persistence endpoints are unavailable.
          });
      })
      .catch(() => {
        setApiNotice("后端暂不可用，当前使用前端本地兜底数据。");
        // Local data keeps the workbench usable when the API server is not running.
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (video && cameraStreamRef.current) {
      video.srcObject = cameraStreamRef.current;
    }
  }, [activePage, isLive, cameraState]);

  useEffect(() => {
    if (!isLive && cameraStreamRef.current) {
      stopCamera();
    }
  }, [isLive]);

  useEffect(() => {
    if (!isLive || cameraState !== "on") {
      broadcastCameraStop();
      return undefined;
    }

    const canvas = document.createElement("canvas");
    const timer = window.setInterval(() => {
      const video = cameraVideoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      broadcastCameraPayload({
        type: "camera-frame",
        imageUrl: canvas.toDataURL("image/jpeg", 0.68),
        updatedAt: Date.now()
      });
    }, 700);

    return () => {
      window.clearInterval(timer);
      broadcastCameraStop();
    };
  }, [isLive, cameraState]);

  useEffect(
    () => () => {
      stopCamera();
      cameraBroadcastRef.current?.close();
      cameraBroadcastRef.current = null;
    },
    []
  );

  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? products[0],
    [activeProductId, products]
  );

  const productLibraryItems = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) {
      return products;
    }
    return products.filter((product) =>
      [product.name, product.category, product.promotionRule, ...product.sellingPoints]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [productSearch, products]);

  const filteredDanmu = useMemo(() => {
    const source = isLive ? liveDanmuItems : danmuItems;
    if (danmuFilter === "全部") {
      return source;
    }

    return source.filter((item) => item.category === danmuFilter || item.emotion === danmuFilter);
  }, [danmuFilter, danmuItems, isLive, liveDanmuItems]);

  const displayDanmu = useMemo(() => filteredDanmu.slice(0, 18).reverse(), [filteredDanmu]);

  useEffect(() => {
    const feed = danmuFeedRef.current;
    if (!feed) return;
    feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
  }, [displayDanmu]);

  useEffect(() => {
    if (!isLive || liveDanmuItems.length >= danmuItems.length) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setLiveDanmuItems((current) => {
        if (current.length >= danmuItems.length) {
          window.clearInterval(timer);
          return current;
        }
        return [...current, danmuItems[current.length]];
      });
    }, 2400);

    return () => window.clearInterval(timer);
  }, [danmuItems, isLive, liveDanmuItems.length]);

  useEffect(() => {
    let mounted = true;
    const timer = window.setInterval(() => {
      Promise.all([fetchDanmu(), fetchOrders()])
        .then(([remoteDanmu, remoteOrders]) => {
          if (!mounted) return;
          const uniqueRemoteDanmu = uniqueDanmuItems(remoteDanmu);
          setDanmuItems(uniqueRemoteDanmu);
          setOrders(remoteOrders.slice(0, 8));
          setLiveDanmuItems((current) => (isLive ? uniqueRemoteDanmu.slice(0, Math.max(current.length, 8)) : current));
        })
        .catch(() => {
          // Keep the current feed when the backend is temporarily unavailable.
        });
    }, 8000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [isLive]);

  const twoPiecePrice = calculateDiscount(activeProduct, 2);
  const complianceState: ComplianceState =
    activeDanmu.category === "异常合规" ? "风险" : activeProduct.stock < 40 ? "注意" : "通过";
  const objectionType = getObjectionType(activeDanmu);

  const emotionSummary = qaLogs.reduce<Record<Emotion, number>>(
    (acc, item) => {
      acc[item.emotion] += 1;
      return acc;
    },
    { 感兴趣: 0, 犹豫: 0, 质疑: 0, 投诉: 0 }
  );

  const questionRanking = useMemo(() => {
    const counts = qaLogs.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
    const fallback = [
      ["价格", 4],
      ["优惠计算", 3],
      ["售后", 2],
      ["适用人群", 2],
      ["异常合规", 1]
    ] as Array<[string, number]>;

    return (Object.keys(counts).length ? Object.entries(counts) : fallback)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [qaLogs]);

  function updateScriptSourceNotice(source?: "llm" | "fallback") {
    if (source === "llm") {
      setApiNotice("DeepSeek 已根据商品资料、用户画像和优惠规则生成主播话术。");
      return;
    }
    if (source === "fallback") {
      setApiNotice("未检测到可用 DeepSeek API Key，当前使用本地兜底话术；配置 Key 后会自动切换为 DeepSeek 生成。");
    }
  }

  async function syncScriptSections(product = activeProduct, nextProfile = profile) {
    setScriptSections([
      {
        title: "DeepSeek 生成中",
        value: "正在生成开场引导、商品卖点、促销提醒、互动提问、成交引导和合规提示。"
      }
    ]);
    try {
      const data = await requestScriptSections(product.id, nextProfile);
      setScriptSections(data.sections);
      updateScriptSourceNotice(data.source);
    } catch {
      setScriptSections(buildLocalScriptSections(product, nextProfile));
      setApiNotice("结构化话术接口暂不可用，已切换为本地兜底模板。");
      // Keep local structured script sections if the API request fails.
    }
  }

  async function syncCurrentScript(product = activeProduct, nextProfile = profile, nextType = scriptType) {
    setScript(scriptLoadingText);
    try {
      const data = await requestScript(product.id, nextProfile, nextType);
      setScript(data.script);
      updateScriptSourceNotice(data.source);
    } catch {
      setScript(generateScript(product, nextProfile, nextType));
      setApiNotice("话术生成接口暂不可用，已使用本地兜底话术。");
    }
  }

  async function handleStartSimulation() {
    setIsLive(true);
    void startCamera();
    setScriptType("开场");
    setLiveDanmuItems(danmuItems.slice(0, 8));
    setScript(scriptLoadingText);
    setActiveDanmu(danmuItems[0] ?? fallbackDanmuList[0]);
    setAgentTrace(buildLocalAgentTrace(danmuItems[0] ?? fallbackDanmuList[0], activeProduct.name, profile));
    setAgentReply("直播模拟已开始。Agent 正在监听弹幕、生成主播话术，并准备记录工具调用与合规审查结果。");
    setAnalysisState("正在分析");
    setReview(null);
    setScriptPulse(true);
    window.setTimeout(() => setScriptPulse(false), 520);
    window.setTimeout(() => setAnalysisState("已完成"), 420);

    await syncScriptSections(activeProduct, profile);
    await syncCurrentScript(activeProduct, profile, "开场");
  }

  async function startCamera() {
    if (cameraStreamRef.current) {
      setCameraState("on");
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = cameraStreamRef.current;
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("blocked");
      setApiNotice("当前浏览器不支持摄像头调用，请使用支持摄像头权限的浏览器。");
      return;
    }

    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
      setCameraState("on");
    } catch {
      setCameraState("blocked");
      setApiNotice("摄像头权限未开启，直播模拟会继续运行；请在浏览器地址栏允许摄像头后重新点击开始模拟。");
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setCameraState("idle");
    broadcastCameraStop();
  }

  function getCameraBroadcastChannel() {
    if (!("BroadcastChannel" in window)) {
      return null;
    }
    if (!cameraBroadcastRef.current) {
      cameraBroadcastRef.current = new BroadcastChannel(LIVE_CAMERA_CHANNEL);
    }
    return cameraBroadcastRef.current;
  }

  function broadcastCameraPayload(payload: LiveCameraPayload) {
    if (payload.type === "camera-frame") {
      localStorage.setItem(LIVE_CAMERA_FRAME_KEY, JSON.stringify(payload));
    } else {
      localStorage.removeItem(LIVE_CAMERA_FRAME_KEY);
    }
    getCameraBroadcastChannel()?.postMessage(payload);
  }

  function broadcastCameraStop() {
    broadcastCameraPayload({ type: "camera-stop", updatedAt: Date.now() });
  }

  async function handleProductChange(productId: number) {
    const nextProduct = products.find((product) => product.id === productId) ?? activeProduct;
    setActiveProductId(productId);
    setScript(scriptLoadingText);
    setScriptPulse(true);
    window.setTimeout(() => setScriptPulse(false), 520);
    setReview(null);
    void syncScriptSections(nextProduct, profile);
    void syncCurrentScript(nextProduct, profile, scriptType);
  }

  async function handleProductDelete(productId: number) {
    if (products.length <= 1) {
      setApiNotice("货盘至少需要保留 1 个商品。");
      return;
    }

    const targetProduct = products.find((product) => product.id === productId);
    if (!targetProduct) return;
    if (!window.confirm(`确定删除「${targetProduct.name}」吗？删除后会从当前货盘和数据库中移除。`)) {
      return;
    }

    const nextProducts = products.filter((product) => product.id !== productId);
    const nextActiveProduct = productId === activeProduct.id ? nextProducts[0] : activeProduct;

    try {
      await deleteProduct(productId);
      setProducts(nextProducts);
      setActiveProductId(nextActiveProduct.id);
      setScript(generateScript(nextActiveProduct, profile, scriptType));
      setScriptSections(buildLocalScriptSections(nextActiveProduct, profile));
      setAgentTrace(buildLocalAgentTrace(activeDanmu, nextActiveProduct.name, profile));
      setReview(null);
      setApiNotice(`已删除商品：${targetProduct.name}`);
      void syncScriptSections(nextActiveProduct, profile);
    } catch {
      setApiNotice("删除商品失败，请确认后端服务和 MySQL 连接正常。");
    }
  }

  async function handleProductSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sellingPoints = splitList(productForm.sellingPoints);
    const suitableFor = splitList(productForm.suitableFor);
    const price = Number(productForm.price);
    const livePrice = Number(productForm.livePrice);
    const stock = Number(productForm.stock);

    if (!productForm.name.trim() || !productForm.category.trim() || !productForm.promotionRule.trim()) {
      setProductFormError("请填写商品名称、分类和优惠规则。");
      return;
    }
    if (!sellingPoints.length || !suitableFor.length) {
      setProductFormError("卖点和适用人群至少填写 1 项，可用逗号分隔。");
      return;
    }
    if ([price, livePrice, stock].some((value) => Number.isNaN(value) || value < 0)) {
      setProductFormError("原价、直播价和库存必须是非负数字。");
      return;
    }

    const payload: ProductCreatePayload = {
      name: productForm.name.trim(),
      category: productForm.category.trim(),
      sellingPoints,
      price,
      livePrice,
      promotionRule: productForm.promotionRule.trim(),
      stock,
      notes: productForm.notes.trim() || "请以下单页说明为准",
      suitableFor,
      imageUrl: productForm.imageUrl.trim() || DEFAULT_ONLINE_PRODUCT_IMAGE,
      imageAlt: productForm.imageAlt.trim() || `${productForm.name.trim()}商品图片`,
      imageCredit: productForm.imageCredit.trim() || "用户录入"
    };

    let createdProduct = { id: Date.now(), ...payload };
    try {
      createdProduct = await createProduct(payload);
      setApiNotice("");
    } catch {
      setApiNotice("商品新增接口暂不可用，已先加入前端本地货盘；刷新页面后本地新增商品不会保留。");
    }

    createdProduct = enhanceProductImage(createdProduct);
    setProducts((current) => [...current, createdProduct]);
    setActiveProductId(createdProduct.id);
    setScript(generateScript(createdProduct, profile, scriptType));
    setScriptSections(buildLocalScriptSections(createdProduct, profile));
    setAgentTrace(buildLocalAgentTrace(activeDanmu, createdProduct.name, profile));
    setReview(null);
    setProductForm(emptyProductForm);
    setProductFormError("");
    setProductFormStatus("");
    setProductFormOpen(false);
    setScriptPulse(true);
    window.setTimeout(() => setScriptPulse(false), 520);
    void syncScriptSections(createdProduct, profile);
  }

  async function handleGenerateProductDraft() {
    if (!productForm.name.trim()) {
      setProductFormError("请先填写商品名称，再生成资料和话术。");
      return;
    }

    setIsDraftingProduct(true);
    setProductFormError("");
    setProductFormStatus("Agent 正在根据商品名称生成资料和主播话术...");
    try {
      const draft = await requestProductDraft({
        name: productForm.name.trim(),
        price: parseOptionalNumber(productForm.price),
        livePrice: parseOptionalNumber(productForm.livePrice),
        promotionRule: productForm.promotionRule.trim() || undefined,
        stock: parseOptionalNumber(productForm.stock),
        imageUrl: productForm.imageUrl.trim() || undefined,
        profile
      });
      setProductForm((current) => productToForm(draft.product, current));
      setScriptSections(draft.sections);
      setScript(draft.sections[0]?.value ?? generateScript({ id: 0, ...draft.product }, profile, scriptType));
      setScriptPulse(true);
      window.setTimeout(() => setScriptPulse(false), 520);
      setProductFormStatus(draft.message);
    } catch {
      setProductFormError("商品资料生成失败，请检查后端服务或 API Key 配置。");
      setProductFormStatus("");
    } finally {
      setIsDraftingProduct(false);
    }
  }

  async function handleProductImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setProductFormError("");
    setProductFormStatus("正在上传商品图片...");
    try {
      const uploaded = await uploadProductImage(file);
      setProductForm((current) => ({
        ...current,
        imageUrl: uploaded.imageUrl,
        imageAlt: current.imageAlt || `${current.name || "商品"}图片`,
        imageCredit: current.imageCredit || "用户上传"
      }));
      setProductFormStatus("图片上传成功，已写入商品图片地址。");
    } catch {
      setProductFormError("图片上传失败，请确认文件是 jpg、png、webp 或 gif。");
      setProductFormStatus("");
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleGenerateScript(type = scriptType) {
    setScriptType(type);
    setScriptPulse(true);
    window.setTimeout(() => setScriptPulse(false), 520);
    await syncCurrentScript(activeProduct, profile, type);
  }

  async function handleProfileChange(nextProfile: UserProfile) {
    setProfile(nextProfile);
    setScriptPulse(true);
    window.setTimeout(() => setScriptPulse(false), 520);
    void syncScriptSections(activeProduct, nextProfile);
    await syncCurrentScript(activeProduct, nextProfile, scriptType);
  }

  async function handleDanmuClick(danmu: Danmu) {
    setAnalysisState("正在分析");
    setActiveDanmu(danmu);
    const localResult = answerDanmu(activeProduct, danmu, profile);
    const eventId = Date.now();
    const fallbackQuestionLog: QaLog = {
      id: eventId,
      question: danmu.text,
      answer: localResult.answer,
      category: danmu.category,
      emotion: danmu.emotion,
      productName: activeProduct.name
    };
    const fallbackToolLogs: ToolLog[] = localResult.logs.length
      ? localResult.logs.map((log, index) => ({ ...log, id: eventId + index }))
      : [
          {
            id: eventId,
            tool: "complianceCheck",
            input: danmu.text,
            output: "普通问答，未触发强工具；已完成基础合规审查",
            time: new Intl.DateTimeFormat("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            }).format(new Date())
          }
        ];
    let answer = localResult.answer;
    let questionLog = fallbackQuestionLog;
    let nextToolLogs = fallbackToolLogs;
    let nextAgentTrace = buildLocalAgentTrace(
      danmu,
      activeProduct.name,
      profile,
      fallbackToolLogs[0]?.tool ?? "基础问答"
    );

    setAgentTrace(nextAgentTrace);
    setAgentReply(answer);
    setQaLogs((current) => [fallbackQuestionLog, ...current].slice(0, 14));
    setToolLogs((current) => [...fallbackToolLogs, ...current].slice(0, 14));
    setReview(null);

    try {
      const remoteResult = await requestDanmuAnswer(activeProduct.id, profile, danmu);
      answer = remoteResult.answer;
      questionLog = { ...remoteResult.qaLog, id: eventId };
      nextToolLogs = remoteResult.logs.length ? remoteResult.logs.map((log, index) => ({ ...log, id: eventId + index })) : fallbackToolLogs;
      nextAgentTrace = remoteResult.agentTrace;
      setAgentTrace(nextAgentTrace);
      setAgentReply(answer);
      setQaLogs((current) => [questionLog, ...current.filter((item) => item.id !== eventId)].slice(0, 14));
      setToolLogs((current) => {
        const fallbackIds = new Set(fallbackToolLogs.map((log) => log.id));
        return [...nextToolLogs, ...current.filter((item) => !fallbackIds.has(item.id))].slice(0, 14);
      });
    } catch {
      setApiNotice("弹幕分析接口暂不可用，已使用本地兜底回复。");
      // Keep local analysis if the API request fails.
    }

    window.setTimeout(() => setAnalysisState("已完成"), 360);
  }

  async function handleReview() {
    const localReview = generateReview(qaLogs, products);
    setReview(localReview);
    try {
      setReview(await requestReview(qaLogs));
    } catch {
      setApiNotice("复盘接口暂不可用，已使用本地复盘结果。");
      // Keep local review if the API request fails.
    }
  }

  function handleReset() {
    setQaLogs([]);
    setToolLogs([]);
    setReview(null);
    setIsLive(false);
    stopCamera();
    setLiveDanmuItems(danmuItems.slice(0, 8));
    setActiveDanmu(danmuItems[0] ?? fallbackDanmuList[0]);
    setAgentTrace(buildLocalAgentTrace(danmuItems[0] ?? fallbackDanmuList[0], activeProduct.name, profile));
    setAgentReply("本场记录已清空。继续选择弹幕，系统会重新生成回复和工具日志。");
    setApiNotice("");
    setAnalysisState("待处理");
  }

  function handleAdminNavigate(page: AdminPage, event?: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    event?.preventDefault();
    const nextPath = adminPages.find((item) => item.page === page)?.path ?? "/admin/dashboard";
    window.history.pushState(null, "", nextPath);
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.href = "/admin/login";
  }

  return (
    <main className={`dashboard-layout admin-orch-layout admin-page-${activePage}`}>
      <header className="app-header">
        <div className="system-title">
          <span className="brand-mark">
            <Radio size={22} />
          </span>
          <div>
            <h1>直播电商 Agent 工作台</h1>
            <p>当前直播场次：校园好物专场 · 第 1 场 · {isLive ? "直播中" : "待开始"}</p>
          </div>
        </div>

        <div className="header-controls">
          <div className="segmented-control" aria-label="用户画像选择">
            {userProfiles.map((item) => (
              <button
                key={item}
                className={item === profile ? "active" : ""}
                type="button"
                onClick={() => handleProfileChange(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button className={`secondary-action ${isLive ? "active" : ""}`} type="button" onClick={handleStartSimulation}>
            <Play size={17} />
            {isLive ? "直播中" : "开始模拟"}
          </button>
          {activePage === "review" ? (
            <button className="primary-action" type="button" onClick={handleReview}>
              <BarChart3 size={17} />
              生成复盘
            </button>
          ) : null}
          <a className="icon-action header-link-action" href="/account" title={currentAccount ? `当前账号：${currentAccount.username}` : "进入账号端"}>
            <UserCircle size={17} />
          </a>
          <button className="icon-action" type="button" onClick={handleLogout} title="退出登录">
            <LogOut size={17} />
          </button>
          <button className="icon-action" type="button" onClick={handleReset} title="清空本场记录">
            <RefreshCw size={17} />
          </button>
        </div>
      </header>

      <div className="workspace-shell">
        <aside className="sidebar">
          <div className="admin-nav-brand">
            <strong>AgentOrch</strong>
            <span>实时运营 V2.4</span>
          </div>
          <button
            className="primary-action admin-new-session"
            type="button"
            onClick={(event) => {
              handleAdminNavigate("live", event);
              void handleStartSimulation();
            }}
          >
            <Play size={16} />
            新建模拟
          </button>
          <section className="live-status-panel">
            <PanelTitle icon={<Radio size={17} />} title="直播状态" note="Live" />
            <div className="status-metrics">
              <div>
                <span>当前商品</span>
                <strong>{activeProduct.name}</strong>
              </div>
              <div>
                <span>已处理弹幕</span>
                <strong>{qaLogs.length}</strong>
              </div>
              <div>
                <span>工具调用</span>
                <strong>{toolLogs.length}</strong>
              </div>
            </div>
            <StatusBadge tone={isLive ? "green" : "gray"}>{isLive ? "直播中" : "待开始"}</StatusBadge>
          </section>

          <div className="sidebar-section">
            <PanelTitle icon={<Eye size={17} />} title="模块导航" note="Sidebar" />
            {adminPages.map((item) => (
              <a
                key={item.page}
                className={activePage === item.page ? "nav-item active" : "nav-item"}
                href={item.path}
                onClick={(event) => handleAdminNavigate(item.page, event)}
              >
                {item.icon}
                <span>{item.label}</span>
                <small>{item.description}</small>
                <ChevronRight size={14} />
              </a>
            ))}
          </div>
        </aside>

        <section className="main-workspace">
          <section className="admin-overview admin-view admin-view-dashboard">
            <article className="compact-card overview-hero">
              <PanelTitle icon={<BarChart3 size={18} />} title="仪表盘总览" note="Dashboard" />
              <div className="overview-grid">
                <KpiCard label="本场商品" value={`${products.length}`} tone="blue" />
                <KpiCard label="弹幕问答" value={`${qaLogs.length}`} tone="green" />
                <KpiCard label="用户下单" value={`${orders.length}`} tone="orange" />
                <KpiCard label="合规风险" value={`${qaLogs.filter((item) => item.category === "异常合规").length}`} tone="red" />
              </div>
              <div className="overview-actions">
                <button className="secondary-action" type="button" onClick={(event) => handleAdminNavigate("products", event)}>
                  管理商品
                </button>
                <button className="primary-action" type="button" onClick={(event) => handleAdminNavigate("live", event)}>
                  <Radio size={17} />
                  进入直播模拟
                </button>
              </div>
            </article>
          </section>

          <section className="current-product data-panel admin-view admin-view-live">
            <div className={`product-media live-camera-stage camera-${cameraState}`}>
              {cameraState === "on" ? (
                <video ref={cameraVideoRef} autoPlay playsInline muted />
              ) : (
                <div className="camera-placeholder">
                  <Radio size={28} />
                  <strong>{cameraState === "starting" ? "正在打开摄像头" : "主播摄像头"}</strong>
                  <span>
                    {cameraState === "blocked"
                      ? "请在浏览器地址栏允许摄像头权限后，重新点击开始模拟。"
                      : "点击开始模拟后，这里会显示电脑摄像头画面。"}
                  </span>
                </div>
              )}
              <StatusBadge tone={cameraState === "on" ? "green" : cameraState === "blocked" ? "red" : "blue"}>
                {cameraState === "on" ? "摄像头已开启" : cameraState === "blocked" ? "摄像头未授权" : "直播预览"}
              </StatusBadge>
            </div>
            <div className="product-detail">
              <p className="eyebrow">{activeProduct.category}</p>
              <h2>{activeProduct.name}</h2>
              <div className="selling-points">
                {activeProduct.sellingPoints.map((point) => (
                  <span key={point}>{point}</span>
                ))}
              </div>
              <div className="product-kpis">
                <KpiCard label="直播价" value={`¥${activeProduct.livePrice}`} tone="orange" />
                <KpiCard label="库存" value={`${activeProduct.stock} 件`} tone={activeProduct.stock < 40 ? "red" : "green"} />
                <KpiCard label="两件预估" value={`¥${twoPiecePrice}`} tone="blue" />
              </div>
              <div className="rule-box">
                <strong>优惠规则</strong>
                <p>{activeProduct.promotionRule}</p>
              </div>
              <div className="product-detail-image">
                <img src={activeProduct.imageUrl} alt={activeProduct.imageAlt} />
                <div>
                  <strong>商品图片</strong>
                  <span>{activeProduct.imageCredit}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="product-library admin-view admin-view-products">
            <div className="product-library-head">
              <PanelTitle icon={<PackageCheck size={18} />} title="产品库与管理" note="Product Library" />
              <div className="product-library-actions">
                <label className="product-library-search">
                  <Search size={18} />
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="搜索商品..."
                  />
                </label>
                <button
                  className={`secondary-action ${productFormOpen ? "active" : ""}`}
                  type="button"
                  onClick={() => setProductFormOpen((current) => !current)}
                >
                  {productFormOpen ? "收起录入" : "新增商品"}
                </button>
              </div>
            </div>
            <div className="product-library-summary">
              <div>
                <span>Total products</span>
                <strong>{products.length}</strong>
              </div>
              <div>
                <span>Active scripts</span>
                <strong>{scriptSections.length}</strong>
              </div>
              <p>选择商品后会同步到直播模拟、主播话术、弹幕问答和复盘报告。</p>
            </div>
            {productFormOpen ? (
              <form className="product-entry-form" onSubmit={handleProductSubmit}>
                <label>
                  商品名称
                  <input
                    value={productForm.name}
                    onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="例：校园能量坚果包"
                  />
                </label>
                <label>
                  分类
                  <input
                    value={productForm.category}
                    onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))}
                    placeholder="例：食品饮品"
                  />
                </label>
                <label>
                  原价
                  <input
                    value={productForm.price}
                    onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))}
                    inputMode="numeric"
                    placeholder="59"
                  />
                </label>
                <label>
                  直播价
                  <input
                    value={productForm.livePrice}
                    onChange={(event) => setProductForm((current) => ({ ...current, livePrice: event.target.value }))}
                    inputMode="numeric"
                    placeholder="39"
                  />
                </label>
                <label>
                  库存
                  <input
                    value={productForm.stock}
                    onChange={(event) => setProductForm((current) => ({ ...current, stock: event.target.value }))}
                    inputMode="numeric"
                    placeholder="88"
                  />
                </label>
                <label>
                  卖点
                  <input
                    value={productForm.sellingPoints}
                    onChange={(event) => setProductForm((current) => ({ ...current, sellingPoints: event.target.value }))}
                    placeholder="独立小包装，课间补给，坚果搭配"
                  />
                </label>
                <label>
                  优惠规则
                  <input
                    value={productForm.promotionRule}
                    onChange={(event) => setProductForm((current) => ({ ...current, promotionRule: event.target.value }))}
                    placeholder="直播间第二件半价"
                  />
                </label>
                <label>
                  适用人群
                  <input
                    value={productForm.suitableFor}
                    onChange={(event) => setProductForm((current) => ({ ...current, suitableFor: event.target.value }))}
                    placeholder="学生党，精致白领"
                  />
                </label>
                <label className="wide-field">
                  注意事项
                  <input
                    value={productForm.notes}
                    onChange={(event) => setProductForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="含坚果，过敏人群留意配料"
                  />
                </label>
                <label className="wide-field">
                  图片地址
                  <input
                    value={productForm.imageUrl}
                    onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))}
                    placeholder="上传图片后自动填入，也可填写 /products/oatmeal.jpg"
                  />
                </label>
                <label className="upload-field">
                  上传图片
                  <input type="file" accept="image/*" onChange={handleProductImageUpload} />
                </label>
                <label>
                  图片描述
                  <input
                    value={productForm.imageAlt}
                    onChange={(event) => setProductForm((current) => ({ ...current, imageAlt: event.target.value }))}
                    placeholder="商品图片"
                  />
                </label>
                <label>
                  图片来源
                  <input
                    value={productForm.imageCredit}
                    onChange={(event) => setProductForm((current) => ({ ...current, imageCredit: event.target.value }))}
                    placeholder="用户录入"
                  />
                </label>
                {productForm.imageUrl ? (
                  <div className="image-preview wide-field">
                    <img src={productForm.imageUrl} alt={productForm.imageAlt || "商品图片预览"} />
                    <span>{isUploadingImage ? "上传中..." : "图片已就绪"}</span>
                  </div>
                ) : null}
                {productFormError ? <p className="form-error">{productFormError}</p> : null}
                {productFormStatus ? <p className="form-status">{productFormStatus}</p> : null}
                <div className="form-actions">
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => {
                      setProductForm(emptyProductForm);
                      setProductFormError("");
                      setProductFormStatus("");
                    }}
                  >
                    清空
                  </button>
                  <button className="secondary-action" type="button" onClick={handleGenerateProductDraft} disabled={isDraftingProduct}>
                    {isDraftingProduct ? "生成中" : "AI 生成资料/话术"}
                  </button>
                  <button className="primary-action" type="submit">
                    加入货盘
                  </button>
                </div>
              </form>
            ) : null}
            <div className="product-library-grid">
              {productLibraryItems.map((product) => (
                <article
                  key={product.id}
                  className={product.id === activeProduct.id ? "library-product-card active" : "library-product-card"}
                >
                  <button className="library-product-main" type="button" onClick={() => handleProductChange(product.id)}>
                    <img src={product.imageUrl} alt={product.imageAlt} loading="lazy" />
                    <div>
                      <div className="library-product-title">
                        <strong>{product.name}</strong>
                        <StatusBadge tone={product.stock > 0 ? "green" : "gray"}>{product.stock > 0 ? "Live" : "Empty"}</StatusBadge>
                      </div>
                      <span className="library-product-price">¥ {product.livePrice}.00</span>
                      <small>SKU: PR-{String(product.id).padStart(4, "0")}</small>
                    </div>
                  </button>
                  <div className="library-product-facts">
                    <span>USP</span>
                    <p>{product.sellingPoints.slice(0, 3).join("，")}</p>
                    <span>Rule</span>
                    <p className="rule-text">{product.promotionRule}</p>
                    <span>Stock</span>
                    <p className="stock-text">{product.stock} 现货</p>
                  </div>
                  <div className="library-product-footer">
                    <span>{product.id === activeProduct.id ? "当前讲解商品" : "Script Ready"}</span>
                    <div>
                      <button type="button" onClick={() => handleProductChange(product.id)}>
                        Gen Script <ChevronRight size={17} />
                      </button>
                      <button type="button" onClick={() => handleProductDelete(product.id)} title={`删除 ${product.name}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {productLibraryItems.length === 0 ? (
                <div className="library-empty-state">
                  <strong>没有匹配的商品</strong>
                  <span>换一个关键词，或新增商品后再查看。</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="content-grid admin-view admin-view-live admin-view-agents">
            <article className={`compact-card script-panel ${scriptPulse ? "updated" : ""}`}>
              <PanelTitle icon={<Mic2 size={17} />} title="主播话术" note="Segmented Control" />
              <div className="segmented-control script-tabs">
                {scriptTypes.map((type) => (
                  <button
                    key={type}
                    className={scriptType === type ? "active" : ""}
                    type="button"
                    onClick={() => handleGenerateScript(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <div className="script-current">
                <StatusBadge tone="blue">已更新</StatusBadge>
                <p>{script}</p>
              </div>
              <div className="script-structure">
                {scriptSections.map((item) => (
                  <div key={item.title}>
                    <strong>{item.title}</strong>
                    <p>{item.value}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="compact-card agent-panel">
              <PanelTitle icon={<Bot size={17} />} title="Agent 分析" note={analysisState} />
              <div className="analysis-grid">
                <AnalysisItem label="用户问题" value={activeDanmu.text} />
                <AnalysisItem label="问题类型" value={activeDanmu.category} badgeTone="blue" />
                <AnalysisItem label="用户情绪" value={activeDanmu.emotion} badgeTone={emotionTone(activeDanmu.emotion)} />
                <AnalysisItem label="异议类型" value={objectionType} badgeTone={objectionType === "合规风险" ? "red" : "gray"} />
                <AnalysisItem label="工具调用" value={toolLogs[0]?.tool ?? "待处理"} badgeTone={toolLogs.length ? "blue" : "gray"} />
                <AnalysisItem label="回应策略" value={strategyForDanmu(activeDanmu)} />
              </div>
              <div className="final-reply">
                <strong>最终回复</strong>
                <p>{agentReply}</p>
              </div>
              <div className="agent-trace">
                {agentTrace.map((item) => (
                  <article key={item.agent}>
                    <StatusBadge tone={agentStatusTone(item.status)}>{item.status}</StatusBadge>
                    <strong>{item.agent}</strong>
                    <span>{item.action}</span>
                    <p>{item.result}</p>
                  </article>
                ))}
              </div>
            </article>
          </section>
        </section>

        <aside className="assistant-rail admin-view admin-view-live admin-view-agents">
          <section className="compact-card rail-panel-live">
            <PanelTitle icon={<Headphones size={17} />} title="实时弹幕" note={`${filteredDanmu.length} 条`} />
            <div className="segmented-control filter-tabs">
              {danmuFilters.map((item) => (
                <button
                  key={item}
                  className={danmuFilter === item ? "active" : ""}
                  type="button"
                  onClick={() => setDanmuFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="activity-feed" ref={danmuFeedRef}>
              {displayDanmu.map((danmu) => (
                <button
                  key={danmu.id}
                  className={danmu.id === activeDanmu.id ? "feed-item active" : "feed-item"}
                  type="button"
                  onClick={() => handleDanmuClick(danmu)}
                >
                  <StatusBadge tone={emotionTone(danmu.emotion)}>{danmu.emotion}</StatusBadge>
                  <span>{danmu.text}</span>
                  <small>{danmu.category}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={`risk-alert risk-${complianceState} rail-panel-agents`}>
            <PanelTitle icon={<ShieldCheck size={17} />} title="合规审查" note={complianceState} />
            <p>{complianceCopy(complianceState, activeProduct.notes)}</p>
          </section>

          {apiNotice ? (
            <section className="risk-alert risk-注意 api-notice-panel">
              <PanelTitle icon={<ShieldCheck size={17} />} title="接口状态" note="已兜底" />
              <p>{apiNotice}</p>
            </section>
          ) : null}

          <section className="compact-card order-panel rail-panel-live">
            <PanelTitle icon={<PackageCheck size={17} />} title="实时订单" note={`${orders.length} 单`} />
            <div className="order-feed">
              {orders.length === 0 ? (
                <EmptyState text="用户端模拟下单后，这里会实时显示订单金额、商品和用户画像。" />
              ) : (
                orders.map((order) => (
                  <article key={order.id} className="order-row">
                    <div>
                      <StatusBadge tone="green">{order.status}</StatusBadge>
                      <span>#{order.id}</span>
                    </div>
                    <strong>¥{order.totalAmount}</strong>
                    <p>{order.items.map((item) => `${item.productName} x${item.quantity}`).join("、")}</p>
                    <small>
                      {order.profile} · {order.createdAt}
                    </small>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="compact-card rail-panel-agents">
            <PanelTitle icon={<Wrench size={17} />} title="工具调用日志" note="Log Viewer" />
            <div className="log-viewer">
              {toolLogs.length === 0 ? (
                <EmptyState text="点击弹幕后会记录优惠计算、库存查询、推荐或合规检查。" />
              ) : (
                toolLogs.map((log) => (
                  <article key={log.id} className="log-row">
                    <div>
                      <StatusBadge tone="blue">已调用</StatusBadge>
                      <StatusBadge tone={log.output.includes("风险") ? "red" : "green"}>{log.output.includes("风险") ? "异常" : "成功"}</StatusBadge>
                    </div>
                    <strong>{log.tool}</strong>
                    <p>{log.output}</p>
                    <small>{log.time}</small>
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="settings-page compact-card admin-view admin-view-settings">
        <PanelTitle icon={<Wrench size={18} />} title="系统设置" note="Settings" />
        <div className="settings-grid">
          <article>
            <strong>接口状态</strong>
            <p>{apiNotice || "前后端连接正常。DeepSeek、MySQL、订单与弹幕接口会在对应页面实时调用。"}</p>
          </article>
          <article>
            <strong>当前用户画像</strong>
            <p>{profile}</p>
          </article>
          <article>
            <strong>直播场次</strong>
            <p>校园好物专场 · 第 1 场 · {isLive ? "直播中" : "待开始"}</p>
          </article>
          <article>
            <strong>本场记录</strong>
            <p>弹幕 {qaLogs.length} 条，工具调用 {toolLogs.length} 次，订单 {orders.length} 单。</p>
          </article>
        </div>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={(event) => handleAdminNavigate("live", event)}>
            进入直播模拟
          </button>
          <button className="primary-action" type="button" onClick={handleReset}>
            <RefreshCw size={17} />
            清空本场记录
          </button>
        </div>
      </section>

      <section className="insight-panel admin-view admin-view-review">
        <PanelTitle icon={<TrendingUp size={18} />} title="直播复盘报告" note="Insight Panel" />
        {review ? (
          <>
            <div className="insight-kpis">
              <KpiCard label="工具调用次数" value={`${toolLogs.length}`} tone="blue" />
              <KpiCard label="合规风险次数" value={`${qaLogs.filter((item) => item.category === "异常合规").length}`} tone="red" />
              <KpiCard label="转化阻碍" value={`${review.blockers.length}`} tone="orange" />
              <KpiCard label="复盘建议" value={`${review.suggestions.length}`} tone="green" />
            </div>
            <div className="insight-grid">
              <RankPanel title="高频问题 TOP 5" data={questionRanking} />
              <EmotionPanel data={emotionSummary} />
              <ListPanel title="转化阻碍" items={review.blockers} />
              <ListPanel title="优化建议" items={review.suggestions} />
              <TimelinePanel items={review.nextProductOrder} />
            </div>
          </>
        ) : (
          <EmptyState text="处理弹幕后点击“生成复盘”，这里会展示指标卡、问题排行、情绪分布、风险与下一场排品。" />
        )}
      </section>
    </main>
  );
}

function PanelTitle({ icon, title, note }: { icon: ReactNode; title: string; note: string }) {
  return (
    <div className="panel-title">
      <div>
        {icon}
        <h3>{title}</h3>
      </div>
      <span>{note}</span>
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`status-badge badge-${tone}`}>{children}</span>;
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: "green" | "orange" | "red" | "blue" }) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AnalysisItem({ label, value, badgeTone }: { label: string; value: string; badgeTone?: BadgeTone }) {
  return (
    <div className="analysis-item">
      <span>{label}</span>
      {badgeTone ? <StatusBadge tone={badgeTone}>{value}</StatusBadge> : <strong>{value}</strong>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="empty-state">
      <Zap size={17} />
      {text}
    </p>
  );
}

function RankPanel({ title, data }: { title: string; data: Array<[string, number]> }) {
  const max = Math.max(...data.map(([, count]) => count), 1);
  return (
    <article className="chart-panel">
      <h4>{title}</h4>
      {data.map(([name, count]) => (
        <div key={name} className="bar-row">
          <span>{name}</span>
          <div>
            <i style={{ "--bar": `${(count / max) * 100}%` } as CSSProperties} />
          </div>
          <strong>{count}</strong>
        </div>
      ))}
    </article>
  );
}

function EmotionPanel({ data }: { data: Record<Emotion, number> }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <article className="chart-panel">
      <h4>情绪分布</h4>
      {emotionOrder.map((emotion) => (
        <div key={emotion} className="bar-row">
          <span>{emotion}</span>
          <div>
            <i className={`bar-${emotion}`} style={{ "--bar": `${(data[emotion] / max) * 100}%` } as CSSProperties} />
          </div>
          <strong>{data[emotion]}</strong>
        </div>
      ))}
    </article>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="chart-panel">
      <h4>{title}</h4>
      <ul className="insight-list">
        {items.map((item) => (
          <li key={item}>
            <CheckCircle2 size={15} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

function TimelinePanel({ items }: { items: string[] }) {
  return (
    <article className="chart-panel">
      <h4>下一场排品计划</h4>
      <ol className="plan-list">
        {items.map((item, index) => (
          <li key={item}>
            <span>{index + 1}</span>
            {item}
          </li>
        ))}
      </ol>
    </article>
  );
}

function emotionTone(emotion: Emotion) {
  return emotionToneMap[emotion] ?? "gray";
}

function agentStatusTone(status: AgentTraceItem["status"]) {
  return agentStatusToneMap[status] ?? "gray";
}

function splitList(value: string) {
  return value
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function productToForm(product: ProductCreatePayload, current: ProductFormState): ProductFormState {
  return {
    name: product.name,
    category: product.category,
    sellingPoints: product.sellingPoints.join("，"),
    price: String(product.price),
    livePrice: String(product.livePrice),
    promotionRule: product.promotionRule,
    stock: String(product.stock),
    notes: product.notes,
    suitableFor: product.suitableFor.join("，"),
    imageUrl: product.imageUrl || current.imageUrl,
    imageAlt: product.imageAlt || current.imageAlt,
    imageCredit: product.imageCredit || current.imageCredit
  };
}

function enhanceProductImage<T extends ProductCreatePayload>(product: T): T {
  return { ...product, imageUrl: resolveProductImageUrl(product) };
}

function getObjectionType(danmu: Danmu) {
  if (danmu.category === "异常合规") return "合规风险";
  if (danmu.category === "异议质疑") return "信任异议";
  if (danmu.category === "优惠计算") return "价格异议";
  if (danmu.category === "售后") return "售后顾虑";
  return "常规咨询";
}

function strategyForDanmu(danmu: Danmu) {
  if (danmu.category === "异常合规") return "先纠偏，再给可确认事实";
  if (danmu.category === "优惠计算") return "调用优惠计算，给出保守价格";
  if (danmu.category === "异议质疑") return "承认顾虑，用事实回应";
  if (danmu.category === "售后") return "明确以下单页和店铺规则为准";
  return "直接回答，补充注意事项";
}

function complianceCopy(state: ComplianceState, notes: string) {
  if (state === "风险") return "当前弹幕涉及异常或绝对化表述，回复需避免疗效承诺、全网最低、夸张保证。";
  if (state === "注意") return `当前商品库存或注意事项需要主播说明：${notes}`;
  return "当前回复通过基础合规审查，可继续讲解价格、卖点和售后规则。";
}

export default App;

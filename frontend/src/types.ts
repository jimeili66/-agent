export type UserProfile = "学生党" | "宝妈" | "精致白领";

export type Emotion = "感兴趣" | "犹豫" | "质疑" | "投诉";

export type DanmuCategory =
  | "价格"
  | "规格"
  | "售后"
  | "适用人群"
  | "优惠计算"
  | "异议质疑"
  | "异常合规";

export type ScriptType = "开场" | "产品介绍" | "促销提醒" | "互动提问" | "收尾";

export interface Product {
  id: number;
  name: string;
  category: string;
  sellingPoints: string[];
  price: number;
  livePrice: number;
  promotionRule: string;
  stock: number;
  notes: string;
  suitableFor: string[];
  imageUrl: string;
  imageAlt: string;
  imageCredit: string;
}

export type ProductCreatePayload = Omit<Product, "id">;

export interface UploadedImageResponse {
  imageUrl: string;
  fileName: string;
}

export interface ProductDraftRequest {
  name: string;
  price?: number;
  livePrice?: number;
  promotionRule?: string;
  stock?: number;
  imageUrl?: string;
  profile: UserProfile;
}

export interface ProductDraftResponse {
  product: ProductCreatePayload;
  sections: ScriptSection[];
  source: "llm" | "fallback";
  message: string;
}

export interface OrderItemRequest {
  productId: number;
  quantity: number;
}

export interface OrderCreatePayload {
  profile: UserProfile;
  items: OrderItemRequest[];
}

export interface OrderItem {
  productId: number;
  productName: string;
  imageUrl: string;
  livePrice: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: number;
  profile: UserProfile;
  items: OrderItem[];
  totalAmount: number;
  status: "已下单";
  createdAt: string;
}

export interface Danmu {
  id: number;
  text: string;
  category: DanmuCategory;
  emotion: Emotion;
}

export interface ToolLog {
  id: number;
  tool: "calculateDiscount" | "queryStock" | "recommendProduct" | "complianceCheck";
  input: string;
  output: string;
  time: string;
}

export interface QaLog {
  id: number;
  question: string;
  answer: string;
  category: DanmuCategory;
  emotion: Emotion;
  productName: string;
}

export interface AgentTraceItem {
  agent: string;
  action: string;
  result: string;
  status: "已完成" | "需注意" | "风险";
}

export interface ReviewReportData {
  highFrequencyQuestions: string[];
  emotionSummary: Record<Emotion, number>;
  blockers: string[];
  suggestions: string[];
  nextProductOrder: string[];
}

export interface ScriptSection {
  title: string;
  value: string;
}

export type AccountRole = "admin" | "operator";

export interface Account {
  id: number;
  username: string;
  role: AccountRole;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: "bearer";
  account: Account;
}

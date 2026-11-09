import type {
  Account,
  AccountRole,
  AgentTraceItem,
  Danmu,
  LoginResponse,
  Order,
  OrderCreatePayload,
  Product,
  ProductCreatePayload,
  ProductDraftRequest,
  ProductDraftResponse,
  QaLog,
  ReviewReportData,
  ScriptSection,
  ScriptType,
  ToolLog,
  UploadedImageResponse,
  UserProfile
} from "./types";
import { resolveProductImageUrl } from "./utils/productImages";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api";
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
export const AUTH_TOKEN_KEY = "live_agent_admin_token";

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchProducts(): Promise<Product[]> {
  return requestJson<{ items: Product[] }>("/products/").then((data) => data.items.map(normalizeProductImage));
}

export function createProduct(payload: ProductCreatePayload): Promise<Product> {
  return requestJson<Product>("/products/", {
    method: "POST",
    body: JSON.stringify(payload)
  }).then(normalizeProductImage);
}

export async function deleteProduct(productId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/products/${productId}/`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
}

export async function uploadProductImage(file: File): Promise<UploadedImageResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/uploads/product-image/`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = (await response.json()) as UploadedImageResponse;
  return { ...data, imageUrl: normalizeImageUrl(data.imageUrl) };
}

export function requestProductDraft(payload: ProductDraftRequest): Promise<ProductDraftResponse> {
  return requestJson<ProductDraftResponse>("/products/draft/", {
    method: "POST",
    body: JSON.stringify(payload)
  }).then((data) => ({
    ...data,
    product: normalizeProductImage(data.product)
  }));
}

export function fetchDanmu(): Promise<Danmu[]> {
  return requestJson<{ items: Danmu[] }>("/danmu/").then((data) => data.items);
}

export function requestScript(productId: number, profile: UserProfile, scriptType: ScriptType) {
  return requestJson<{ script: string; source?: "llm" | "fallback" }>("/script/generate/", {
    method: "POST",
    body: JSON.stringify({ productId, profile, scriptType })
  });
}

export function requestScriptSections(productId: number, profile: UserProfile) {
  return requestJson<{ sections: ScriptSection[]; source?: "llm" | "fallback" }>("/script/sections/", {
    method: "POST",
    body: JSON.stringify({ productId, profile })
  });
}

export function requestDanmuAnswer(productId: number, profile: UserProfile, danmu: Danmu) {
  return requestJson<{ answer: string; logs: ToolLog[]; qaLog: QaLog; agentTrace: AgentTraceItem[]; source?: "llm" | "fallback" }>("/danmu/answer/", {
    method: "POST",
    body: JSON.stringify({
      productId,
      profile,
      danmuId: danmu.id,
      text: danmu.text,
      category: danmu.category,
      emotion: danmu.emotion
    })
  });
}

export function createOrder(payload: OrderCreatePayload): Promise<Order> {
  return requestJson<Order>("/orders/", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchOrders(): Promise<Order[]> {
  return requestJson<{ items: Order[] }>("/orders/").then((data) => data.items);
}

export function requestReview(qaLogs: QaLog[], sessionStartedAt?: string): Promise<ReviewReportData> {
  return requestJson<ReviewReportData>("/review/generate/", {
    method: "POST",
    body: JSON.stringify({ qaLogs, sessionStartedAt })
  });
}

export function fetchQaLogs(): Promise<QaLog[]> {
  return requestJson<{ items: QaLog[] }>("/live/qa-logs/").then((data) => data.items);
}

export function fetchToolLogs(): Promise<ToolLog[]> {
  return requestJson<{ items: ToolLog[] }>("/live/tool-logs/").then((data) => data.items);
}

export function fetchLatestReview(): Promise<ReviewReportData | null> {
  return requestJson<{ report: ReviewReportData | null }>("/review/latest/").then((data) => data.report);
}

export function loginAccount(username: string, password: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function registerAccount(username: string, password: string, role: AccountRole): Promise<Account> {
  return requestJson<Account>("/auth/register/", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ username, password, role })
  });
}

export function fetchCurrentAccount(token: string): Promise<Account> {
  return requestJson<Account>("/auth/me/", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function fetchAccounts(): Promise<Account[]> {
  return requestJson<{ items: Account[] }>("/accounts/", {
    headers: authHeaders()
  }).then((data) => data.items);
}

export function updateAccountPassword(accountId: number, password: string): Promise<Account> {
  return requestJson<Account>(`/accounts/${accountId}/password/`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ password })
  });
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeProductImage<T extends Product | ProductCreatePayload>(product: T): T {
  return { ...product, imageUrl: normalizeImageUrl(resolveProductImageUrl(product)) };
}

function normalizeImageUrl(imageUrl: string) {
  if (imageUrl.startsWith("/uploads/")) {
    return `${API_ORIGIN}${imageUrl}`;
  }
  return imageUrl;
}

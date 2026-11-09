export const LIVE_PRODUCT_CHANNEL = "live-agent-active-product";
export const LIVE_PRODUCT_KEY = "live_agent_active_product_id";

export type LiveProductPayload = {
  type: "active-product";
  productId: number;
  updatedAt: number;
};

export function readLiveProductId(): number | null {
  const raw = localStorage.getItem(LIVE_PRODUCT_KEY);
  if (!raw) {
    return null;
  }
  const productId = Number(raw);
  return Number.isFinite(productId) && productId > 0 ? productId : null;
}

export function saveLiveProductId(productId: number, channel: BroadcastChannel | null) {
  localStorage.setItem(LIVE_PRODUCT_KEY, String(productId));
  channel?.postMessage({ type: "active-product", productId, updatedAt: Date.now() } satisfies LiveProductPayload);
}

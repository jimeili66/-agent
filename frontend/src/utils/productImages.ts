import type { Product, ProductCreatePayload } from "../types";

export const DEFAULT_ONLINE_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80";

const defaultImageMap: Record<string, string> = {
  "/products/cup.jpg": "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80",
  "/products/coffee.jpg": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80",
  "/products/cleanser.jpg": "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=80",
  "/products/lamp.jpg": "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80",
  "/products/oatmeal.jpg": "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=900&q=80",
  "/products/wipes.jpg": "https://images.unsplash.com/photo-1583947581924-860bda6a26df?auto=format&fit=crop&w=900&q=80",
  "/products/storage.jpg": "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80",
  "/products/towel.jpg": "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80",
  "/products/laundry.jpg": "https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=900&q=80",
  "/products/earbuds.jpg": "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=900&q=80"
};

const categoryFallbacks: Array<{ keywords: string[]; imageUrl: string }> = [
  { keywords: ["咖啡", "饮品", "茶"], imageUrl: defaultImageMap["/products/coffee.jpg"] },
  { keywords: ["美妆", "护肤", "洁面"], imageUrl: defaultImageMap["/products/cleanser.jpg"] },
  { keywords: ["台灯", "照明", "学习"], imageUrl: defaultImageMap["/products/lamp.jpg"] },
  { keywords: ["食品", "燕麦", "坚果", "零食"], imageUrl: defaultImageMap["/products/oatmeal.jpg"] },
  { keywords: ["清洁", "湿巾", "洗衣"], imageUrl: defaultImageMap["/products/laundry.jpg"] },
  { keywords: ["收纳", "家居"], imageUrl: defaultImageMap["/products/storage.jpg"] },
  { keywords: ["毛巾", "浴巾"], imageUrl: defaultImageMap["/products/towel.jpg"] },
  { keywords: ["耳机", "数码", "蓝牙"], imageUrl: defaultImageMap["/products/earbuds.jpg"] }
];

export function resolveProductImageUrl(product: Pick<Product | ProductCreatePayload, "imageUrl" | "name" | "category">): string {
  const imageUrl = product.imageUrl.trim();
  if (imageUrl.startsWith("/uploads/") || imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (defaultImageMap[imageUrl]) {
    return defaultImageMap[imageUrl];
  }

  const text = `${product.name} ${product.category}`;
  const matchedFallback = categoryFallbacks.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  return matchedFallback?.imageUrl ?? DEFAULT_ONLINE_PRODUCT_IMAGE;
}

import type { Product, ProductCreatePayload } from "../types";

export const DEFAULT_ONLINE_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80";

const catalogImages = new Set([
  "/products/cup.jpg",
  "/products/coffee.jpg",
  "/products/cleanser.jpg",
  "/products/lamp.jpg",
  "/products/oatmeal.jpg",
  "/products/wipes.jpg",
  "/products/storage.jpg",
  "/products/towel.jpg",
  "/products/laundry.jpg",
  "/products/earbuds.jpg",
  "/products/books.jpg",
  "/products/clothes.jpg"
]);

export function isCatalogProductImage(imageUrl: string): boolean {
  return catalogImages.has(imageUrl);
}

const categoryFallbacks: Array<{ keywords: string[]; imageUrl: string }> = [
  { keywords: ["咖啡", "饮品", "茶"], imageUrl: "/products/coffee.jpg" },
  { keywords: ["美妆", "护肤", "洁面"], imageUrl: "/products/cleanser.jpg" },
  { keywords: ["台灯", "照明", "学习"], imageUrl: "/products/lamp.jpg" },
  { keywords: ["食品", "燕麦", "坚果", "零食"], imageUrl: "/products/oatmeal.jpg" },
  { keywords: ["湿巾"], imageUrl: "/products/wipes.jpg" },
  { keywords: ["清洁", "洗衣"], imageUrl: "/products/laundry.jpg" },
  { keywords: ["收纳", "家居"], imageUrl: "/products/storage.jpg" },
  { keywords: ["毛巾", "浴巾"], imageUrl: "/products/towel.jpg" },
  { keywords: ["耳机", "数码", "蓝牙"], imageUrl: "/products/earbuds.jpg" }
];

export function resolveProductImageUrl(product: Pick<Product | ProductCreatePayload, "imageUrl" | "name" | "category">): string {
  const imageUrl = product.imageUrl.trim();
  if (imageUrl.startsWith("/uploads/") || imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (isCatalogProductImage(imageUrl)) {
    return imageUrl;
  }

  const text = `${product.name} ${product.category}`;
  const matchedFallback = categoryFallbacks.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  return matchedFallback?.imageUrl ?? DEFAULT_ONLINE_PRODUCT_IMAGE;
}

import type { Danmu } from "../types";

const seed = [
  ["这个多少钱？", "价格", "感兴趣"],
  ["学生买有优惠吗？", "优惠计算", "感兴趣"],
  ["两件到底便宜多少？", "优惠计算", "犹豫"],
  ["库存还多吗？", "规格", "感兴趣"],
  ["适合敏感肌吗？", "适用人群", "犹豫"],
  ["可以七天无理由吗？", "售后", "犹豫"],
  ["是不是全网最低价？", "异常合规", "质疑"],
  ["能治失眠吗？", "异常合规", "质疑"],
  ["质量会不会很差？", "异议质疑", "质疑"],
  ["买了不喜欢怎么办？", "售后", "犹豫"]
] as const;

export const danmuList: Danmu[] = Array.from({ length: 50 }, (_, index) => {
  const item = seed[index % seed.length];
  const suffix = index < seed.length ? "" : ` #${Math.floor(index / seed.length) + 1}`;

  return {
    id: index + 1,
    text: `${item[0]}${suffix}`,
    category: item[1],
    emotion: item[2]
  };
});

# Video Speaking Coach 发布资料包

这里集中放置 Chrome Web Store 上架文案、使用教程、宣传文案和可直接预览的图片。当前是**发布准备稿**，尚未提交商店。

## 从哪里开始

- [中文商店介绍](STORE_LISTING_ZH.md)、[英文商店介绍](STORE_LISTING_EN.md)
- [一分钟上手](QUICK_START.md)、[完整使用教程](../USER_GUIDE.md)
- [产品简介](PRODUCT_ONE_PAGER.md)、[社交平台文案与演示脚本](PROMOTION_COPY.md)
- [费用与竞品对比笔记](PRICING_COMPARISON.md)
- [素材清单与真实记录截图状态](ASSET_PLAN.md)、[发布前检查](PUBLISH_CHECKLIST.md)
- [公开隐私政策草稿](PRIVACY_POLICY_DRAFT.md)

## 图片

`assets/` 中的 `screenshot-*.png` 是 1280 × 800 的商店图，`promo-small-440x280.png` 是小宣传图，`store-icon-128.png` 是商店图标。`screenshot-03-history-demo.png` 展示**虚构练习记录**；用户真实历史记录尚未提供，不能把演示内容称作用户历史。

图像可通过 `source/generate-assets.mjs` 重建。它在隔离的临时 Chrome 配置中加载当前扩展，用虚构数据拍摄界面，再组合成宣传图。生成过程中不读取用户浏览器资料或 API Key。

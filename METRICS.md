# 如何知道插件有没有被使用

## 目前能看到什么

当前版本没有自己的用户账号或遥测服务，也不向项目作者发送练习记录。因此作者无法知道哪些具体的人安装、打开或完成了练习。

- **GitHub：**仓库的 Star、Fork、Issue 和 Pull Request 能反映关注与社区参与。仓库管理者在 `Insights → Traffic` 可看近 14 天访问者、克隆及来源，但仓库访问或 Star 不等于插件使用。
- **Chrome Web Store：**上架后在开发者后台查看安装、卸载、曝光和“用户”统计。Chrome 官方说明该“用户”统计基于安装，**不是插件实际活跃使用人数**。
- **主动反馈：**可在 README、商店支持网址和插件里放 GitHub Issues 链接，让用户自愿反馈完成练习的体验。公开 Issue 不适合上传私人练习文本。

参考：[Chrome Web Store 指标](https://developer.chrome.com/docs/webstore/metrics)、[GitHub Traffic](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)。

## 真正要衡量练习效果时

建议先确定少量聚合指标：打开练习、完成第 1 轮、完成第 3 轮、导出记录。当前代码**没有实现这些事件**。若以后加入，应先确定事件最小数据字段、是否需要用户主动开启、保存期限和删除方式，并同步更新插件内说明、公开隐私政策与商店披露。不要上报视频标题、链接、英文原话、API Key 或可识别个人的信息。

# 训练营消息排期助手

移动端优先的训练营微信群消息排期工具。当前版本已经改为 Supabase 云端数据源，不再使用 `localStorage` 保存业务数据。

## 数据来源

所有训练营、课程、微信群、消息话术、发送任务、群发送状态、模板和课程预设都从 Supabase 读取并写回 Supabase。

助理在手机微信里打开同一个链接，勾选“已发送”后会写回云端。你刷新同一个链接也能看到最新状态。

## Supabase 初始化

1. 在 Supabase 免费版创建一个项目。
2. 打开 SQL Editor。
3. 先执行 `supabase/schema.sql`。
4. 再执行 `supabase/seed.sql`。
5. 在 Supabase 项目设置里复制 Project URL 和 publishable key / anon public key。
6. 打开 `config.js`，替换：

```js
window.TRAINING_CAMP_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  publishableKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};
```

第一版为了免登录，SQL 里给匿名用户开放了读写权限。任何拿到链接的人都能改数据，后续要多人协作和权限控制时，再加登录和 RLS 限制。

## 免费部署

这个目录是静态前端，可以直接部署到：

- Vercel
- Netlify
- Cloudflare Pages

部署根目录选择 `training-camp-notice-assistant`。部署后把生成的网页链接发给助理即可。

## 当前规则

- 每节课生成 2 条提醒：12:00 中午预告、开课前 1 小时课前提醒。
- 课程预设、话术模板都在 Supabase 里，可改数据库后刷新前端生效。
- 发送状态按每个群单独记录到云端。

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
5. 再执行 `supabase/admin-mode.sql`，开启管理员 / 助理模式。
6. 再执行 `supabase/template-types.sql`，开启完整模板类型。
7. 再执行 `supabase/assistant-access.sql`，开启助理访问码。
8. 再执行 `supabase/password-management.sql`，开启密码管理，并把默认助理访问码设为短码。
9. 在 Supabase 项目设置里复制 Project URL 和 publishable key / anon public key。
10. 打开 `config.js`，替换：

```js
window.TRAINING_CAMP_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  publishableKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};
```

管理员模式和助理访问码都使用轻量口令 + Supabase RLS 控制。助理输入访问码后，可以查看、复制话术、勾选已发送；新建训练营、修改模板、删除排期、新增管理员、修改助理访问码、修改管理员主密码需要管理员口令。

当前默认助理访问码是 `7788`。管理员主密码可在页面右上角「管理设置」里修改。

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

# 日常账本

一个可部署到 GitHub Pages 的个人云端记账应用。前端使用 Vue 3 + Vite，登录与数据保存在你自己的 Supabase 项目里。

## 功能

- 邮箱注册与登录（Supabase Auth）
- 收入、支出的新增、编辑、删除
- 按月查看结余、收入、支出和分类占比
- 类型筛选、搜索、导出当前筛选结果为 CSV
- 手机与桌面适配
- 行级安全策略（RLS）：用户只能访问自己的账目

## 项目结构

```text
.
├── .github/workflows/deploy.yml  # GitHub Pages 自动部署
├── supabase/schema.sql            # 建表、索引、权限与 RLS
├── src/
│   ├── lib/supabase.js           # Supabase 客户端
│   ├── lib/ledger.js             # 分类与格式化工具
│   ├── App.vue                   # 登录、账目、统计界面
│   ├── main.js
│   └── style.css
├── .env.example
├── index.html
├── package.json
└── vite.config.js                 # 自动处理 Pages 子路径
```

## 1. 建立 Supabase 项目

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 新建项目。
2. 打开 **SQL Editor**，完整执行 [`supabase/schema.sql`](supabase/schema.sql)。这会建立 `transactions` 表、用户与日期索引，以及按 `auth.uid()` 限制读写的 RLS 策略。
3. 在 **Authentication → Providers → Email** 检查邮箱登录设置。若启用邮箱确认，注册后需要点邮件中的链接才能登录。测试期如果关闭确认，也可以直接注册登录。
4. 在项目的 **Connect** 面板或 **Settings → API Keys** 找到 **Project URL** 和 **publishable key**。只用 publishable key；不要把 secret/service_role key 放进前端或 GitHub。
5. 在 **Authentication → URL Configuration** 设置 Site URL 与 Redirect URLs：本地先加入 `http://localhost:5173/`，部署后再加入实际 Pages 地址，例如 `https://USERNAME.github.io/REPO/`。若启用邮箱确认，邮件回跳需要允许这个地址。

数据库字段：`id`、`user_id`、`type`、`amount`、`category`、`note`、`occurred_on`、`created_at`。金额使用 `numeric(12,2)`，按本地所选日期存 `date`；界面当前以人民币显示。前端分类与 SQL 约束同步维护，增加分类时两处都要更新。

## 2. 本地运行

需要 Node.js 20.19+ 或 22.12+。在项目根目录运行：

```bash
npm install
cp .env.example .env.local
```

编辑 `.env.local`：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

然后运行：

```bash
npm run dev
```

浏览器打开 `http://localhost:5173/`。修改 `.env.local` 后需要重启 Vite。验证生产构建可运行 `npm run build`，然后 `npm run preview`。

## 3. 部署到 GitHub Pages

1. 创建 GitHub 仓库，将本项目推送到 `main`。`.env.local` 已被忽略，不要提交。
2. 仓库 **Settings → Secrets and variables → Actions → Variables** 新建两个变量：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`，填写与本地相同的值。它们会进入浏览器构建产物，因此必须使用 publishable key，不能使用 secret key。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 推送到 `main` 后，工作流安装依赖、构建并发布 `dist/`。在 **Actions** 页查看结果。
5. 打开 `https://USERNAME.github.io/REPO/`，把此地址加入 Supabase Auth 的 Site URL / Redirect URLs。用户站点仓库 `USERNAME.github.io` 的地址是 `https://USERNAME.github.io/`。

`vite.config.js` 会在 GitHub Actions 内根据仓库名自动设置 `base`。若使用自定义域名，在 Actions Variables 中另设 `VITE_BASE_PATH=/`，并按 GitHub Pages 文档配置域名。

## 安全说明

GitHub Pages 只托管静态文件。用户直接通过 Supabase Auth 和 Data API 访问数据；安全边界是数据库 RLS，不是前端的筛选逻辑。不要关闭 `transactions` 的 RLS，也不要把 Supabase secret key 或 service_role key 放入 `VITE_` 环境变量。若账目需要长期保存，建议定期在 Supabase 导出数据库备份；应用内 CSV 可导出当前月份及当前筛选范围的记录。

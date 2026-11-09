# 直播电商运营 Agent 工作台

这是一个面向直播电商与校园模拟直播场景的运营 Agent 项目。系统围绕“商品资料 -> 主播话术 -> 弹幕问答 -> 工具调用 -> 合规审查 -> 直播复盘”的完整流程设计，帮助团队理解内容生成、业务规则、工具调用和状态记忆在 Agent 应用中的组合方式。

项目包含管理端、用户端、账号端和 FastAPI 后端，支持商品录入、商品图片上传、DeepSeek 辅助生成话术、用户弹幕问答、订单展示、工具调用日志和复盘报告。

## 功能概览

- 商品库管理：支持新增、删除、展示商品资料，包含名称、分类、卖点、价格、直播价、优惠规则、库存、注意事项、适用人群和商品图片。
- 主播话术生成：根据当前选中商品、用户画像和话术类型生成开场、产品介绍、促销提醒、互动提问和收尾话术。
- 用户端直播间：用户可以浏览商品、提交弹幕问题、向 Agent 提问和模拟下单。
- 管理端实时运营：展示当前直播商品、弹幕流、Agent 分析、工具调用日志、合规提醒和用户下单记录。
- Agent 协作视图：呈现主播 Agent、场控 Agent、客服 Agent、合规审查 Agent 的分析链路。
- 工具调用能力：支持优惠计算、库存查询、商品推荐和合规检查等模拟工具调用。
- 直播复盘报告：统计订单数、销量、成交额、客单价和商品销量排行，并生成高频问题、情绪分布、转化阻碍、优化建议和下一场排品计划。
- 账号端：支持管理端登录、账号管理和密码修改。

## 项目文档

- [作品介绍](docs/作品介绍/作品介绍.md)：项目详情、使用方式、亮点、AI 辅助测试、关键技术和项目图片。
- [作品介绍 PDF](docs/作品介绍/作品介绍.pdf)
- [异机运行与数据库迁移](docs/运行与数据库迁移.md)：本机独立演示、多人共享及数据搬迁方式。

项目目前以本机演示为主。不同电脑共用订单和弹幕，需要连接同一后端及数据库，并配置监听地址、API 地址和跨域来源。现有摄像头画面同步仅限同一浏览器环境，不等同于跨设备音视频直播。

## 技术栈

### 前端

- React
- TypeScript
- Vite
- lucide-react
- CSS Dashboard Layout

### 后端

- FastAPI
- SQLAlchemy
- PyMySQL
- python-multipart
- Uvicorn
- Pytest

### 数据与 AI

- MySQL
- DeepSeek API
- 本地兜底规则生成
- 商品表、问答日志、工具调用日志、订单记录、复盘记录

## 目录结构

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI 入口与 API 路由
│   │   ├── models.py                # Pydantic 数据模型
│   │   ├── database.py              # SQLAlchemy 数据库配置
│   │   ├── product_repository.py    # MySQL 持久化逻辑
│   │   ├── services.py              # Agent 话术、问答、复盘等业务逻辑
│   │   ├── storage.py               # 存储适配层
│   │   └── auth.py                  # 登录与 Token
│   └── tests/                       # 后端测试
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # 管理端
│   │   ├── UserApp.tsx              # 用户端
│   │   ├── AccountApp.tsx           # 账号端
│   │   ├── LoginApp.tsx             # 登录页
│   │   ├── api.ts                   # 前端 API 请求
│   │   ├── styles.css               # 页面样式
│   │   └── data/                    # 默认商品、弹幕、用户画像
│   └── public/products/             # 示例商品图片
├── docs/                            # 项目说明与设计文档
├── start-project.py                 # 一键启动前后端
├── stop-project.ps1                 # 停止项目服务
├── status-project.ps1               # 检查服务状态
├── docker-compose.yml               # Docker MySQL/前后端参考配置
├── requirements.txt                 # 后端依赖
└── .env.example                     # 环境变量模板
```

## 本地运行

### 1. 准备依赖

需要提前安装：

- Python 3.11 或更高版本
- Node.js 20 或更高版本
- MySQL 8.x

### 2. 安装后端依赖

```powershell
pip install -r requirements.txt
```

### 3. 安装前端依赖

```powershell
cd frontend
npm install
cd ..
```

### 4. 配置环境变量

复制 `.env.example` 为 `.env`，并填写自己的 MySQL 密码和 DeepSeek Key。

```powershell
copy .env.example .env
```

示例：

```env
DATABASE_URL=mysql+pymysql://root:你的MySQL密码@127.0.0.1:3306/live_agent?charset=utf8mb4
DEEPSEEK_API_KEY=你的DeepSeekKey
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

注意：`.env` 包含本机密码和 API Key，已经被 `.gitignore` 忽略，不要上传到 GitHub。

### 5. 启动项目

```powershell
python start-project.py
```

启动成功后会看到：

```text
Backend:  http://127.0.0.1:8000/docs
Frontend: http://127.0.0.1:5173/
Frontend API: http://127.0.0.1:8000/api
Backend ready:  True
Frontend ready: True
```

## 访问地址

- 管理端登录：http://127.0.0.1:5173/admin/login
- 管理端仪表盘：http://127.0.0.1:5173/admin/dashboard
- 商品库：http://127.0.0.1:5173/admin/products
- 直播模拟：http://127.0.0.1:5173/admin/live
- Agent 协作：http://127.0.0.1:5173/admin/agents
- 复盘报告：http://127.0.0.1:5173/admin/review
- 用户端：http://127.0.0.1:5173/user
- 账号端：http://127.0.0.1:5173/account
- 后端接口文档：http://127.0.0.1:8000/docs

## 默认账号

管理端默认账号：

```text
账号：admin
密码：123456
```

首次运行后建议在账号端修改默认密码。

## 本次同步修复

- 旧复盘报告缺少销售统计字段时仍可读取，页面显示“未记录”，避免将未知历史销量误记为零。
- 后端复盘读取全部已保存订单计算销量和成交额，最近订单列表仍保留分页限制。
- 后端暂不可用时，不再用页面最近 8 笔订单冒充完整销售统计。
- 修复 PowerShell 启动脚本的健康检查。
- 新增 5 个回归用例；隔离副本现有后端测试共 79 项通过。作品介绍中 74 项是文档生成时的验证记录。

## 常用命令

### 检查项目状态

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\status-project.ps1
```

### 停止项目

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\stop-project.ps1
```

### 后端测试

```powershell
python -m pytest backend/tests -q
```

### 前端构建

```powershell
cd frontend
npm run build
```

## API 模块

主要接口包括：

- `GET /api/health/`：健康检查
- `POST /api/auth/login/`：管理端登录
- `GET /api/products/`：商品列表
- `POST /api/products/`：新增商品
- `DELETE /api/products/{product_id}/`：删除商品
- `POST /api/uploads/product-image/`：上传商品图片
- `POST /api/products/draft/`：AI 生成商品资料草稿
- `POST /api/script/generate/`：生成单段主播话术
- `POST /api/script/sections/`：生成结构化主播话术
- `GET /api/danmu/`：弹幕列表
- `POST /api/danmu/answer/`：弹幕问答与工具调用
- `POST /api/orders/`：创建模拟订单
- `GET /api/orders/`：订单列表
- `POST /api/review/generate/`：生成复盘报告
- `GET /api/live/qa-logs/`：问答日志
- `GET /api/live/tool-logs/`：工具调用日志

## 保密说明

本仓库默认不会提交以下内容：

- `.env`
- `.venv/`
- `node_modules/`
- `frontend/dist/`
- `logs/`
- `backend/uploads/`
- `*.zip`

请不要把真实 MySQL 密码、DeepSeek Key、OpenAI Key 或其他私密 Token 写入 README、代码注释或提交记录。

如果 API Key 曾经公开过，建议到对应平台重新生成新的 Key。

## 项目说明

本项目使用模拟商品和模拟直播数据，不要求接入真实电商平台。所有价格、库存、优惠规则和售后说明均用于课程展示或项目答辩场景。

系统在生成话术和问答时应遵循基本合规要求：

- 不承诺全网最低价
- 不夸大疗效或功效
- 不制造库存焦虑
- 价格、售后、规格以下单页和店铺规则为准

## 后续可扩展方向

- WebSocket 实时弹幕推送
- 更完整的 LangGraph 多 Agent 流程
- PostgreSQL 部署支持
- 管理端权限分级
- 直播复盘图表增强
- 语音播报或流式回复
- 商品数据批量导入


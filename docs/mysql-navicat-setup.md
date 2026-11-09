# MySQL 和 Navicat 配置说明

本项目现在支持两种商品存储模式：

- 未配置 `DATABASE_URL`：使用内存数据，后端重启后新增商品会丢失。
- 已配置 `DATABASE_URL`：使用 MySQL，新增商品会保存到数据库，Navicat 可以查看。

## 1. 在 MySQL 创建数据库

在 Navicat 或 MySQL 命令行执行：

```sql
CREATE DATABASE IF NOT EXISTS live_agent
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

## 2. 配置后端连接 MySQL

在启动 FastAPI 前，在 PowerShell 里设置：

```powershell
$env:DATABASE_URL="mysql+pymysql://用户名:密码@127.0.0.1:3306/live_agent?charset=utf8mb4"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

示例：

```powershell
$env:DATABASE_URL="mysql+pymysql://root:你的密码@127.0.0.1:3306/live_agent?charset=utf8mb4"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

后端启动时会自动创建 `products` 表，并在空表时导入默认 10 个商品。

## 3. Navicat 连接信息

```text
连接类型：MySQL
主机：127.0.0.1
端口：3306
用户名：你的 MySQL 用户名
密码：你的 MySQL 密码
数据库：live_agent
```

连接后查看：

```text
live_agent
└── products
```

你在网页里点击“加入货盘”新增的商品，会写入 `products` 表。

## 4. 商品图片

图片文件仍保存在项目目录：

```text
backend/uploads/products/
```

MySQL 的 `products.image_url` 字段只保存图片访问地址，例如：

```text
/uploads/products/xxxx.png
```


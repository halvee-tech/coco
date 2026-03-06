# Coco

面向团队的 AI 编码协作平台，核心价值：**将软件工程规范注入 AI 工作流**。

## 产品结构

- **首页**：Agent 对话（对话、文件操作、Web Fetch、记忆系统）
- **设置**：模型供应商 / Agent 管理 / Skill 配置 / 外观
- **Project 空间（CoCode）**：需求 → 方案 → 任务 → Review → Issue 全流程（二期）

MVP 范围：首页 + 设置，验证目标是 Agent 在规范和 Skill 约束下的对话质量。

## 技术架构

```
Renderer（React UI）
    │ Electron IPC
Main 进程（Node.js）
    ├── IPC 层         ← 接收前端请求，推送事件
    ├── Service 层     ← 业务编排
    ├── Core 层        ← Agent 引擎（执行循环 / 工具 / 记忆 / Prompt 组装）
    ├── Provider 层    ← 模型调用（Vercel AI SDK）
    └── Data 层        ← SQLite（better-sqlite3）
```

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron |
| 前端 | Vite + React + Zustand + Tailwind + shadcn/ui |
| 模型调用 | Vercel AI SDK（Anthropic / OpenAI / Google / OpenAI-compatible） |
| Agent 引擎 | 自研（执行循环 + 工具系统 + 记忆系统 + Prompt 组装） |
| 数据库 | SQLite（better-sqlite3） |
| 语言 | TypeScript 全栈 |

## 项目结构

```
coco/
├── electron/                   # Main 进程
│   ├── main.ts                 # Electron 入口
│   ├── preload.ts              # contextBridge（暴露 window.cocoAPI）
│   ├── ipc/                    # IPC handler
│   ├── services/               # 业务编排层
│   ├── core/                   # 引擎核心
│   │   ├── agent/              # Agent 组装（Cold Assembly + Hot Injection）
│   │   ├── engine/             # 执行引擎（AgentEngine + 上下文压缩）
│   │   ├── memory/             # 记忆系统（提取 / 注入 / 去重 / 衰减）
│   │   ├── tools/              # 工具系统（File / Bash / WebFetch）
│   │   └── provider/           # Provider 注册 + API Key 加密
│   └── data/                   # 数据层
│       ├── database.ts         # SQLite 初始化 + 迁移
│       └── repositories/       # Repository 模式封装 SQL
├── src/                        # Renderer 进程（React）
│   ├── stores/                 # Zustand 按领域拆分
│   ├── pages/                  # 页面组件（home / settings）
│   ├── components/             # 通用组件（ui / Markdown / CodeBlock）
│   └── lib/                    # 工具函数
├── docs/                       # 技术文档
│   ├── technical-architecture.md
│   ├── database-schema.sql
│   └── agent-architecture.html
└── prd/                        # PRD + UI Demo（HTML 可预览）
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发环境（Electron + Vite HMR）
npm run dev

# 构建生产包
npm run build
```

要求 Node.js >= 18。

## 开发计划

项目按 7 个迭代推进，详见 [GitHub Issues](https://github.com/halvee-tech/coco/issues)：

1. **Data 层** — SQLite 初始化 + Schema + Repository
2. **Provider 层** — 模型连接 + API Key 加密 + 设置页
3. **基础对话** — 端到端聊天链路（streaming + 持久化 + 恢复）
4. **工具系统** — 文件操作 / Bash / WebFetch + 权限审批
5. **Agent 组装 + 记忆** — Cold/Hot Assembly + 四层记忆
6. **Engine 补全** — 上下文压缩 / 错误恢复 / 用量追踪
7. **UI 完善 + 打包** — Markdown 渲染 / 主题 / electron-builder

## 文档

- [技术架构文档](docs/technical-architecture.md)（v0.8，MVP 设计完成）
- [数据库 Schema](docs/database-schema.sql)
- [Agent 架构图](docs/agent-architecture.html)（浏览器打开预览）
- [PRD 交接文档](prd/Coco_AI交接文档.md)

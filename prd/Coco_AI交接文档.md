# Coco 产品交接文档
> 供下一个 AI 会话继续工作使用，请完整阅读后再开始对话。

---

## 一、基本信息

- **产品名**：Coco
- **Project 空间内的 AI 编码工作流**：CoCode（Coco 是整个产品，CoCode 是其中一个二级功能）
- **当前文档版本**：Coco 产品概念文档 v1.0（已生成 .docx）
- **技术栈**：Tauri + React + Rust + SQLite（纯客户端，无云端）
- **定位**：面向团队的 AI 编码协作平台，核心价值是「将软件工程规范注入 AI 工作流」
- **用户背景**：前端开发者，不会 Rust，计划用 Claude Code 辅助开发，先满足自己用再内部推行

---

## 二、产品结构

```
Coco（产品）
├── 首页（基础 Agent 对话）
│   ├── 历史会话（今天/昨天/7天内/更早 分组，无时间显示）
│   ├── 基础能力：对话、Web Search、Web Fetch
│   └── Project 入口 → 项目列表（主内容区展示）
│
├── 设置
│   ├── 模型供应商（统一管理 API Key）
│   ├── Agent 管理（内置 + 自定义）
│   ├── Skill 配置（内置 + 自定义）
│   ├── 外观（黑/白主题）
│   ├── 账号
│   └── 关于
│
└── Project 空间（CoCode）—— 二期
    ├── 需求 / 技术方案 / 任务 / Review / Issue / 规范
    └── 布局：左侧边栏 + 中间对话区 + 右侧文档输出（三栏）
```

---

## 三、MVP 范围（第一期）

**包含：** 首页（基础 Agent 对话）+ 设置（供应商/Agent/Skill/外观）
**不包含：** Project 空间（CoCode 工作流）是二期
**验证目标：** Agent 在规范和 Skill 约束下，对话质量是否真的比裸调模型更好？

---

## 四、已完成的产出文件

位于 `/mnt/user-data/outputs/`：
- `cocode-demo.jsx`：完整可跳转 React 原型（首页+对话+Project列表+设置）
- `Coco产品概念文档.docx`：完整产品文档 v1.0

---

## 五、技术架构

```
Tauri 客户端
├── 前端（React）：工作流 UI / Agent 管理 / 规范管理
├── Rust 核心层
│   ├── 任务调度器（文件锁 + 排队）
│   ├── 本地 Agent 执行器
│   ├── 文件系统操作
│   └── 模型 API 多模型适配层
└── SQLite：项目/需求/任务/Agent配置/规范库/执行历史/记忆
```

关键决策：
- 纯本地执行，代码仓库零侵入
- 任务异步并行，文件锁防冲突，冲突时排队
- 模型供应商平台级管理，Agent 只引用 provider_id + model_id

---

## 六、Agent 体系

### 核心设计
- Base Agent（对话/记忆/Tools/Skills）→ 角色 Agent 继承扩展
- 配置驱动：Agent 是一份配置，引擎动态加载，无独立实例
- 人创建 Agent，Agent 不能派生子 Agent
- Skills 静态绑定（创建时配置，执行时固定）

### Agent 数据结构
```json
{
  "id": "agent-001",
  "name": "前端 AI",
  "type": "builtin/custom",
  "model": { "provider_id": "p-001", "model_id": "claude-sonnet-4-5" },
  "role_prompt": "...",
  "rules": ["rule-001"],
  "tools": ["FileRead", "FileWrite", "FileEdit", "Glob", "Grep", "Bash"],
  "skills": ["ComponentScanner", "StyleLinter"],
  "memory": { "scope": "project", "context_limit": 80000 }
}
```

### 内置 Agent
| Agent | Tools | Skills |
|---|---|---|
| 前端 AI | Read/Write/Edit/Glob/Grep/Bash | ComponentScanner/StyleLinter/AccessibilityCheck |
| 后端 AI | Read/Write/Edit/Glob/Grep/Bash | APIDesign/SecurityAudit/DBSchemaAnalyzer |
| 架构师 AI | Read/Glob/Grep/Bash（无写权限） | DependencyGraph/SimilarityDetector/RiskAssessor |
| Review AI | Read/Glob/Grep（只读） | RuleChecker/DuplicateDetector/ComplexityAnalyzer |
| AI PM | Read/WebFetch（最小权限） | ContextBuilder/SummaryWriter |

### Tools 完整列表
```
文件类：FileRead / FileWrite / FileEdit / FileDelete
搜索类：Grep / Glob / DirList
执行类：Bash
网络类：WebFetch / WebSearch
Git 类：GitDiff / GitCommit / GitStatus
```

### System Prompt 组装顺序
```
[1] 角色定义  [2] 规范约束  [3] 项目上下文
[4] 记忆      [5] Skills指令  [6] 当前任务（最后）
```

### Agent 间通信
- 不直接通信，全部通过调度层中转
- 共享状态层（SQLite）：任务状态 / 文件变更摘要 / 文件锁 / 上一个 Agent 输出摘要

### 失败处理
| 类型 | 策略 |
|---|---|
| 模型调用失败 | 重试 3 次 → 通知人 |
| 执行失败 | 不重试，通知人 |
| 权限失败 | 直接记录拦截 |
| 上下文失败 | 触发记忆压缩后重试一次 |

---

## 七、记忆体系

四层分级：
- **短期**（上下文窗口）→ 滚动摘要压缩
- **情节**（SQLite + 向量索引）→ 分层压缩 + 遗忘机制
- **语义**（SQLite）→ 按相关性动态裁剪，总注入量控制在 20% 以内
- **程序**（规范库）→ 静态（规范库）+ 动态（执行历史提炼）

上下文注入优先级：任务+规范 → 文件修改历史 → 相似历史任务 → 项目基础信息 → 早期对话摘要

压缩在后台异步执行，不阻塞主路径。

---

## 八、规范体系

```json
{
  "id": "rule-001",
  "title": "禁止内联样式",
  "layer": "project/role/task",
  "role": ["frontend"],
  "level": "error/warning",
  "description": "给人看的描述",
  "prompt_inject": "给 AI 注入的精简指令",
  "version": 3,
  "status": "active/draft/deprecated"
}
```

description 和 prompt_inject 分离是核心设计。

---

## 九、CoCode 工作流（二期，已设计完成）

1. **需求输入**：AI PM 多轮对话 → 结构化需求文档 → 人工确认 ✋
2. **技术方案**：架构师 AI 生成方案 → 多轮确认 → 任务列表 → 人工确认 ✋
3. **任务执行**：异步并行 → 文件锁防冲突 → 执行报告 → 人决定是否 Review
4. **Review**：独立 Review AI → 问题分级（严重/警告）→ 修复或转 Issue

---

## 十、下一步（按优先级）

1. **数据库 Schema 设计**（最关键，还没开始）
2. Project 空间 UI Demo（需求页、任务页、Review 页）
3. 开始技术实现

---

## 十一、对话风格

- 直接、理性，不喜欢奉承
- 遇到问题直接指出，给判断而非罗列选项
- 用户认可「先用自己满足需求就是成功」的验证策略
- 产品核心差异化：规范强约束 + Agent 执行，不是做得更快，而是做得更规范

import { useState } from "react";

// ── Theme ──────────────────────────────────────────────
const D = {
  bg: "#0a0a0a", sidebar: "#111", surface: "#111", card: "#1a1a1a",
  border: "#222", borderSoft: "#1a1a1a", text: "#ffffff", textSub: "#888",
  textMuted: "#3a3a3a", accent: "#ffffff", accentText: "#000",
  accentSoft: "#1e1e1e", inputBg: "#0d0d0d", green: "#3dba6a",
  greenBg: "#0a1f10", greenBorder: "#153020", red: "#f87171", redBg: "#1e0808",
  amber: "#c09040", amberBg: "#171200", amberBorder: "#251c00", groupLabel: "#444",
};
const L = {
  bg: "#f5f5f3", sidebar: "#fff", surface: "#fff", card: "#f5f5f3",
  border: "#e8e8e4", borderSoft: "#efefec", text: "#111", textSub: "#777",
  textMuted: "#ccc", accent: "#111", accentText: "#fff",
  accentSoft: "#f0f0ee", inputBg: "#eeeeec", green: "#1a9445",
  greenBg: "#f0fff5", greenBorder: "#c8ecd8", red: "#e05555", redBg: "#fff0f0",
  amber: "#9a7030", amberBg: "#fffbf0", amberBorder: "#f0e5c0", groupLabel: "#bbb",
};

// ── Data ───────────────────────────────────────────────
const HISTORY_GROUPS = [
  { label: "今天", items: [{ id: 1, title: "如何用 Tauri 实现文件监听" }, { id: 2, title: "React useCallback 和 useMemo 的区别" }, { id: 3, title: "Rust 的生命周期概念解析" }] },
  { label: "昨天", items: [{ id: 4, title: "TypeScript 泛型高级用法" }, { id: 5, title: "SQLite 索引优化策略" }] },
  { label: "7 天内", items: [{ id: 6, title: "WebSocket 断线重连实现" }, { id: 7, title: "CSS Grid 布局完整指南" }] },
  { label: "更早", items: [{ id: 8, title: "Git rebase 和 merge 的选择" }, { id: 9, title: "Nginx 反向代理配置详解" }] },
];

const PROJECTS = [
  { id: 1, name: "E-Commerce Platform", desc: "电商平台全栈开发", tasks: 12, status: "active", updated: "2小时前", tech: "React · Node · PostgreSQL" },
  { id: 2, name: "Admin Dashboard", desc: "后台管理系统", tasks: 5, status: "active", updated: "昨天", tech: "Vue · FastAPI · MySQL" },
  { id: 3, name: "Mobile App API", desc: "移动端接口服务", tasks: 8, status: "idle", updated: "3天前", tech: "React Native · Go" },
  { id: 4, name: "Data Pipeline", desc: "数据处理与分析", tasks: 3, status: "idle", updated: "上周", tech: "Python · Airflow" },
];

const MOCK_MESSAGES = [
  { role: "user", text: "useCallback 和 useMemo 有什么区别？" },
  { role: "ai", text: "两者都是 React 的性能优化 Hook，但用途不同：\n\nuseMemo 用于缓存计算结果（值），当依赖不变时跳过重新计算。\n\nuseCallback 用于缓存函数引用，当依赖不变时返回同一个函数实例，主要用于避免子组件因父组件渲染而不必要地重新渲染。\n\n简单记：useMemo 缓存值，useCallback 缓存函数。" },
  { role: "user", text: "什么时候该用 useCallback？" },
  { role: "ai", text: "主要两个场景：\n\n1. 传给子组件的回调函数，且子组件用 React.memo 包裹时，配合使用才有效果。\n\n2. 作为其他 Hook 的依赖，比如 useEffect 的依赖数组里有函数时，用 useCallback 稳定引用避免无限触发。\n\n不要过度使用——如果子组件没有 memo，或者函数不作为依赖，useCallback 反而是负优化。" },
];

const PROVIDERS = [
  { id: 1, name: "Anthropic", models: ["claude-opus-4", "claude-sonnet-4-5", "claude-haiku-4-5"], connected: true, key: "sk-ant-••••••••••••3f2a" },
  { id: 2, name: "OpenAI", models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"], connected: true, key: "sk-••••••••••••9c1b" },
  { id: 3, name: "Gemini", models: ["gemini-2.0-flash", "gemini-1.5-pro"], connected: false, key: "" },
  { id: 4, name: "DeepSeek", models: ["deepseek-v3", "deepseek-r1"], connected: false, key: "" },
];

const AGENTS = [
  { id: 1, name: "前端 AI", type: "builtin", model: "claude-sonnet-4-5", provider: "Anthropic", skills: ["ComponentScanner", "StyleLinter"], tools: ["FileRead", "FileWrite", "FileEdit", "Bash"] },
  { id: 2, name: "后端 AI", type: "builtin", model: "claude-sonnet-4-5", provider: "Anthropic", skills: ["APIDesign", "SecurityAudit"], tools: ["FileRead", "FileWrite", "FileEdit", "Bash"] },
  { id: 3, name: "架构师 AI", type: "builtin", model: "claude-opus-4", provider: "Anthropic", skills: ["DependencyGraph", "RiskAssessor"], tools: ["FileRead", "Glob", "Grep"] },
  { id: 4, name: "Review AI", type: "builtin", model: "claude-sonnet-4-5", provider: "Anthropic", skills: ["RuleChecker", "DuplicateDetector"], tools: ["FileRead", "Glob", "Grep"] },
  { id: 5, name: "AI PM", type: "builtin", model: "claude-sonnet-4-5", provider: "Anthropic", skills: ["ContextBuilder", "SummaryWriter"], tools: ["FileRead", "WebFetch"] },
  { id: 6, name: "自定义前端 AI", type: "custom", model: "gpt-4o", provider: "OpenAI", skills: ["ComponentScanner", "StyleLinter", "AccessibilityCheck"], tools: ["FileRead", "FileWrite", "FileEdit", "Bash"] },
];

const SKILLS = [
  { id: "s1", name: "ComponentScanner", category: "前端", desc: "扫描已有组件，避免重复开发", builtin: true },
  { id: "s2", name: "StyleLinter", category: "前端", desc: "检查样式规范合规性", builtin: true },
  { id: "s3", name: "AccessibilityCheck", category: "前端", desc: "无障碍检查", builtin: true },
  { id: "s4", name: "APIDesign", category: "后端", desc: "基于需求生成接口设计", builtin: true },
  { id: "s5", name: "SecurityAudit", category: "后端", desc: "安全漏洞扫描", builtin: true },
  { id: "s6", name: "DBSchemaAnalyzer", category: "后端", desc: "分析数据库结构", builtin: true },
  { id: "s7", name: "RuleChecker", category: "Review", desc: "按规范库逐条检查", builtin: true },
  { id: "s8", name: "DuplicateDetector", category: "Review", desc: "重复代码检测", builtin: true },
  { id: "s9", name: "ComplexityAnalyzer", category: "Review", desc: "代码复杂度分析", builtin: true },
  { id: "s10", name: "DependencyGraph", category: "架构", desc: "生成模块依赖关系图", builtin: true },
  { id: "s11", name: "RiskAssessor", category: "架构", desc: "识别技术风险点", builtin: true },
  { id: "s12", name: "ContextBuilder", category: "通用", desc: "根据任务自动收集相关文件", builtin: true },
  { id: "s13", name: "SummaryWriter", category: "通用", desc: "将长内容压缩为结构化摘要", builtin: true },
  { id: "s14", name: "CodeSearch", category: "通用", desc: "跨文件语义搜索", builtin: true },
  { id: "s15", name: "自定义安全扫描", category: "后端", desc: "团队定制的安全扫描规则集", builtin: false },
];

const SKILL_CATEGORIES = ["全部", "通用", "前端", "后端", "架构", "Review"];
const SETTINGS_NAV = [
  { id: "providers", label: "模型供应商", icon: "◈" },
  { id: "agents", label: "Agent 管理", icon: "⬡" },
  { id: "skills", label: "Skill 配置", icon: "◻" },
  { id: "appearance", label: "外观", icon: "○" },
  { id: "account", label: "账号", icon: "◉" },
  { id: "about", label: "关于", icon: "◎" },
];

// ── Main Component ──────────────────────────────────────
export default function CoCode() {
  const [dark, setDark] = useState(true);
  // page: "home" | "chat" | "projects" | "settings"
  const [page, setPage] = useState("home");
  const [activeChat, setActiveChat] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [settingsNav, setSettingsNav] = useState("providers");
  const [skillCat, setSkillCat] = useState("全部");
  const [expandedAgent, setExpandedAgent] = useState(null);

  const t = dark ? D : L;

  const goHome = () => { setPage("home"); setActiveChat(null); setMessages([]); setInput(""); };
  const openChat = (item) => { setActiveChat(item); setMessages(MOCK_MESSAGES); setPage("chat"); };
  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: "user", text: input }]);
    setInput("");
    setPage("chat");
    if (!activeChat) setActiveChat({ id: 99, title: input });
  };

  const filteredSkills = skillCat === "全部" ? SKILLS : SKILLS.filter(s => s.category === skillCat);

  // ── Shared: Sidebar ────────────────────────────────────
  const Sidebar = () => (
    <div style={{ width: 224, background: t.sidebar, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>

      {/* Logo + toggle */}
      <div style={{ padding: "16px 14px", borderBottom: `1px solid ${t.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={goHome} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <div style={{ width: 28, height: 28, background: t.accent, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: t.accentText, fontSize: 11, fontWeight: 900, letterSpacing: -1 }}>co</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.5, color: t.text }}>Coco</span>
        </button>
        <button onClick={() => setDark(!dark)} style={{ width: 44, height: 22, borderRadius: 99, border: `1px solid ${t.border}`, background: t.accentSoft, cursor: "pointer", position: "relative", padding: 0, flexShrink: 0 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: t.accent, position: "absolute", top: 2, left: dark ? 24 : 2, transition: "left 0.2s" }} />
        </button>
      </div>

      {/* New chat */}
      <div style={{ padding: "10px 10px 6px" }}>
        <button onClick={goHome} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: "none", color: t.textSub, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> 新建会话
        </button>
      </div>

      {/* History */}
      <div style={{ flex: 1, overflow: "auto", padding: "4px 8px 8px" }}>
        {HISTORY_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: t.groupLabel, padding: "10px 8px 3px", fontWeight: 500, letterSpacing: 0.3 }}>
              {group.label}
            </div>
            {group.items.map(item => (
              <button key={item.id} onClick={() => openChat(item)} style={{
                width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 7, marginBottom: 1,
                background: activeChat?.id === item.id && page === "chat" ? t.card : "none",
                border: `1px solid ${activeChat?.id === item.id && page === "chat" ? t.border : "transparent"}`,
                borderLeft: `2px solid ${activeChat?.id === item.id && page === "chat" ? t.accent : "transparent"}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                <div style={{ fontSize: 12, color: activeChat?.id === item.id && page === "chat" ? t.text : t.textSub, fontWeight: activeChat?.id === item.id && page === "chat" ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: t.borderSoft }} />

      {/* Bottom nav */}
      <div style={{ padding: "8px" }}>
        <button onClick={() => { setPage("projects"); setActiveChat(null); }} style={{
          width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, marginBottom: 2,
          background: page === "projects" ? t.card : "none",
          border: `1px solid ${page === "projects" ? t.border : "transparent"}`,
          cursor: "pointer", fontFamily: "inherit",
          color: page === "projects" ? t.text : t.textSub,
          fontSize: 13, fontWeight: page === "projects" ? 600 : 400,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>⊞</span> Project
        </button>
        <button onClick={() => { setPage("settings"); setActiveChat(null); }} style={{
          width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, marginBottom: 2,
          background: page === "settings" ? t.card : "none",
          border: `1px solid ${page === "settings" ? t.border : "transparent"}`,
          cursor: "pointer", fontFamily: "inherit",
          color: page === "settings" ? t.text : t.textSub,
          fontSize: 13, fontWeight: page === "settings" ? 600 : 400,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>⚙</span> 设置
        </button>
        <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: t.accentText, fontWeight: 700, flexShrink: 0 }}>张</div>
          <span style={{ fontSize: 12, color: t.textSub, fontWeight: 500 }}>张三</span>
        </div>
      </div>
    </div>
  );

  // ── Page: Home ─────────────────────────────────────────
  const HomePage = () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px 80px" }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, background: t.accent, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <span style={{ color: t.accentText, fontSize: 20, fontWeight: 900, letterSpacing: -1 }}>co</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, marginBottom: 8 }}>有什么可以帮你的？</div>
        <div style={{ fontSize: 14, color: t.textSub }}>基于 AI 的智能对话助手</div>
      </div>
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px" }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="输入你的问题..." autoFocus
            style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 14, color: t.text, fontFamily: "inherit" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["Web 搜索", "上传文件", "Fetch URL"].map(s => (
                <button key={s} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: `1px solid ${t.border}`, background: "none", color: t.textSub, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
              ))}
            </div>
            <button onClick={sendMessage} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: input ? t.accent : t.accentSoft, color: input ? t.accentText : t.textSub, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>↑</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {["解释这段代码", "帮我写一个 SQL 查询", "搜索最新的 AI 新闻", "生成一个 React 组件"].map(s => (
            <button key={s} onClick={() => setInput(s)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 20, border: `1px solid ${t.border}`, background: t.card, color: t.textSub, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Page: Chat ─────────────────────────────────────────
  const ChatPage = () => (
    <>
      <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: "11px 24px", fontSize: 13, color: t.textSub, fontWeight: 500 }}>
        {activeChat?.title}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 800, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: 600, padding: "12px 16px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? t.accent : t.card, color: msg.role === "user" ? t.accentText : t.text, fontSize: 13, lineHeight: 1.85, whiteSpace: "pre-line", border: msg.role === "ai" ? `1px solid ${t.border}` : "none" }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "14px 24px", borderTop: `1px solid ${t.border}`, background: t.surface }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 10, background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: "10px 14px" }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="继续对话..."
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: t.text, fontFamily: "inherit" }} />
          <button onClick={sendMessage} style={{ width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer", background: input ? t.accent : t.accentSoft, color: input ? t.accentText : t.textSub, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>↑</button>
        </div>
      </div>
    </>
  );

  // ── Page: Projects ─────────────────────────────────────
  const ProjectsPage = () => (
    <>
      <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: "11px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.4 }}>项目</span>
        <button style={{ fontSize: 12, padding: "6px 16px", borderRadius: 8, border: "none", background: t.accent, color: t.accentText, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ 新建项目</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 900 }}>
          {PROJECTS.map(p => (
            <button key={p.id} style={{ textAlign: "left", padding: "20px 22px", borderRadius: 12, background: t.card, border: `1px solid ${t.border}`, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: t.text }}>{p.name}</div>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600, flexShrink: 0, marginLeft: 8, background: p.status === "active" ? t.greenBg : t.accentSoft, color: p.status === "active" ? t.green : t.textSub, border: `1px solid ${p.status === "active" ? t.greenBorder : t.border}` }}>
                  {p.status === "active" ? "进行中" : "空闲"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: t.textSub, marginBottom: 16, lineHeight: 1.6 }}>{p.desc}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: t.textSub, background: t.accentSoft, padding: "2px 9px", borderRadius: 20, border: `1px solid ${t.border}` }}>{p.tech}</span>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontSize: 11, color: t.textSub }}>{p.tasks} 个任务</span>
                  <span style={{ fontSize: 11, color: t.textSub }}>{p.updated}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  // ── Page: Settings ─────────────────────────────────────
  const SettingsPage = () => (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Settings nav */}
      <div style={{ width: 200, background: t.surface, borderRight: `1px solid ${t.border}`, padding: "20px 10px", flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: t.textMuted, padding: "0 8px 10px", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>设置</div>
        {SETTINGS_NAV.map(item => (
          <button key={item.id} onClick={() => setSettingsNav(item.id)} style={{
            width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, marginBottom: 2,
            background: settingsNav === item.id ? t.card : "none",
            border: `1px solid ${settingsNav === item.id ? t.border : "transparent"}`,
            cursor: "pointer", fontFamily: "inherit",
            color: settingsNav === item.id ? t.text : t.textSub,
            fontSize: 13, fontWeight: settingsNav === item.id ? 600 : 400,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      {/* Settings content */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 36px" }}>

        {settingsNav === "providers" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, marginBottom: 6 }}>模型供应商</div>
              <div style={{ fontSize: 13, color: t.textSub }}>接入第三方大模型，Agent 创建时从已接入的供应商中选择模型。</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {PROVIDERS.map(p => (
                <div key={p.id} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: p.connected ? 12 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: p.connected ? t.greenBg : t.accentSoft, color: p.connected ? t.green : t.textSub, border: `1px solid ${p.connected ? t.greenBorder : t.border}` }}>
                        {p.connected ? "已接入" : "未接入"}
                      </span>
                    </div>
                    <button style={{ fontSize: 12, padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, border: `1px solid ${p.connected ? t.border : t.accent}`, background: p.connected ? "none" : t.accent, color: p.connected ? t.textSub : t.accentText }}>
                      {p.connected ? "编辑" : "接入"}
                    </button>
                  </div>
                  {p.connected && (
                    <>
                      <div style={{ fontSize: 12, color: t.textSub, marginBottom: 10, fontFamily: "monospace", background: t.accentSoft, padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.border}` }}>{p.key}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {p.models.map(m => <span key={m} style={{ fontSize: 11, color: t.textSub, background: t.accentSoft, padding: "2px 9px", borderRadius: 20, border: `1px solid ${t.border}` }}>{m}</span>)}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {settingsNav === "agents" && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, marginBottom: 6 }}>Agent 管理</div>
                <div style={{ fontSize: 13, color: t.textSub }}>管理内置 Agent 和自定义 Agent，项目和任务中通过 Agent ID 引用。</div>
              </div>
              <button style={{ fontSize: 12, padding: "6px 16px", borderRadius: 8, border: "none", background: t.accent, color: t.accentText, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, flexShrink: 0 }}>+ 新建 Agent</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {AGENTS.map(agent => (
                <div key={agent.id} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <button onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)} style={{ width: "100%", textAlign: "left", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{agent.name}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: agent.type === "builtin" ? t.accentSoft : t.amberBg, color: agent.type === "builtin" ? t.textSub : t.amber, border: `1px solid ${agent.type === "builtin" ? t.border : t.amberBorder}` }}>
                        {agent.type === "builtin" ? "内置" : "自定义"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: t.textSub }}>{agent.provider} · {agent.model}</span>
                      <span style={{ fontSize: 12, color: t.textMuted }}>{expandedAgent === agent.id ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expandedAgent === agent.id && (
                    <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${t.borderSoft}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                        <div>
                          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Skills</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {agent.skills.map(s => <span key={s} style={{ fontSize: 11, color: t.textSub, background: t.accentSoft, padding: "2px 9px", borderRadius: 20, border: `1px solid ${t.border}` }}>{s}</span>)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Tools</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {agent.tools.map(tool => <span key={tool} style={{ fontSize: 11, color: t.textSub, background: t.accentSoft, padding: "2px 9px", borderRadius: 20, border: `1px solid ${t.border}` }}>{tool}</span>)}
                          </div>
                        </div>
                      </div>
                      {agent.type === "custom" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                          <button style={{ fontSize: 12, padding: "5px 14px", borderRadius: 7, border: `1px solid ${t.border}`, background: "none", color: t.textSub, cursor: "pointer", fontFamily: "inherit" }}>编辑</button>
                          <button style={{ fontSize: 12, padding: "5px 14px", borderRadius: 7, border: `1px solid ${t.redBg}`, background: t.redBg, color: t.red, cursor: "pointer", fontFamily: "inherit" }}>删除</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {settingsNav === "skills" && (
          <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, marginBottom: 6 }}>Skill 配置</div>
                <div style={{ fontSize: 13, color: t.textSub }}>管理平台内置 Skill 和团队自定义 Skill，Agent 创建时从列表中选择绑定。</div>
              </div>
              <button style={{ fontSize: 12, padding: "6px 16px", borderRadius: 8, border: "none", background: t.accent, color: t.accentText, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, flexShrink: 0 }}>+ 新建 Skill</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {SKILL_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setSkillCat(cat)} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${skillCat === cat ? t.accent : t.border}`, background: skillCat === cat ? t.accent : "none", color: skillCat === cat ? t.accentText : t.textSub, fontWeight: skillCat === cat ? 600 : 400 }}>
                  {cat}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {filteredSkills.map(skill => (
                <div key={skill.id} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{skill.name}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600, background: skill.builtin ? t.accentSoft : t.amberBg, color: skill.builtin ? t.textSub : t.amber, border: `1px solid ${skill.builtin ? t.border : t.amberBorder}` }}>{skill.builtin ? "内置" : "自定义"}</span>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: t.accentSoft, color: t.textSub, border: `1px solid ${t.border}`, fontWeight: 500 }}>{skill.category}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6, marginBottom: skill.builtin ? 0 : 10 }}>{skill.desc}</div>
                  {!skill.builtin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "none", color: t.textSub, cursor: "pointer", fontFamily: "inherit" }}>编辑</button>
                      <button style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: `1px solid ${t.redBg}`, background: t.redBg, color: t.red, cursor: "pointer", fontFamily: "inherit" }}>删除</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {settingsNav === "appearance" && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, marginBottom: 6 }}>外观</div>
            <div style={{ fontSize: 13, color: t.textSub, marginBottom: 24 }}>选择界面主题。</div>
            <div style={{ display: "flex", gap: 12 }}>
              {[{ key: true, label: "暗色", bg: "#111", card: "#1a1a1a", border: "#222", dot: "#fff" }, { key: false, label: "亮色", bg: "#f5f5f3", card: "#fff", border: "#e8e8e4", dot: "#111" }].map(theme => (
                <button key={String(theme.key)} onClick={() => setDark(theme.key)} style={{ padding: "16px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", border: `2px solid ${dark === theme.key ? t.accent : t.border}`, background: t.card, width: 140 }}>
                  <div style={{ width: "100%", height: 80, borderRadius: 8, background: theme.bg, border: `1px solid ${theme.border}`, marginBottom: 10, overflow: "hidden", position: "relative" }}>
                    <div style={{ width: 36, height: "100%", background: theme.card, borderRight: `1px solid ${theme.border}`, position: "absolute", left: 0 }} />
                    <div style={{ position: "absolute", left: 44, top: 10, width: 60, height: 6, borderRadius: 3, background: theme.dot, opacity: 0.8 }} />
                    <div style={{ position: "absolute", left: 44, top: 22, width: 45, height: 4, borderRadius: 2, background: theme.dot, opacity: 0.3 }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text, textAlign: "center" }}>{theme.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {settingsNav === "account" && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, marginBottom: 24 }}>账号</div>
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: t.accentText, fontWeight: 700 }}>张</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>张三</div>
                  <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>zhang@example.com</div>
                </div>
              </div>
              <button style={{ fontSize: 12, padding: "6px 16px", borderRadius: 8, border: `1px solid ${t.border}`, background: "none", color: t.textSub, cursor: "pointer", fontFamily: "inherit" }}>编辑资料</button>
            </div>
          </div>
        )}

        {settingsNav === "about" && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5, marginBottom: 24 }}>关于</div>
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: "24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, background: t.accent, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: t.accentText, fontSize: 14, fontWeight: 900, letterSpacing: -1 }}>co</span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>CoCode</div>
                  <div style={{ fontSize: 12, color: t.textSub }}>版本 0.1.0-alpha</div>
                </div>
              </div>
              <div style={{ height: 1, background: t.borderSoft }} />
              {[["框架", "Tauri + React"], ["数据存储", "SQLite（本地）"], ["云端同步", "暂未启用"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: t.textSub }}>{k}</span>
                  <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: t.bg, color: t.text, height: "100vh", display: "flex", overflow: "hidden", fontSize: 13 }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {page === "home" && <HomePage />}
        {page === "chat" && <ChatPage />}
        {page === "projects" && <ProjectsPage />}
        {page === "settings" && <SettingsPage />}
      </div>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { font-family: inherit; }
        button:hover { opacity: 0.78; }
        input::placeholder { color: ${t.textMuted}; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${dark ? "#2a2a2a" : "#ddd"}; border-radius: 99px; }
      `}</style>
    </div>
  );
}

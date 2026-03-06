import { useState } from "react";

const HISTORY_GROUPS = [
  {
    label: "今天",
    items: [
      { id: 1, title: "如何用 Tauri 实现文件监听" },
      { id: 2, title: "React useCallback 和 useMemo 的区别" },
      { id: 3, title: "Rust 的生命周期概念解析" },
    ]
  },
  {
    label: "昨天",
    items: [
      { id: 4, title: "TypeScript 泛型高级用法" },
      { id: 5, title: "SQLite 索引优化策略" },
    ]
  },
  {
    label: "7 天内",
    items: [
      { id: 6, title: "WebSocket 断线重连实现" },
      { id: 7, title: "CSS Grid 布局完整指南" },
    ]
  },
  {
    label: "更早",
    items: [
      { id: 8, title: "Git rebase 和 merge 的选择" },
      { id: 9, title: "Nginx 反向代理配置详解" },
    ]
  },
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

const D = {
  bg: "#0a0a0a", sidebar: "#111", surface: "#111", card: "#1a1a1a",
  border: "#222", borderSoft: "#1a1a1a", text: "#ffffff", textSub: "#888",
  textMuted: "#3a3a3a", accent: "#ffffff", accentText: "#000",
  accentSoft: "#1e1e1e", inputBg: "#0d0d0d", green: "#3dba6a",
  greenBg: "#0a1f10", greenBorder: "#153020", groupLabel: "#444",
};

const L = {
  bg: "#f5f5f3", sidebar: "#fff", surface: "#fff", card: "#f5f5f3",
  border: "#e8e8e4", borderSoft: "#efefec", text: "#111", textSub: "#777",
  textMuted: "#ccc", accent: "#111", accentText: "#fff",
  accentSoft: "#f0f0ee", inputBg: "#eeeeec", green: "#1a9445",
  greenBg: "#f0fff5", greenBorder: "#c8ecd8", groupLabel: "#bbb",
};

export default function CoCode() {
  const [dark, setDark] = useState(true);
  const [view, setView] = useState("home");
  const [activeChat, setActiveChat] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  const t = dark ? D : L;

  const startNewChat = () => {
    setView("home");
    setActiveChat(null);
    setMessages([]);
    setInput("");
  };

  const openChat = (item) => {
    setActiveChat(item);
    setMessages(MOCK_MESSAGES);
    setView("chat");
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg = { role: "user", text: input };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    setView("chat");
    if (!activeChat) setActiveChat({ id: 99, title: input });
  };

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: t.bg, color: t.text, height: "100vh", display: "flex", overflow: "hidden", fontSize: 13 }}>

      {/* ── Sidebar ── */}
      <div style={{ width: 224, background: t.sidebar, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>

        {/* Logo + theme toggle */}
        <div style={{ padding: "16px 14px", borderBottom: `1px solid ${t.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: t.accent, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: t.accentText, fontSize: 11, fontWeight: 900, letterSpacing: -1 }}>cc</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.5 }}>CoCode</span>
          </div>
          <button onClick={() => setDark(!dark)} style={{
            width: 44, height: 22, borderRadius: 99, border: `1px solid ${t.border}`,
            background: t.accentSoft, cursor: "pointer", position: "relative", padding: 0, flexShrink: 0,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%", background: t.accent,
              position: "absolute", top: 2, left: dark ? 24 : 2, transition: "left 0.2s ease",
            }} />
          </button>
        </div>

        {/* New chat button */}
        <div style={{ padding: "10px 10px 6px" }}>
          <button onClick={startNewChat} style={{
            width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.border}`,
            background: "none", color: t.textSub, fontSize: 13, cursor: "pointer",
            fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1, color: t.textSub }}>+</span>
            新建会话
          </button>
        </div>

        {/* History grouped */}
        <div style={{ flex: 1, overflow: "auto", padding: "4px 8px 8px" }}>
          {HISTORY_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 4 }}>
              {/* Group label */}
              <div style={{
                fontSize: 10, color: t.groupLabel, padding: "10px 8px 3px",
                fontWeight: 500, letterSpacing: 0.3,
              }}>
                {group.label}
              </div>

              {/* Items */}
              {group.items.map(item => (
                <button key={item.id} onClick={() => openChat(item)} style={{
                  width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 7,
                  background: activeChat?.id === item.id ? t.card : "none",
                  border: `1px solid ${activeChat?.id === item.id ? t.border : "transparent"}`,
                  cursor: "pointer", fontFamily: "inherit", marginBottom: 1,
                  borderLeft: `2px solid ${activeChat?.id === item.id ? t.accent : "transparent"}`,
                }}>
                  <div style={{
                    fontSize: 12,
                    color: activeChat?.id === item.id ? t.text : t.textSub,
                    fontWeight: activeChat?.id === item.id ? 500 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.title}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: t.borderSoft }} />

        {/* Project + Settings + User */}
        <div style={{ padding: "8px" }}>
          <button onClick={() => { setView("projects"); setActiveChat(null); }} style={{
            width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8,
            background: view === "projects" ? t.card : "none",
            border: `1px solid ${view === "projects" ? t.border : "transparent"}`,
            cursor: "pointer", fontFamily: "inherit",
            color: view === "projects" ? t.text : t.textSub,
            fontSize: 13, fontWeight: view === "projects" ? 600 : 400,
            marginBottom: 2, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>⊞</span> Project
          </button>
          <button style={{
            width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8,
            background: "none", border: "1px solid transparent", cursor: "pointer",
            fontFamily: "inherit", color: t.textSub, fontSize: 13,
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

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Home: empty state */}
        {view === "home" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px 80px" }}>
            <div style={{ marginBottom: 32, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, background: t.accent, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <span style={{ color: t.accentText, fontSize: 20, fontWeight: 900, letterSpacing: -1 }}>cc</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, marginBottom: 8 }}>有什么可以帮你的？</div>
              <div style={{ fontSize: 14, color: t.textSub }}>基于 AI 的智能对话助手</div>
            </div>

            <div style={{ width: "100%", maxWidth: 640 }}>
              <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px" }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder="输入你的问题..."
                  style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 14, color: t.text, fontFamily: "inherit" }}
                  autoFocus
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["Web 搜索", "上传文件", "Fetch URL"].map(s => (
                      <button key={s} style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 20,
                        border: `1px solid ${t.border}`, background: "none",
                        color: t.textSub, cursor: "pointer", fontFamily: "inherit",
                      }}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <button onClick={sendMessage} style={{
                    width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
                    background: input ? t.accent : t.accentSoft,
                    color: input ? t.accentText : t.textSub,
                    fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                  }}>↑</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
                {["解释这段代码", "帮我写一个 SQL 查询", "搜索最新的 AI 新闻", "生成一个 React 组件"].map(s => (
                  <button key={s} onClick={() => setInput(s)} style={{
                    fontSize: 12, padding: "6px 14px", borderRadius: 20,
                    border: `1px solid ${t.border}`, background: t.card,
                    color: t.textSub, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chat view */}
        {view === "chat" && (
          <>
            <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: "11px 24px", fontSize: 13, color: t.textSub, fontWeight: 500, letterSpacing: -0.2 }}>
              {activeChat?.title}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 800, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: 600, padding: "12px 16px",
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: msg.role === "user" ? t.accent : t.card,
                    color: msg.role === "user" ? t.accentText : t.text,
                    fontSize: 13, lineHeight: 1.85, whiteSpace: "pre-line",
                    border: msg.role === "ai" ? `1px solid ${t.border}` : "none",
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${t.border}`, background: t.surface }}>
              <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 10, background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: "10px 14px" }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder="继续对话..."
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 13, color: t.text, fontFamily: "inherit" }}
                />
                <button onClick={sendMessage} style={{
                  width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                  background: input ? t.accent : t.accentSoft,
                  color: input ? t.accentText : t.textSub,
                  fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s",
                }}>↑</button>
              </div>
            </div>
          </>
        )}

        {/* Project list */}
        {view === "projects" && (
          <>
            <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, padding: "11px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.4 }}>项目</span>
              <button style={{
                fontSize: 12, padding: "6px 16px", borderRadius: 8, border: "none",
                background: t.accent, color: t.accentText, cursor: "pointer",
                fontFamily: "inherit", fontWeight: 600,
              }}>
                + 新建项目
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 900 }}>
                {PROJECTS.map(p => (
                  <button key={p.id} style={{
                    textAlign: "left", padding: "20px 22px", borderRadius: 12,
                    background: t.card, border: `1px solid ${t.border}`,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: t.text }}>{p.name}</div>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600, flexShrink: 0, marginLeft: 8,
                        background: p.status === "active" ? t.greenBg : t.accentSoft,
                        color: p.status === "active" ? t.green : t.textSub,
                        border: `1px solid ${p.status === "active" ? t.greenBorder : t.border}`,
                      }}>
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
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { font-family: inherit; }
        button:hover { opacity: 0.75; }
        input::placeholder { color: ${t.textMuted}; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${dark ? "#2a2a2a" : "#ddd"}; border-radius: 99px; }
      `}</style>
    </div>
  );
}

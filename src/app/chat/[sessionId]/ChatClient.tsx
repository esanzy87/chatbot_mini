"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./chat.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  nextAction?: string;
  sources?: Array<{ title: string; url: string; source: string }>;
};

type ReasoningTraceItem = {
  turnId: string;
  nextAction: string;
  reasonSummary: string;
  allowedTools: string[];
  toolExecutions: Array<{ toolCallId: string; toolName: string; ok: boolean; latencyMs: number }>;
  createdAt: string;
};

type SessionResponse = {
  sessionId: string;
  masterContext: string;
  masterContextSummary: string;
  createdAt: string;
};

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.replace("event: ", "");
  const dataLine = lines.find((line) => line.startsWith("data: "))?.replace("data: ", "");

  if (!event || !dataLine) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLine)
    };
  } catch {
    return null;
  }
}

export default function ChatClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [needsSources, setNeedsSources] = useState(false);
  const [debug, setDebug] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [traceItems, setTraceItems] = useState<ReasoningTraceItem[]>([]);
  const [toolEvents, setToolEvents] = useState<Array<Record<string, unknown>>>([]);
  const [toolStatus, setToolStatus] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");
  const mismatchLoggedRef = useRef(false);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      setErrorText("세션 정보를 불러오지 못했습니다.");
      return;
    }
    const data = (await res.json()) as SessionResponse;
    setSession(data);
  }, [sessionId]);

  const loadTraces = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/reasoning-traces?limit=20`);
    if (!res.ok) {
      return;
    }

    const data = (await res.json()) as {
      items: ReasoningTraceItem[];
    };
    setTraceItems(data.items);
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
    void loadTraces();
  }, [loadSession, loadTraces]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    setLoading(true);
    setErrorText("");
    setToolStatus("");
    setToolEvents([]);

    const draftId = `assistant-${Date.now()}`;
    let tokenBuffer = "";
    mismatchLoggedRef.current = false;

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text
      },
      {
        id: draftId,
        role: "assistant",
        text: ""
      }
    ]);

    setInput("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId,
        message: text,
        clientOptions: {
          needsSources,
          debug
        }
      })
    });

    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErrorText(body?.error?.message ?? "채팅 요청에 실패했습니다.");
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes("\n\n")) {
          const index = buffer.indexOf("\n\n");
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);

          const event = parseSseBlock(block);
          if (!event) {
            continue;
          }

          if (event.event === "token") {
            const payload = event.data as { delta?: string };
            tokenBuffer += payload.delta ?? "";

            setMessages((prev) =>
              prev.map((msg) => (msg.id === draftId ? { ...msg, text: tokenBuffer } : msg))
            );
          }

          if (event.event === "tool") {
            const payload = event.data as {
              phase?: string;
              toolName?: string;
              errorCode?: string;
            };
            setToolEvents((prev) => [...prev, event.data as Record<string, unknown>]);
            if (payload.phase === "start") {
              setToolStatus("자료 조회 중...");
            }
            if (payload.phase === "success") {
              setToolStatus("");
            }
            if (payload.phase === "error") {
              setToolStatus(`도구 실패: ${payload.errorCode ?? "UNKNOWN"}`);
            }
          }

          if (event.event === "message") {
            const payload = event.data as {
              text: string;
              nextAction: string;
              sources?: Array<{ title: string; url: string; source: string }>;
            };

            if (!mismatchLoggedRef.current && tokenBuffer && tokenBuffer !== payload.text) {
              console.warn("token buffer and final message mismatch; message.text wins");
              mismatchLoggedRef.current = true;
            }

            tokenBuffer = payload.text;

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === draftId
                  ? {
                      ...msg,
                      text: payload.text,
                      nextAction: payload.nextAction,
                      ...(payload.sources ? { sources: payload.sources } : {})
                    }
                  : msg
              )
            );
          }

          if (event.event === "error") {
            const payload = event.data as { message?: string };
            setErrorText(payload.message ?? "오류가 발생했습니다.");
          }

          if (event.event === "done") {
            setToolStatus("");
          }
        }
      }
    } finally {
      setLoading(false);
      void loadTraces();
    }
  }, [debug, input, loadTraces, loading, needsSources, sessionId]);

  const tracePreview = useMemo(() => traceItems.slice(0, 20), [traceItems]);

  return (
    <main className="chat-page">
      <header className="chat-header">
        <div>
          <h1>학습 코치 챗봇</h1>
          <p className="session-id">세션: {sessionId}</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setShowContext((v) => !v)}>
            MasterContext 요약 보기
          </button>
          <button type="button" onClick={() => setShowTrace((v) => !v)}>
            사고 과정 보기
          </button>
        </div>
      </header>

      {showContext && session ? (
        <section className="context-box">
          <h2>MasterContext</h2>
          <p>{session.masterContextSummary}</p>
          <details>
            <summary>원문 보기</summary>
            <p>{session.masterContext}</p>
          </details>
        </section>
      ) : null}

      <section className="chat-layout">
        <div className="chat-main">
          <div className="messages">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <strong>{message.role === "user" ? "사용자" : "코치"}</strong>
                <p>{message.text}</p>
                {message.sources && message.sources.length > 0 ? (
                  <ul className="sources">
                    {message.sources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                        <span>{source.source}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>

          <div className="status-row">
            {loading ? <span>생성 중...</span> : null}
            {toolStatus ? <span>{toolStatus}</span> : null}
            {errorText ? <span className="error-text">{errorText}</span> : null}
          </div>

          <div className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="질문을 입력하세요"
              rows={4}
            />
            <div className="composer-actions">
              <label>
                <input
                  type="checkbox"
                  checked={needsSources}
                  onChange={(event) => setNeedsSources(event.target.checked)}
                />
                근거 필요
              </label>
              <label>
                <input type="checkbox" checked={debug} onChange={(event) => setDebug(event.target.checked)} />
                디버그
              </label>
              <button type="button" onClick={() => void sendMessage()} disabled={loading || input.trim().length === 0}>
                전송
              </button>
            </div>
          </div>
        </div>

        {showTrace ? (
          <aside className="trace-panel">
            <h2>사고 과정 보기</h2>
            {tracePreview.length === 0 ? <p>표시할 트레이스가 없습니다.</p> : null}
            {tracePreview.map((trace) => (
              <article key={trace.turnId} className="trace-item">
                <h3>{trace.nextAction}</h3>
                <p className="trace-summary">{trace.reasonSummary.slice(0, 200)}</p>
                <p className="trace-tools">허용 도구: {trace.allowedTools.join(", ") || "없음"}</p>
                <ul>
                  {trace.toolExecutions.map((tool) => (
                    <li key={tool.toolCallId}>
                      {tool.toolName} / {tool.ok ? "성공" : "실패"} / {tool.latencyMs}ms
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            {debug && toolEvents.length > 0 ? (
              <article className="trace-item">
                <h3>디버그: tool 이벤트</h3>
                <pre>{JSON.stringify(toolEvents, null, 2)}</pre>
              </article>
            ) : null}
          </aside>
        ) : null}
      </section>
    </main>
  );
}

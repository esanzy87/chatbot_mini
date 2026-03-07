"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./home.css";

type CreateSessionResponse = {
  sessionId: string;
};

const DEFAULT_MASTER_CONTEXT =
  "이 세션은 학습 코치 챗봇 데모용입니다. 사용자의 질문 의도를 파악하고 필요한 경우 도구를 사용해 한국어로 답변합니다.";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const createDemoSession = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    setErrorText("");

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          masterContext: DEFAULT_MASTER_CONTEXT
        })
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | {
              error?: { message?: string };
            }
          | null;
        setErrorText(body?.error?.message ?? "데모 세션 생성에 실패했습니다.");
        return;
      }

      const body = (await res.json()) as CreateSessionResponse;
      router.push(`/chat/${body.sessionId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="landing-page">
      <section className="landing-shell">
        <header className="landing-hero">
          <p className="landing-kicker">다음 행동 오케스트레이션</p>
          <h1>학습 코치 챗봇</h1>
          <p className="landing-subtitle">
            LangGraph 기반 오케스트레이션과 도구 실행 흐름을 데모 채팅으로 바로 확인할 수 있습니다.
          </p>
        </header>

        <section className="landing-grid">
          <article className="landing-panel landing-panel-main">
            <h2>데모 채팅 시작</h2>
            <p>버튼을 누르면 유효한 세션을 생성하고 채팅 페이지로 이동합니다.</p>
            <button
              type="button"
              className="landing-cta"
              onClick={() => void createDemoSession()}
              disabled={loading}
            >
              {loading ? (
                <>
                  데모 세션 생성 중...
                  <span className="landing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </>
              ) : (
                "데모 채팅 시작"
              )}
            </button>
            {errorText ? <p className="landing-error">{errorText}</p> : null}
          </article>

          <aside className="landing-panel">
            <h2>이 화면에서 확인할 내용</h2>
            <ul className="landing-list">
              <li>
                세션 생성 후 <code>/chat/sess_...</code> 경로로 자동 이동
              </li>
              <li>SSE 기반 스트리밍 응답 UI</li>
              <li>도구 실행 상태와 사고 과정 보기 토글</li>
            </ul>
          </aside>
        </section>
      </section>
    </main>
  );
}

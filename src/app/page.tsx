"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <main style={{ padding: 24 }}>
      <h1>chatbot_mini</h1>
      <p>버튼을 누르면 유효한 데모 세션을 만들고 채팅 페이지로 이동합니다.</p>
      <button type="button" onClick={() => void createDemoSession()} disabled={loading}>
        {loading ? "데모 세션 생성 중..." : "데모 채팅 시작"}
      </button>
      {errorText ? <p style={{ color: "#b91c1c", marginTop: 12 }}>{errorText}</p> : null}
    </main>
  );
}

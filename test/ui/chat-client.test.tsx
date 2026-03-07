import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatClient from "@/app/chat/[sessionId]/ChatClient";

const SESSION_ID = "sess_01HW8K4X4X5N9F3D1E7Q2R6M8P";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function sseBlock(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseResponse(blocks: string[], status = 200): Response {
  return new Response(blocks.join(""), {
    status,
    headers: {
      "content-type": "text/event-stream"
    }
  });
}

function delayedSseResponse(chunks: Array<{ delayMs: number; text: string }>, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let index = 0;
      const enqueueNext = () => {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        const chunk = chunks[index]!;
        index += 1;
        setTimeout(() => {
          controller.enqueue(encoder.encode(chunk.text));
          enqueueNext();
        }, chunk.delayMs);
      };
      enqueueNext();
    }
  });

  return new Response(stream, {
    status,
    headers: {
      "content-type": "text/event-stream"
    }
  });
}

type FetchMockOptions = {
  traces?: unknown[];
  chatResponses?: Array<() => Response>;
  onChatRequest?: (body: Record<string, unknown>) => void;
};

function installFetchMock(options: FetchMockOptions = {}): ReturnType<typeof vi.fn> {
  const traceItems = options.traces ?? [];
  const chatFactories = [...(options.chatResponses ?? [])];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes(`/api/sessions/${SESSION_ID}/reasoning-traces`)) {
      return jsonResponse({ nextCursor: null, items: traceItems });
    }

    if (url.includes(`/api/sessions/${SESSION_ID}`) && !url.includes("reasoning-traces")) {
      return jsonResponse({
        sessionId: SESSION_ID,
        masterContext: "과정 중심 학습",
        masterContextSummary: "과정 중심 학습 요약",
        createdAt: "2026-03-07T10:00:00.000Z"
      });
    }

    if (url === "/api/chat") {
      if (init?.body && options.onChatRequest) {
        options.onChatRequest(JSON.parse(init.body.toString()) as Record<string, unknown>);
      }
      const factory = chatFactories.shift();
      if (!factory) {
        throw new Error("chat response not configured");
      }
      return factory();
    }

    throw new Error(`unexpected fetch url: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UI /chat/[sessionId]", () => {
  it("renders core chat layout", async () => {
    installFetchMock();
    render(<ChatClient sessionId={SESSION_ID} />);

    expect(await screen.findByText("학습 코치 챗봇")).toBeInTheDocument();
    expect(screen.getByText(`세션: ${SESSION_ID}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MasterContext 요약 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사고 과정 보기" })).toBeInTheDocument();
    expect(screen.getByLabelText("근거 필요")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("질문을 입력하세요")).toBeInTheDocument();
  });

  it("replaces token buffer with message.text on message event", async () => {
    installFetchMock({
      chatResponses: [
        () =>
          sseResponse([
            sseBlock("token", { turnId: "turn_01", delta: "최" }),
            sseBlock("token", { turnId: "turn_01", delta: "종 응답" }),
            sseBlock("message", {
              turnId: "turn_01",
              text: "최종 응답",
              nextAction: "DIRECT_ANSWER"
            }),
            sseBlock("done", { turnId: "turn_01", ok: true, latencyMs: 12 })
          ])
      ]
    });

    render(<ChatClient sessionId={SESSION_ID} />);
    const input = await screen.findByPlaceholderText("질문을 입력하세요");
    fireEvent.change(input, { target: { value: "설명해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    expect(await screen.findByText("최종 응답")).toBeInTheDocument();
  });

  it("logs mismatch warning once when token and final message differ", async () => {
    installFetchMock({
      chatResponses: [
        () =>
          sseResponse([
            sseBlock("token", { turnId: "turn_01", delta: "임시 토큰" }),
            sseBlock("message", {
              turnId: "turn_01",
              text: "최종 텍스트",
              nextAction: "DIRECT_ANSWER"
            }),
            sseBlock("done", { turnId: "turn_01", ok: true, latencyMs: 10 })
          ])
      ]
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<ChatClient sessionId={SESSION_ID} />);
    const input = await screen.findByPlaceholderText("질문을 입력하세요");
    fireEvent.change(input, { target: { value: "질문" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    await screen.findByText("최종 텍스트");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("sends needsSources=true when checkbox is checked", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    installFetchMock({
      onChatRequest: (body) => {
        capturedBody = body;
      },
      chatResponses: [
        () =>
          sseResponse([
            sseBlock("message", {
              turnId: "turn_01",
              text: "완료",
              nextAction: "DIRECT_ANSWER"
            }),
            sseBlock("done", { turnId: "turn_01", ok: true, latencyMs: 9 })
          ])
      ]
    });

    render(<ChatClient sessionId={SESSION_ID} />);
    const input = await screen.findByPlaceholderText("질문을 입력하세요");
    fireEvent.click(screen.getByLabelText("근거 필요"));
    fireEvent.change(input, { target: { value: "출처 포함 답변" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    await screen.findByText("완료");
    const options = (capturedBody as { clientOptions?: { needsSources?: boolean } } | null)?.clientOptions;
    expect(options?.needsSources).toBe(true);
  });

  it("toggles reasoning trace panel and renders items", async () => {
    installFetchMock({
      traces: [
        {
          turnId: "turn_01",
          nextAction: "CALL_TOOL",
          reasonSummary: "출처가 필요한 요청이라 검색 도구를 사용함",
          allowedTools: ["search"],
          toolExecutions: [{ toolCallId: "tool_01", toolName: "search", ok: true, latencyMs: 10 }],
          createdAt: "2026-03-07T10:00:00.000Z"
        }
      ]
    });

    render(<ChatClient sessionId={SESSION_ID} />);
    expect(screen.queryByText("CALL_TOOL")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "사고 과정 보기" }));

    expect(await screen.findByText("CALL_TOOL")).toBeInTheDocument();
    expect(screen.getByText("허용 도구: search")).toBeInTheDocument();
  });

  it("shows debug detail panel only when debug mode is enabled", async () => {
    installFetchMock({
      chatResponses: [
        () =>
          sseResponse([
            sseBlock("tool", {
              turnId: "turn_01",
              toolCallId: "tool_01",
              phase: "start",
              toolName: "search"
            }),
            sseBlock("tool", {
              turnId: "turn_01",
              toolCallId: "tool_01",
              phase: "success",
              toolName: "search",
              latencyMs: 10
            }),
            sseBlock("message", {
              turnId: "turn_01",
              text: "응답1",
              nextAction: "CALL_TOOL"
            }),
            sseBlock("done", { turnId: "turn_01", ok: true, latencyMs: 20 })
          ]),
        () =>
          sseResponse([
            sseBlock("tool", {
              turnId: "turn_02",
              toolCallId: "tool_02",
              phase: "start",
              toolName: "search",
              args: { query: "q", topK: 5 }
            }),
            sseBlock("tool", {
              turnId: "turn_02",
              toolCallId: "tool_02",
              phase: "success",
              toolName: "search",
              latencyMs: 9
            }),
            sseBlock("message", {
              turnId: "turn_02",
              text: "응답2",
              nextAction: "CALL_TOOL"
            }),
            sseBlock("done", { turnId: "turn_02", ok: true, latencyMs: 19 })
          ])
      ]
    });

    render(<ChatClient sessionId={SESSION_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "사고 과정 보기" }));

    const input = await screen.findByPlaceholderText("질문을 입력하세요");
    fireEvent.change(input, { target: { value: "첫 번째" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));
    await screen.findByText("응답1");
    expect(screen.queryByText("디버그: tool 이벤트")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("디버그"));
    fireEvent.change(input, { target: { value: "두 번째" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));
    await screen.findByText("응답2");
    expect(screen.getByText("디버그: tool 이벤트")).toBeInTheDocument();
  });

  it("shows and clears streaming/tool status messages", async () => {
    installFetchMock({
      chatResponses: [
        () =>
          delayedSseResponse([
            {
              delayMs: 0,
              text: sseBlock("tool", {
                turnId: "turn_01",
                toolCallId: "tool_01",
                phase: "start",
                toolName: "search"
              })
            },
            {
              delayMs: 60,
              text:
                sseBlock("tool", {
                  turnId: "turn_01",
                  toolCallId: "tool_01",
                  phase: "success",
                  toolName: "search",
                  latencyMs: 10
                }) +
                sseBlock("message", {
                  turnId: "turn_01",
                  text: "완료",
                  nextAction: "CALL_TOOL"
                }) +
                sseBlock("done", { turnId: "turn_01", ok: true, latencyMs: 70 })
            }
          ])
      ]
    });

    render(<ChatClient sessionId={SESSION_ID} />);
    const input = await screen.findByPlaceholderText("질문을 입력하세요");
    fireEvent.change(input, { target: { value: "검색해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "전송" }));

    expect(await screen.findByText("생성 중...")).toBeInTheDocument();
    expect(await screen.findByText("자료 조회 중...")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("자료 조회 중...")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("생성 중...")).not.toBeInTheDocument());
  });

  it("recovers UI after done(ok=false) and allows next input", async () => {
    installFetchMock({
      chatResponses: [
        () =>
          sseResponse([
            sseBlock("error", {
              turnId: "turn_01",
              code: "INTERNAL_SERVER_ERROR",
              message: "요청 처리 중 오류가 발생했습니다."
            }),
            sseBlock("done", {
              turnId: "turn_01",
              ok: false,
              errorCode: "INTERNAL_SERVER_ERROR",
              latencyMs: 20
            })
          ])
      ]
    });

    render(<ChatClient sessionId={SESSION_ID} />);
    const input = await screen.findByPlaceholderText("질문을 입력하세요");
    const sendButton = screen.getByRole("button", { name: "전송" });

    fireEvent.change(input, { target: { value: "질문1" } });
    fireEvent.click(sendButton);

    expect(await screen.findByText("요청 처리 중 오류가 발생했습니다.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "다시 질문" } });
    await waitFor(() => expect(sendButton).toBeEnabled());
  });
});

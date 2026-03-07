import ChatClient from "./ChatClient";

export default async function ChatPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ChatClient sessionId={sessionId} />;
}

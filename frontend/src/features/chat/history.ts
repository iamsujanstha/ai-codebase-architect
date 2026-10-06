import type { ChatMessage } from "@/core/types/chat";

/** Keep recent context within the shared API limits; stored history stays intact. */
export function buildRequestHistory(messages: ChatMessage[]) {
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let remainingCharacters = 32_000;
  for (const message of [...messages].reverse()) {
    if (
      message.role === "system" ||
      message.status !== "complete" ||
      !message.content.trim()
    )
      continue;
    const content = message.content.slice(-8_000);
    if (history.length === 40 || content.length > remainingCharacters) break;
    history.unshift({ role: message.role, content });
    remainingCharacters -= content.length;
  }
  return history;
}

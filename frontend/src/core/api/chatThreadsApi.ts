import type { ChatThread } from '@/core/types/chat';

/**
 * chatThreadsApi — persists chat threads for authenticated users.
 *
 * All requests include the JWT from localStorage so the backend can
 * associate threads with the correct user account.
 */

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Fetch all threads for the logged-in user. */
export async function fetchMyThreads(): Promise<ChatThread[]> {
  const res = await fetch('/ai/threads', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load chat history.');
  return res.json() as Promise<ChatThread[]>;
}

/** Create or replace a thread on the server. */
export async function saveThread(thread: ChatThread): Promise<void> {
  const res = await fetch(`/ai/threads/${encodeURIComponent(thread.id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      id: thread.id,
      title: thread.title,
      messages: thread.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status === 'streaming' ? 'complete' : m.status,
        createdAt: m.createdAt,
        requestId: m.requestId ?? null,
        provider: m.provider ?? null,
        model: m.model ?? null,
      })),
      lastMessageAt: thread.lastMessageAt,
      model: thread.model ?? null,
    }),
  });
  if (!res.ok) throw new Error('Failed to save thread.');
}

/** Delete a thread from the server. */
export async function deleteThreadFromServer(threadId: string): Promise<void> {
  const res = await fetch(`/ai/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 404) throw new Error('Failed to delete thread.');
}

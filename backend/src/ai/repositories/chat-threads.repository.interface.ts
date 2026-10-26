export interface ChatMessageRecord {
  id: number;
  thread_id: number;
  role: string;
  content: string;
  timestamp: Date;
}

export interface ChatThreadRecord {
  id: number;
  user_id: number;
  client_thread_id?: string | null;
  title: string;
  model?: string | null;
  created_at: Date;
  updated_at: Date;
  chat_messages?: ChatMessageRecord[];
}

export interface SaveChatMessageData {
  role?: string;
  content?: string;
  createdAt?: string | Date;
}

export interface IChatThreadsRepository {
  findByUserId(userId: number): Promise<ChatThreadRecord[]>;
  upsertThreadWithMessages(
    userId: number,
    clientThreadId: string,
    title: string,
    model?: string | null,
    messages?: SaveChatMessageData[],
  ): Promise<ChatThreadRecord>;
  deleteByClientThreadId(userId: number, clientThreadId: string): Promise<void>;
}

export const CHAT_THREADS_REPOSITORY_TOKEN = Symbol('IChatThreadsRepository');

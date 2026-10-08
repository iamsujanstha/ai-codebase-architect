import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import mongoose from 'mongoose';

// ─── sub-documents ────────────────────────────────────────────────────────────

@Schema({ _id: false })
export class ChatMessageDoc {
  @Prop({ required: true }) id!: string;
  @Prop({ required: true, enum: ['user', 'assistant', 'system'] }) role!: string;
  @Prop({ required: true, default: '' }) content!: string;
  @Prop({ required: true, enum: ['complete', 'streaming', 'error'], default: 'complete' }) status!: string;
  @Prop({ required: true }) createdAt!: string;
  @Prop({ type: String, default: null }) requestId!: string | null;
  @Prop({ type: String, default: null }) provider!: string | null;
  @Prop({ type: String, default: null }) model!: string | null;
}

// ─── thread document ──────────────────────────────────────────────────────────

@Schema({ collection: 'chat_threads', timestamps: true })
export class ChatThread {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: mongoose.Types.ObjectId;

  /** The UUID generated on the client — used as the stable external identifier. */
  @Prop({ required: true, trim: true, index: true })
  clientThreadId!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: [ChatMessageDoc], default: [] })
  messages!: ChatMessageDoc[];

  @Prop({ required: true })
  lastMessageAt!: string;

  @Prop({ type: String, default: null })
  model!: string | null;
}

export type ChatThreadDocument = HydratedDocument<ChatThread>;
export const ChatThreadSchema = SchemaFactory.createForClass(ChatThread);

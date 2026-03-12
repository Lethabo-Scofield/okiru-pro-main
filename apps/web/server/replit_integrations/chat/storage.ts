import {
  ConversationModel,
  MessageModel,
  getNextSequence,
  type Conversation,
  type Message,
} from "../../../shared/schema";

export interface IChatStorage {
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

function toConversation(doc: any): Conversation | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return {
    id: obj.seqId || obj.id || obj._id,
    title: obj.title,
    createdAt: obj.createdAt,
  };
}

function toMessage(doc: any): Message | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return {
    id: obj.seqId || obj.id || obj._id,
    conversationId: obj.conversationId,
    role: obj.role,
    content: obj.content,
    createdAt: obj.createdAt,
  };
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const doc = await ConversationModel.findOne({ seqId: id });
    return toConversation(doc) as Conversation | undefined;
  },

  async getAllConversations() {
    const docs = await ConversationModel.find().sort({ createdAt: -1 });
    return docs.map((d) => toConversation(d)!);
  },

  async createConversation(title: string) {
    const seqId = await getNextSequence("conversation");
    const doc = await ConversationModel.create({ seqId, title });
    return toConversation(doc)!;
  },

  async deleteConversation(id: number) {
    await MessageModel.deleteMany({ conversationId: id });
    await ConversationModel.deleteOne({ seqId: id });
  },

  async getMessagesByConversation(conversationId: number) {
    const docs = await MessageModel.find({ conversationId }).sort({ createdAt: 1 });
    return docs.map((d) => toMessage(d)!);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const seqId = await getNextSequence("message");
    const doc = await MessageModel.create({ seqId, conversationId, role, content });
    return toMessage(doc)!;
  },
};

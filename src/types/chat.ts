// Chat message types and normalizer
export type Role = 'user' | 'merchant' | 'mentor' | 'admin' | 'system';
export type MessageType = 'join' | 'leave' | 'message' | 'command' | 'me' | 'room_info' | 'report' | 'ban' | 'kick' | 'lock' | 'support' | 'gift' | 'error' | 'system';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  roomId: string;
  role?: Role;
  level?: number;
  type?: MessageType;
}

// Normalizer to ensure incoming data matches our Message interface
export function normalizeIncomingMessage(payload: any): Message {
  // Convert timestamp if it's a string
  let timestamp = payload.timestamp;
  if (typeof timestamp === 'string') {
    timestamp = new Date(timestamp);
  } else if (!(timestamp instanceof Date)) {
    timestamp = new Date();
  }

  // Clamp role to safe values
  const validRoles: Role[] = ['user', 'merchant', 'mentor', 'admin', 'system'];
  const role: Role = validRoles.includes(payload.role) ? payload.role : 'system';

  // Clamp type to safe values
  const validTypes: MessageType[] = ['join', 'leave', 'message', 'command', 'me', 'room_info', 'report', 'ban', 'kick', 'lock', 'support', 'gift', 'error', 'system'];
  const type: MessageType = validTypes.includes(payload.type) ? payload.type : 'message';

  return {
    id: payload.id || `msg_${Date.now()}_${Math.random()}`,
    sender: payload.sender || 'Unknown',
    content: payload.content || '',
    timestamp,
    roomId: payload.roomId || '',
    role,
    level: typeof payload.level === 'number' ? payload.level : 1,
    type
  };
}
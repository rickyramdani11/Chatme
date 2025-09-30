import OpenAI from 'openai';

/**
 * ChatMe Bot - AI Integration via OpenRouter
 * 
 * This bot responds to messages in rooms when mentioned or directly messaged.
 * The bot appears as user 'chatme_bot' with special styling.
 * 
 * Styling:
 * - Bot identity (username): Green color
 * - Bot messages: Blue color
 */

// Pre-check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('⚠️ OPENAI_API_KEY not found! Bot will return error messages.');
}

// Using Google Gemini 2.5 Flash Lite Preview model via OpenRouter API
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

export const BOT_USERNAME = 'chatme_bot';
export const BOT_USER_ID = 43; // Database ID for chatme_bot

// Rate limiting: Track last response time per room
const lastResponseTime = new Map(); // roomId -> timestamp
const COOLDOWN_MS = 5000; // 5 seconds cooldown between responses

/**
 * Check if bot is member of a room
 * @param {string} roomId - The room ID
 * @param {Object} pool - Database connection pool
 * @returns {Promise<boolean>} - True if bot is member
 */
async function isBotInRoom(roomId, pool) {
  try {
    const result = await pool.query(`
      SELECT 1 FROM bot_room_members 
      WHERE room_id = $1 AND bot_user_id = $2 AND is_active = true
    `, [roomId, BOT_USER_ID]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking bot membership:', error);
    return false;
  }
}

/**
 * Check if a message is directed to the bot
 * @param {string} message - The message content
 * @param {string} roomId - The room ID
 * @param {string} sender - The sender username
 * @param {Object} pool - Database connection pool (optional, for room membership check)
 * @returns {Promise<boolean>} - True if message is for the bot
 */
async function shouldBotRespond(message, roomId, sender, pool = null) {
  // Never respond to own messages (prevent loop)
  if (sender === BOT_USERNAME) {
    return false;
  }
  
  const isPrivateMessage = roomId.startsWith('private_');
  
  // In private chat, check if bot is part of the room ID
  if (isPrivateMessage) {
    // Only respond if chatme_bot is actually in the private chat
    // Room format: private_userId1_userId2
    // Bot user ID is 43
    return roomId.includes('_43_') || roomId.endsWith('_43');
  }
  
  // In public rooms, bot responds only if it's been added to the room
  if (pool) {
    const isMember = await isBotInRoom(roomId, pool);
    return isMember; // Bot responds to ALL messages if it's in the room
  }
  
  return false; // Default: don't respond if no pool provided
}

/**
 * Generate AI response using Google Gemini 2.5 Flash Lite Preview
 * @param {string} userMessage - The user's message
 * @param {string} username - The username who sent the message
 * @param {Array} conversationHistory - Previous messages for context (optional)
 * @returns {Promise<string>} - AI generated response
 */
async function generateBotResponse(userMessage, username, conversationHistory = []) {
  try {
    // Build conversation context
    const messages = [
      {
        role: "system",
        content: `You are ChatMe Bot, a helpful and friendly AI assistant in the ChatMe social chat application. 
        
Your personality:
- Friendly, warm, and conversational
- Use emojis occasionally to be expressive
- Keep responses concise (1-3 sentences usually)
- Be helpful and informative
- If asked about ChatMe features, explain that it's a social chat app with rooms, private messaging, credits system, gaming, and more

Current user: ${username}

Respond naturally and helpfully to user messages.`
      }
    ];

    // Add conversation history if provided (for context)
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.slice(-5).forEach(msg => { // Last 5 messages for context
        messages.push({
          role: msg.sender === BOT_USERNAME ? "assistant" : "user",
          content: msg.content
        });
      });
    }

    // Add current message
    messages.push({
      role: "user",
      content: userMessage
    });

    // Call OpenRouter API with Google Gemini 2.5 Flash Lite Preview model
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const response = await openai.chat.completions.create({
        model: "google/gemini-2.5-flash-lite-preview-09-2025",
        messages: messages,
        max_tokens: 500, // Keep responses concise (corrected from max_completion_tokens)
      }, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    console.error('❌ ChatMe Bot - OpenAI API Error:', error.message);
    
    // Fallback responses if API fails
    if (error.message.includes('API key')) {
      return '🔑 Oops! My AI brain needs configuration. Please check the API key.';
    } else if (error.message.includes('rate limit')) {
      return '⏳ I\'m a bit overwhelmed right now! Please try again in a moment.';
    } else {
      return '😅 Sorry, I encountered an error. Please try asking me again!';
    }
  }
}

/**
 * Process bot message and generate response
 * @param {Object} params - Parameters
 * @param {string} params.message - The message content
 * @param {string} params.roomId - The room ID
 * @param {string} params.username - Username who sent the message
 * @param {Array} params.conversationHistory - Previous messages (optional)
 * @param {Object} params.pool - Database connection pool (optional)
 * @returns {Promise<Object|null>} - Bot response object or null
 */
async function processBotMessage({ message, roomId, username, conversationHistory, pool }) {
  // Check if bot should respond
  const shouldRespond = await shouldBotRespond(message, roomId, username, pool);
  if (!shouldRespond) {
    return null;
  }

  // Rate limiting: Check cooldown
  const now = Date.now();
  const lastResponse = lastResponseTime.get(roomId) || 0;
  const timeSinceLastResponse = now - lastResponse;
  
  if (timeSinceLastResponse < COOLDOWN_MS) {
    console.log(`🤖 ChatMe Bot: Rate limited in ${roomId} (${timeSinceLastResponse}ms since last response)`);
    return null; // Silent cooldown - don't spam
  }

  console.log(`🤖 ChatMe Bot: Processing message from ${username} in ${roomId}`);
  
  // Remove @chatme_bot mention from message for cleaner context
  const cleanMessage = message.replace(/@chatme_bot/gi, '').trim();
  
  // Ignore empty messages after stripping mention
  if (!cleanMessage) {
    return null;
  }
  
  // Update last response time
  lastResponseTime.set(roomId, now);
  
  // Generate AI response
  const botResponse = await generateBotResponse(cleanMessage, username, conversationHistory);
  
  console.log(`🤖 ChatMe Bot: Generated response: "${botResponse}"`);

  return {
    sender: BOT_USERNAME,
    senderId: BOT_USER_ID,
    content: botResponse,
    timestamp: new Date(),
    isBot: true
  };
}

/**
 * Get bot user info
 * @returns {Object} - Bot user information
 */
export function getBotInfo() {
  return {
    id: BOT_USER_ID,
    username: BOT_USERNAME,
    isBot: true,
    bio: '🤖 I am ChatMe AI Bot, powered by Google Gemini 2.5 Flash Lite Preview. Ask me anything!',
    avatar: null // Can be set to a bot avatar path
  };
}

// Named exports for ESM compatibility
export { shouldBotRespond, generateBotResponse, processBotMessage, isBotInRoom };

const OpenAI = require('openai');

/**
 * ChatMe Bot - OpenAI Integration
 * 
 * This bot responds to messages in rooms when mentioned or directly messaged.
 * The bot appears as user 'chatme_bot' with special styling.
 * 
 * Styling:
 * - Bot identity (username): Green color
 * - Bot messages: Blue color
 */

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

const BOT_USERNAME = 'chatme_bot';
const BOT_USER_ID = 43; // Database ID for chatme_bot

/**
 * Check if a message is directed to the bot
 * @param {string} message - The message content
 * @param {string} roomId - The room ID
 * @returns {boolean} - True if message is for the bot
 */
function shouldBotRespond(message, roomId) {
  // Bot responds to mentions (@chatme_bot) or direct messages
  const mentionsBot = message.toLowerCase().includes('@chatme_bot');
  const isPrivateMessage = roomId.startsWith('private_');
  
  return mentionsBot || isPrivateMessage;
}

/**
 * Generate AI response using OpenAI GPT-5
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

    // Call OpenAI API - the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: messages,
      max_completion_tokens: 500, // Keep responses concise
    });

    return response.choices[0].message.content;
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
 * @returns {Promise<Object|null>} - Bot response object or null
 */
async function processBotMessage({ message, roomId, username, conversationHistory }) {
  // Check if bot should respond
  if (!shouldBotRespond(message, roomId)) {
    return null;
  }

  console.log(`🤖 ChatMe Bot: Processing message from ${username} in ${roomId}`);
  
  // Remove @chatme_bot mention from message for cleaner context
  const cleanMessage = message.replace(/@chatme_bot/gi, '').trim();
  
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
function getBotInfo() {
  return {
    id: BOT_USER_ID,
    username: BOT_USERNAME,
    isBot: true,
    bio: '🤖 I am ChatMe AI Bot, powered by OpenAI GPT-5. Ask me anything!',
    avatar: null // Can be set to a bot avatar path
  };
}

module.exports = {
  BOT_USERNAME,
  BOT_USER_ID,
  shouldBotRespond,
  generateBotResponse,
  processBotMessage,
  getBotInfo
};

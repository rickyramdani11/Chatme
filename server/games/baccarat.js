/**
 * Baccarat Game Bot - Classic Casino Card Game
 * 
 * Commands:
 * /bot bacarat add - Activate bot in room (admin only)
 * /bot bacarat off - Deactivate bot in room (admin only)
 * !start - Start betting phase (60 seconds)
 * !bet <player/banker/tie> <amount> - Place bet
 * !deal - Deal cards and determine winner (auto after timer)
 * !status - Check game status
 * !help - Show help
 * 
 * Bet Types:
 * - player: Bet on Player hand - pays 1:1
 * - banker: Bet on Banker hand - pays 0.95:1 (5% commission)
 * - tie: Bet on Tie - pays 8:1
 * 
 * Game Rules:
 * - Card values: A=1, 2-9=face value, 10/J/Q/K=0
 * - Hand value = sum of cards modulo 10
 * - Natural win: 8 or 9 with first 2 cards
 * - Third card drawn based on fixed rules
 * - Highest hand wins (9 is best)
 */

import pkg from 'pg';
const { Pool } = pkg;
import { hasActiveLowcardGame } from './lowcard.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const BOT_USERNAME = 'BaccaratBot';
const BOT_USER_ID = 998;
const BETTING_TIME = 60000; // 60 seconds
const MAX_PLAYERS = 30; // Support 30 players per game

const botPresence = {};
const games = {};

const PAYOUTS = {
  player: 2,      // 1:1
  banker: 1.95,   // 0.95:1 (5% commission)
  tie: 9          // 8:1
};

const CARD_VALUES = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 0, 'J': 0, 'Q': 0, 'K': 0
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, value: CARD_VALUES[rank] });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function calculateHandValue(cards) {
  const sum = cards.reduce((total, card) => total + card.value, 0);
  return sum % 10;
}

function formatCard(card) {
  return `${card.rank}${card.suit}`;
}

// Card to icon mapping - returns tag for client to render image from assets/card/
function getCardIcon(card) {
  // Map suits to file suffixes
  const suitMap = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  // Map ranks to file prefixes
  const rankMap = {
    'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
    'J': 'j', 'Q': 'q', 'K': 'k'
  };
  
  const suit = suitMap[card.suit];
  const rank = rankMap[card.rank];
  
  // Return card icon tag (client will render image from assets/card/)
  // Include .png extension to match CARD_IMAGES dictionary keys
  return `<card:lc_${rank}${suit}.png>`;
}

function shouldPlayerDrawThird(playerValue) {
  return playerValue <= 5;
}

function shouldBankerDrawThird(bankerValue, playerThirdCard) {
  if (bankerValue <= 2) return true;
  if (bankerValue >= 7) return false;
  
  if (playerThirdCard === null) {
    return bankerValue <= 5;
  }
  
  const playerThirdValue = playerThirdCard.value;
  
  if (bankerValue === 3) return playerThirdValue !== 8;
  if (bankerValue === 4) return [2, 3, 4, 5, 6, 7].includes(playerThirdValue);
  if (bankerValue === 5) return [4, 5, 6, 7].includes(playerThirdValue);
  if (bankerValue === 6) return [6, 7].includes(playerThirdValue);
  
  return false;
}

function sendBotMessage(io, room, message) {
  const botMessage = {
    id: `${Date.now()}_baccaratbot_${Math.random().toString(36).substr(2, 9)}`,
    sender: BOT_USERNAME,
    content: message,
    timestamp: new Date().toISOString(),
    roomId: room,
    role: 'bot',
    level: 999,
    type: 'message',
    media: null,
    image: null
  };
  
  console.log(`[Baccarat] Bot sending message to room ${room}:`, message);
  io.to(room).emit('new-message', botMessage);
}

function sendPrivateMessage(io, userId, room, message) {
  io.to(room).emit('private-bot-message', {
    targetUserId: userId,
    message,
    timestamp: new Date().toISOString()
  });
}

export function isBaccaratBotActive(roomId) {
  return botPresence[roomId] === true;
}

export function activateBaccaratBot(io, roomId) {
  if (hasActiveLowcardGame(roomId)) {
    return { success: false, message: 'LowCard game is active. Please end it first.' };
  }

  botPresence[roomId] = true;
  sendBotMessage(io, roomId, '🎴 BaccaratBot is now active! Type !start to begin playing\n\nBet on Player (1:1), Banker (0.95:1), or Tie (8:1)\nType !help for commands');
  console.log(`[Baccarat] Bot activated in room: ${roomId}`);
  
  return { success: true, message: 'Baccarat Bot activated!' };
}

export function deactivateBaccaratBot(io, roomId) {
  if (games[roomId]) {
    endGame(io, roomId, true);
  }
  
  delete botPresence[roomId];
  sendBotMessage(io, roomId, '🎴 BaccaratBot has been deactivated. Thanks for playing!');
  console.log(`[Baccarat] Bot deactivated in room: ${roomId}`);
  
  return { success: true, message: 'Baccarat Bot deactivated!' };
}

export function ensureBaccaratBotPresence(io, roomId) {
  if (botPresence[roomId]) {
    sendBotMessage(io, roomId, '🎴 BaccaratBot is active! Type !start to begin playing');
    console.log(`[Baccarat] Showing activation message for room: ${roomId}`);
  }
}

async function getUserCredits(userId) {
  try {
    const result = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);
    return result.rows.length > 0 ? result.rows[0].balance : 0;
  } catch (error) {
    console.error('[Baccarat] Error getting user credits:', error);
    return 0;
  }
}

// RACE CONDITION FIX: Use row-level locking with SELECT FOR UPDATE inside transaction
async function deductCredits(userId, amount) {
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    // Lock row and check balance atomically - prevents race conditions
    const balanceResult = await client.query(
      'SELECT balance FROM user_credits WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    
    if (balanceResult.rows.length === 0 || balanceResult.rows[0].balance < amount) {
      await client.query('ROLLBACK');
      console.log(`[Baccarat] User ${userId} insufficient balance`);
      return false;
    }
    
    // Deduct from user_credits
    await client.query(
      'UPDATE user_credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, userId]
    );
    
    // Record transaction in credit_transactions
    await client.query(
      `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
       VALUES ($1, $1, $2, 'game_bet', 'Baccarat Game Bet')`,
      [userId, amount]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log(`[Baccarat] Deducted ${amount} COIN from user ${userId}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Baccarat] Error deducting credits:', error);
    return false;
  } finally {
    client.release();
  }
}

async function addCredits(userId, amount, reason = 'baccarat_win') {
  try {
    // Add to user_credits
    await pool.query(
      'UPDATE user_credits SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, userId]
    );
    
    // Record transaction in credit_transactions
    const transactionType = reason === 'baccarat_win' ? 'game_win' : 'game_refund';
    const description = reason === 'baccarat_win' ? 'Baccarat Game Win' : `Baccarat: ${reason}`;
    
    await pool.query(
      `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
       VALUES ($1, $1, $2, $3, $4)`,
      [userId, amount, transactionType, description]
    );
    
    console.log(`[Baccarat] Added ${amount} COIN to user ${userId} (${reason})`);
    return true;
  } catch (error) {
    console.error('[Baccarat] Error adding credits:', error);
    return false;
  }
}

async function logTransaction(userId, amount, type, details) {
  try {
    await pool.query(
      `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, description)
       VALUES ($1, $2, $3, $4)`,
      [type === 'win' ? null : userId, type === 'win' ? userId : null, Math.abs(amount), details]
    );
  } catch (error) {
    console.error('[Baccarat] Error logging transaction:', error);
  }
}

async function logGameResult(game, winner) {
  try {
    const totalBets = Object.values(game.bets).reduce((sum, bet) => sum + bet.amount, 0);
    const totalPayout = Object.entries(game.bets).reduce((sum, [userId, bet]) => {
      if (bet.betType === winner) {
        return sum + Math.floor(bet.amount * PAYOUTS[winner]);
      } else if (winner === 'tie' && (bet.betType === 'player' || bet.betType === 'banker')) {
        return sum + bet.amount; // Push - return bet
      }
      return sum;
    }, 0);

    await pool.query(
      `INSERT INTO baccarat_games 
       (room_id, winner, player_cards, banker_cards, player_value, banker_value, total_bets, total_payout)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        game.roomId,
        winner,
        game.playerHand.map(formatCard).join(' '),
        game.bankerHand.map(formatCard).join(' '),
        calculateHandValue(game.playerHand),
        calculateHandValue(game.bankerHand),
        totalBets,
        totalPayout
      ]
    );
    console.log(`[Baccarat] Game result logged for room ${game.roomId}: ${winner} wins`);
  } catch (error) {
    console.error('[Baccarat] Error logging game result:', error);
  }
}

function startGame(io, roomId, initiatorId, initiatorName) {
  if (games[roomId]) {
    return { success: false, message: 'Game already in progress!' };
  }

  games[roomId] = {
    roomId,
    status: 'betting',
    bets: {},
    deck: shuffleDeck(createDeck()),
    playerHand: [],
    bankerHand: [],
    startTime: Date.now(),
    initiator: initiatorName
  };

  sendBotMessage(io, roomId, `🎴 Baccarat game started by ${initiatorName}!\n\n` +
    `Place your bets using: !bet <player/banker/tie> <amount>\n` +
    `⏰ Betting closes in 60 seconds\n` +
    `Max ${MAX_PLAYERS} players can join!`);

  games[roomId].timer = setTimeout(() => {
    dealCards(io, roomId);
  }, BETTING_TIME);

  return { success: true, message: 'Game started!' };
}

function placeBet(io, roomId, userId, username, betType, amount) {
  const game = games[roomId];
  
  if (!game) {
    return { success: false, message: 'No active game! Use !start to begin' };
  }

  if (game.status !== 'betting') {
    return { success: false, message: 'Betting is closed!' };
  }

  if (!['player', 'banker', 'tie'].includes(betType.toLowerCase())) {
    return { success: false, message: 'Invalid bet type! Use: player, banker, or tie' };
  }

  const betAmount = parseInt(amount);
  if (isNaN(betAmount) || betAmount <= 0) {
    return { success: false, message: 'Invalid bet amount!' };
  }

  // Check if user already has a bet (atomic check with immediate flag)
  if (game.bets[userId]) {
    sendPrivateMessage(io, userId, roomId, '❌ You already have a bet in this game!');
    return { success: false, message: 'Already bet in this game' };
  }

  if (Object.keys(game.bets).length >= MAX_PLAYERS) {
    return { success: false, message: `Maximum ${MAX_PLAYERS} players reached!` };
  }

  // Set pending flag immediately to prevent race conditions
  game.bets[userId] = {
    username,
    betType: betType.toLowerCase(),
    amount: betAmount,
    pending: true
  };

  getUserCredits(userId).then(async credits => {
    // Check if bet was cancelled
    if (!game.bets[userId]) {
      return;
    }

    if (credits < betAmount) {
      sendPrivateMessage(io, userId, roomId, `❌ Insufficient credits! You have ${credits}, need ${betAmount}`);
      delete game.bets[userId]; // Remove pending bet
      return;
    }

    const success = await deductCredits(userId, betAmount);
    if (!success) {
      sendPrivateMessage(io, userId, roomId, '❌ Failed to place bet. Please try again');
      delete game.bets[userId]; // Remove pending bet
      return;
    }

    // Confirm bet by removing pending flag
    game.bets[userId].pending = false;

    await logTransaction(userId, betAmount, 'bet', `Baccarat bet: ${betType} ${betAmount}`);

    const playerCount = Object.keys(game.bets).length;
    sendBotMessage(io, roomId, `✅ ${username} bet ${betAmount} credits on ${betType.toUpperCase()} (${playerCount}/${MAX_PLAYERS} players)`);
  }).catch(error => {
    console.error('[Baccarat] Error placing bet:', error);
    delete game.bets[userId]; // Remove pending bet on error
    sendPrivateMessage(io, userId, roomId, '❌ Error placing bet. Please try again');
  });

  return { success: true, message: 'Bet placed!' };
}

async function dealCards(io, roomId) {
  const game = games[roomId];
  
  if (!game) return;

  if (Object.keys(game.bets).length === 0) {
    sendBotMessage(io, roomId, '❌ No bets placed. Game cancelled!');
    endGame(io, roomId, true);
    return;
  }

  game.status = 'dealing';
  
  sendBotMessage(io, roomId, '🎴 Dealing cards...');

  game.playerHand.push(game.deck.pop());
  game.bankerHand.push(game.deck.pop());
  game.playerHand.push(game.deck.pop());
  game.bankerHand.push(game.deck.pop());

  const playerValue = calculateHandValue(game.playerHand);
  const bankerValue = calculateHandValue(game.bankerHand);

  let resultMessage = `\n━━━━━━━━━━━━━━━━━━\n`;
  resultMessage += `🎴 PLAYER: ${game.playerHand.map(getCardIcon).join(' ')} = ${playerValue}\n`;
  resultMessage += `🎴 BANKER: ${game.bankerHand.map(getCardIcon).join(' ')} = ${bankerValue}\n`;

  if (playerValue >= 8 || bankerValue >= 8) {
    resultMessage += '\n🌟 NATURAL!\n';
  } else {
    let playerThirdCard = null;
    
    if (shouldPlayerDrawThird(playerValue)) {
      playerThirdCard = game.deck.pop();
      game.playerHand.push(playerThirdCard);
      resultMessage += `\n🎴 Player draws: ${getCardIcon(playerThirdCard)}\n`;
    }
    
    if (shouldBankerDrawThird(bankerValue, playerThirdCard)) {
      const bankerThirdCard = game.deck.pop();
      game.bankerHand.push(bankerThirdCard);
      resultMessage += `🎴 Banker draws: ${getCardIcon(bankerThirdCard)}\n`;
    }
  }

  const finalPlayerValue = calculateHandValue(game.playerHand);
  const finalBankerValue = calculateHandValue(game.bankerHand);

  resultMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
  resultMessage += `🎴 FINAL PLAYER: ${game.playerHand.map(getCardIcon).join(' ')} = ${finalPlayerValue}\n`;
  resultMessage += `🎴 FINAL BANKER: ${game.bankerHand.map(getCardIcon).join(' ')} = ${finalBankerValue}\n`;
  resultMessage += `━━━━━━━━━━━━━━━━━━\n\n`;

  let winner;
  if (finalPlayerValue > finalBankerValue) {
    winner = 'player';
    resultMessage += '🏆 PLAYER WINS!\n\n';
  } else if (finalBankerValue > finalPlayerValue) {
    winner = 'banker';
    resultMessage += '🏆 BANKER WINS!\n\n';
  } else {
    winner = 'tie';
    resultMessage += '🤝 TIE!\n\n';
  }

  await processPayouts(io, roomId, game, winner, resultMessage);
}

async function processPayouts(io, roomId, game, winner, resultMessage) {
  const results = [];

  for (const [userId, bet] of Object.entries(game.bets)) {
    let winAmount = 0;
    let profit = 0;

    if (bet.betType === winner) {
      // Won the bet
      winAmount = Math.floor(bet.amount * PAYOUTS[winner]);
      profit = winAmount - bet.amount;
      
      await addCredits(parseInt(userId), winAmount);
      await logTransaction(parseInt(userId), winAmount, 'win', `Baccarat win: ${winner} ${winAmount}`);
      
      results.push(`✅ ${bet.username}: Won ${winAmount} credits (+${profit})`);
    } else if (winner === 'tie' && (bet.betType === 'player' || bet.betType === 'banker')) {
      // Push on tie - return bet amount
      await addCredits(parseInt(userId), bet.amount);
      await logTransaction(parseInt(userId), bet.amount, 'win', `Baccarat tie push: returned ${bet.amount}`);
      
      results.push(`🤝 ${bet.username}: Tie - Bet returned ${bet.amount} credits`);
    } else {
      // Lost the bet
      results.push(`❌ ${bet.username}: Lost ${bet.amount} credits`);
    }
  }

  resultMessage += results.join('\n');
  sendBotMessage(io, roomId, resultMessage);

  // Log game result to database
  await logGameResult(game, winner);

  endGame(io, roomId, false);
}

function endGame(io, roomId, cancelled = false) {
  const game = games[roomId];
  
  if (game) {
    if (game.timer) {
      clearTimeout(game.timer);
    }
    delete games[roomId];
  }

  if (!cancelled) {
    setTimeout(() => {
      sendBotMessage(io, roomId, '🎴 Ready for next game! Type !start to play again');
    }, 3000);
  }
}

function showStatus(roomId) {
  const game = games[roomId];
  
  if (!game) {
    return { success: false, message: 'No active game' };
  }

  const playerCount = Object.keys(game.bets).length;
  const timeLeft = Math.max(0, Math.floor((BETTING_TIME - (Date.now() - game.startTime)) / 1000));

  let statusMsg = `🎴 Baccarat Game Status\n\n`;
  statusMsg += `Status: ${game.status.toUpperCase()}\n`;
  statusMsg += `Players: ${playerCount}/${MAX_PLAYERS}\n`;
  
  if (game.status === 'betting') {
    statusMsg += `Time left: ${timeLeft}s\n`;
  }

  return { success: true, message: statusMsg };
}

function showHelp() {
  const helpText = `🎴 Baccarat Bot Commands:

!start - Start a new game

Betting (choose one):
!bet <type> <amount> - Full command
!b <p/b/t> <amount> - Shorthand
  p = player (1:1)
  b = banker (0.95:1)
  t = tie (8:1)
  Example: !b p 600

!status - Check game status
!help - Show this help

🎴 Game Rules:
• Card values: A=1, 2-9=value, 10/J/Q/K=0
• Hand value = sum % 10 (9 is highest)
• Natural: 8 or 9 with 2 cards
• Third card drawn by fixed rules
• Up to ${MAX_PLAYERS} players per game
• 60 second betting window`;

  return { success: true, message: helpText };
}

export function handleBaccaratCommand(io, socket, room, message, userId, username) {
  if (!botPresence[room]) return;

  const cmd = message.toLowerCase().trim();

  if (cmd === '!start') {
    const result = startGame(io, room, userId, username);
    if (!result.success) {
      sendPrivateMessage(io, userId, room, result.message);
    }
    return;
  }

  // Handle !bet command
  if (cmd.startsWith('!bet ')) {
    const parts = cmd.split(' ');
    if (parts.length === 3) {
      const betType = parts[1];
      const amount = parts[2];
      const result = placeBet(io, room, userId, username, betType, amount);
      if (!result.success) {
        sendPrivateMessage(io, userId, room, result.message);
      }
    } else {
      sendPrivateMessage(io, userId, room, '❌ Usage: !bet <player/banker/tie> <amount>');
    }
    return;
  }

  // Handle shorthand !b command
  if (cmd.startsWith('!b ')) {
    const parts = cmd.split(' ');
    if (parts.length === 3) {
      const shortType = parts[1].toLowerCase();
      const amount = parts[2];
      
      // Map shorthand to full type
      const typeMap = {
        'p': 'player',
        'b': 'banker',
        't': 'tie'
      };
      
      const betType = typeMap[shortType];
      if (!betType) {
        sendPrivateMessage(io, userId, room, '❌ Invalid type! Use: p (player), b (banker), or t (tie)');
        return;
      }
      
      const result = placeBet(io, room, userId, username, betType, amount);
      if (!result.success) {
        sendPrivateMessage(io, userId, room, result.message);
      }
    } else {
      sendPrivateMessage(io, userId, room, '❌ Usage: !b <p/b/t> <amount>\nExample: !b p 600');
    }
    return;
  }

  if (cmd === '!deal') {
    const game = games[room];
    if (!game) {
      sendPrivateMessage(io, userId, room, 'No active game!');
      return;
    }
    
    if (game.status !== 'betting') {
      sendPrivateMessage(io, userId, room, 'Cards already dealt!');
      return;
    }

    clearTimeout(game.timer);
    dealCards(io, room);
    return;
  }

  if (cmd === '!status') {
    const result = showStatus(room);
    sendPrivateMessage(io, userId, room, result.message);
    return;
  }

  if (cmd === '!help') {
    const result = showHelp();
    sendPrivateMessage(io, userId, room, result.message);
    return;
  }
}

export async function initBaccaratTables() {
  try {
    console.log('[Baccarat] Checking database tables...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS baccarat_games (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        winner VARCHAR(10),
        player_cards TEXT,
        banker_cards TEXT,
        player_value INTEGER,
        banker_value INTEGER,
        total_bets INTEGER DEFAULT 0,
        total_payout INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('[Baccarat] ✅ Database tables initialized');
  } catch (error) {
    console.error('[Baccarat] Error initializing tables:', error);
  }
}

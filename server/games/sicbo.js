/**
 * Sicbo Game Bot - 3 Dice Betting Game
 * 
 * Commands:
 * !sicbo start - Start betting phase
 * !sicbo bet <type> <amount> - Place bet
 * !sicbo roll - Roll dice (admin only)
 * !sicbo status - Check game status
 * !sicbo help - Show help
 * 
 * Bet Types:
 * - big/small: Total 11-17 (big) or 4-10 (small) - pays 1:1
 * - odd/even: Total is odd or even - pays 1:1
 * - total:<4-17>: Specific total sum - pays varies
 * - single:<1-6>: Specific number appears - pays 1:1, 2:1, 3:1
 * - double:<1-6>: Double of specific number - pays 10:1
 * - triple:<1-6>: Triple of specific number - pays 180:1
 * - anytriple: Any triple - pays 30:1
 */

import pkg from 'pg';
const { Pool } = pkg;

// Create database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const BOT_USERNAME = 'SicboBot';
const BOT_USER_ID = 999; // Different from LowCard bot

// Game states per room
const games = {}; // { roomId: gameData }

// Payout multipliers
const PAYOUTS = {
  big: 2,      // 1:1
  small: 2,    // 1:1
  odd: 2,      // 1:1
  even: 2,     // 1:1
  single_1: 2, // 1x appears
  single_2: 3, // 2x appears
  single_3: 4, // 3x appears
  double: 11,  // 10:1
  triple_specific: 181, // 180:1
  anytriple: 31, // 30:1
  total_4: 61,
  total_5: 31,
  total_6: 19,
  total_7: 13,
  total_8: 9,
  total_9: 7,
  total_10: 7,
  total_11: 7,
  total_12: 7,
  total_13: 9,
  total_14: 13,
  total_15: 19,
  total_16: 31,
  total_17: 61
};

// Dice face to emoji/icon mapping
function getDiceIcon(number) {
  // Using dice emoji (will be replaced with images later)
  const diceEmoji = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅'
  };
  return diceEmoji[number] || '?';
}

// Send bot message to room
function sendBotMessage(io, room, message) {
  io.to(room).emit('new-message', {
    id: `sicbo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sender: BOT_USERNAME,
    senderId: BOT_USER_ID,
    content: message,
    timestamp: new Date().toISOString(),
    roomId: room,
    role: 'bot',
    level: 1,
    type: 'bot',
    isBot: true
  });
}

// Send private bot message
function sendPrivateMessage(io, userId, room, message) {
  io.to(room).emit('private-bot-message', {
    targetUserId: userId,
    message,
    timestamp: new Date().toISOString()
  });
}

// Roll 3 dice
function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1
  ];
}

// Calculate total sum
function calculateTotal(dice) {
  return dice.reduce((sum, val) => sum + val, 0);
}

// Check if triple
function isTriple(dice) {
  return dice[0] === dice[1] && dice[1] === dice[2];
}

// Check if specific double
function hasDouble(dice, number) {
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
  return counts[number] >= 2;
}

// Count specific number appearances
function countNumber(dice, number) {
  return dice.filter(d => d === number).length;
}

// Calculate win amount for a bet
function calculateWin(betType, betValue, amount, dice) {
  const total = calculateTotal(dice);
  const triple = isTriple(dice);

  // Triple = BIG/SMALL lose
  if (triple && (betType === 'big' || betType === 'small')) {
    return 0;
  }

  switch (betType) {
    case 'big':
      return total >= 11 && total <= 17 ? amount * PAYOUTS.big : 0;
    
    case 'small':
      return total >= 4 && total <= 10 ? amount * PAYOUTS.small : 0;
    
    case 'odd':
      return total % 2 === 1 ? amount * PAYOUTS.odd : 0;
    
    case 'even':
      return total % 2 === 0 ? amount * PAYOUTS.even : 0;
    
    case 'total':
      if (total === betValue) {
        const payout = PAYOUTS[`total_${betValue}`] || 2;
        return amount * payout;
      }
      return 0;
    
    case 'single': {
      const count = countNumber(dice, betValue);
      if (count === 1) return amount * PAYOUTS.single_1;
      if (count === 2) return amount * PAYOUTS.single_2;
      if (count === 3) return amount * PAYOUTS.single_3;
      return 0;
    }
    
    case 'double':
      return hasDouble(dice, betValue) ? amount * PAYOUTS.double : 0;
    
    case 'triple':
      if (triple && dice[0] === betValue) {
        return amount * PAYOUTS.triple_specific;
      }
      return 0;
    
    case 'anytriple':
      return triple ? amount * PAYOUTS.anytriple : 0;
    
    default:
      return 0;
  }
}

// Deduct coins from user (use user_credits like LowCard)
async function deductCoins(userId, amount) {
  try {
    // Check balance first
    const balanceResult = await pool.query(
      'SELECT balance FROM user_credits WHERE user_id = $1',
      [userId]
    );
    
    if (balanceResult.rows.length === 0) {
      console.log(`[Sicbo] User ${userId} has no credit record`);
      return false;
    }
    
    const currentBalance = balanceResult.rows[0].balance;
    if (currentBalance < amount) {
      console.log(`[Sicbo] User ${userId} insufficient balance: ${currentBalance} < ${amount}`);
      return false;
    }
    
    // Deduct from user_credits
    await pool.query(
      'UPDATE user_credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, userId]
    );
    
    // Record transaction in credit_transactions (match LowCard schema)
    await pool.query(
      `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
       VALUES ($1, $1, $2, 'game_bet', 'Sicbo Game Bet')`,
      [userId, amount]
    );
    
    console.log(`[Sicbo] Deducted ${amount} COIN from user ${userId}`);
    return true;
  } catch (error) {
    console.error('[Sicbo] Error deducting coins:', error);
    return false;
  }
}

// Add coins to user (use user_credits like LowCard)
async function addCoins(userId, amount, reason = 'sicbo_win') {
  try {
    // Get current balance
    const balanceResult = await pool.query(
      'SELECT balance FROM user_credits WHERE user_id = $1',
      [userId]
    );
    
    const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;
    
    // Add to user_credits
    await pool.query(
      'UPDATE user_credits SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, userId]
    );
    
    // Record transaction in credit_transactions (match LowCard schema)
    const transactionType = reason === 'sicbo_win' ? 'game_win' : reason;
    const description = reason === 'sicbo_win' ? 'Sicbo Game Win' : `Sicbo: ${reason}`;
    
    await pool.query(
      `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
       VALUES ($1, $1, $2, $3, $4)`,
      [userId, amount, transactionType, description]
    );
    
    console.log(`[Sicbo] Added ${amount} COIN to user ${userId} (${reason})`);
    return true;
  } catch (error) {
    console.error('[Sicbo] Error adding coins:', error);
    return false;
  }
}

// Main command handler
export async function handleSicboCommand(io, socket, room, args, userId, username) {
  const command = args[0]?.toLowerCase();

  switch (command) {
    case 'start': {
      // Check if game already running
      if (games[room] && games[room].phase !== 'ended') {
        sendBotMessage(io, room, '🎲 Game already in progress! Wait for it to finish.');
        return;
      }

      // Start new game
      games[room] = {
        phase: 'betting',
        bets: [], // { userId, username, betType, betValue, amount }
        startTime: Date.now(),
        roundId: `sicbo_${room}_${Date.now()}`
      };

      sendBotMessage(io, room, `🎲 **Sicbo Game Started!**\n\nPlace your bets now! (30 seconds)\n\nBet types:\n• !sicbo bet big <amount>\n• !sicbo bet small <amount>\n• !sicbo bet odd <amount>\n• !sicbo bet even <amount>\n• !sicbo bet total:10 <amount>\n• !sicbo bet single:5 <amount>\n• !sicbo bet double:3 <amount>\n• !sicbo bet triple:6 <amount>\n• !sicbo bet anytriple <amount>`);

      // Auto-roll after 30 seconds
      setTimeout(() => {
        if (games[room] && games[room].phase === 'betting') {
          rollAndCalculate(io, room);
        }
      }, 30000);
      break;
    }

    case 'bet': {
      if (!games[room] || games[room].phase !== 'betting') {
        sendPrivateMessage(io, userId, room, 'No betting phase active! Use !sicbo start first.');
        return;
      }

      // Parse bet: !sicbo bet <type> <amount>
      // Examples: !sicbo bet big 500, !sicbo bet total:10 1000
      const betInput = args[1]?.toLowerCase();
      const amount = parseInt(args[2]);

      if (!betInput || !amount || amount < 100) {
        sendPrivateMessage(io, userId, room, 'Invalid bet! Format: !sicbo bet <type> <amount> (min 100 COIN)');
        return;
      }

      // Parse bet type and value
      let betType, betValue;
      
      if (betInput.includes(':')) {
        const parts = betInput.split(':');
        betType = parts[0];
        betValue = parseInt(parts[1]);
      } else {
        betType = betInput;
        betValue = null;
      }

      // Validate bet type
      const validSimpleBets = ['big', 'small', 'odd', 'even', 'anytriple'];
      const validComplexBets = ['total', 'single', 'double', 'triple'];
      
      if (!validSimpleBets.includes(betType) && !validComplexBets.includes(betType)) {
        sendPrivateMessage(io, userId, room, `Invalid bet type! Use: ${validSimpleBets.join(', ')}, or ${validComplexBets.map(t => t + ':<number>').join(', ')}`);
        return;
      }

      // Validate bet value for complex bets
      if (betType === 'total' && (betValue < 4 || betValue > 17)) {
        sendPrivateMessage(io, userId, room, 'Total must be between 4 and 17');
        return;
      }
      if (['single', 'double', 'triple'].includes(betType) && (betValue < 1 || betValue > 6)) {
        sendPrivateMessage(io, userId, room, 'Dice number must be between 1 and 6');
        return;
      }

      // Check if user already bet this type
      const existingBet = games[room].bets.find(
        b => b.userId === userId && b.betType === betType && b.betValue === betValue
      );
      if (existingBet) {
        sendPrivateMessage(io, userId, room, 'You already placed this bet!');
        return;
      }

      // Deduct coins
      const success = await deductCoins(userId, amount);
      if (!success) {
        sendPrivateMessage(io, userId, room, `Insufficient COIN! You need ${amount} COIN to bet.`);
        return;
      }

      // Add bet
      games[room].bets.push({
        userId,
        username,
        betType,
        betValue,
        amount
      });

      const betDisplay = betValue ? `${betType}:${betValue}` : betType;
      sendBotMessage(io, room, `💰 ${username} bet ${amount} COIN on **${betDisplay}**`);
      break;
    }

    case 'roll': {
      // Admin only
      if (!socket || socket.userRole !== 'admin') {
        sendPrivateMessage(io, userId, room, 'Only admins can force roll!');
        return;
      }

      if (!games[room] || games[room].phase !== 'betting') {
        sendBotMessage(io, room, 'No active betting phase!');
        return;
      }

      rollAndCalculate(io, room);
      break;
    }

    case 'status': {
      if (!games[room]) {
        sendBotMessage(io, room, 'No game running. Use !sicbo start');
        return;
      }

      const game = games[room];
      const totalBets = game.bets.reduce((sum, b) => sum + b.amount, 0);
      sendBotMessage(io, room, `🎲 **Game Status**\nPhase: ${game.phase}\nTotal bets: ${game.bets.length}\nTotal COIN: ${totalBets}`);
      break;
    }

    case 'help': {
      sendBotMessage(io, room, `🎲 **Sicbo Game Help**\n\n**Commands:**\n!sicbo start - Start game\n!sicbo bet <type> <amount> - Place bet\n!sicbo status - Game status\n\n**Bet Types:**\nbig/small (1:1), odd/even (1:1)\ntotal:4-17 (varies)\nsingle:1-6 (1:1 to 3:1)\ndouble:1-6 (10:1)\ntriple:1-6 (180:1)\nanytriple (30:1)`);
      break;
    }

    default:
      sendBotMessage(io, room, 'Unknown command! Use !sicbo help');
  }
}

// Roll dice and calculate results
async function rollAndCalculate(io, room) {
  const game = games[room];
  if (!game) return;

  game.phase = 'rolling';
  sendBotMessage(io, room, '🎲 **NO MORE BETS!** Rolling dice...');

  // Wait 2 seconds for suspense
  setTimeout(async () => {
    const dice = rollDice();
    const total = calculateTotal(dice);
    const triple = isTriple(dice);

    const diceDisplay = dice.map(d => getDiceIcon(d)).join(' ');
    
    sendBotMessage(io, room, `🎲 **DICE ROLLED!**\n\n${diceDisplay}\n\nTotal: **${total}** ${triple ? '🎰 TRIPLE!' : ''}`);

    // Calculate wins
    const results = [];
    for (const bet of game.bets) {
      const winAmount = calculateWin(bet.betType, bet.betValue, bet.amount, dice);
      
      if (winAmount > 0) {
        await addCoins(bet.userId, winAmount, 'sicbo_win');
        const profit = winAmount - bet.amount;
        results.push(`✅ ${bet.username}: +${profit} COIN`);
      } else {
        results.push(`❌ ${bet.username}: -${bet.amount} COIN`);
      }
    }

    // Show results
    if (results.length > 0) {
      sendBotMessage(io, room, `**Results:**\n${results.join('\n')}`);
    } else {
      sendBotMessage(io, room, 'No bets placed!');
    }

    game.phase = 'ended';
    
    // Auto-cleanup after 5 seconds
    setTimeout(() => {
      delete games[room];
    }, 5000);
  }, 2000);
}

// Get game status for a room
export function getSicboStatus(room) {
  return games[room] || null;
}

// Initialize bot in room
export async function initSicboBot(roomId) {
  try {
    // Check if bot_room_members table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sicbo_bot_rooms (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add bot to room
    await pool.query(`
      INSERT INTO sicbo_bot_rooms (room_id, is_active)
      VALUES ($1, true)
      ON CONFLICT DO NOTHING
    `, [roomId]);

    return { success: true, message: 'SicboBot initialized' };
  } catch (error) {
    console.error('[Sicbo] Init error:', error);
    return { success: false, message: 'Failed to initialize bot' };
  }
}

// Shutdown bot in room
export async function shutdownSicboBot(roomId) {
  try {
    await pool.query(`
      UPDATE sicbo_bot_rooms SET is_active = false WHERE room_id = $1
    `, [roomId]);

    // Cancel active game
    if (games[roomId]) {
      delete games[roomId];
    }

    return { success: true, message: 'SicboBot shutdown' };
  } catch (error) {
    console.error('[Sicbo] Shutdown error:', error);
    return { success: false, message: 'Failed to shutdown bot' };
  }
}

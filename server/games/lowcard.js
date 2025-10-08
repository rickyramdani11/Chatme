const { Server } = require('socket.io');

const rooms = {};
const botPresence = {};

// Card utilities
function drawCard() {
  const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"];
  const suits = ["h", "d", "s", "c"];
  const value = values[Math.floor(Math.random() * values.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const filename = `lc_${value}${suit}.png`;
  const imageUrl = `/cards/${filename}`;
  return { value, suit, filename, imageUrl };
}

function getCardValue(card) {
  const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"];
  return order.indexOf(card.value);
}

// Database coin functions
async function potongCoin(userId, amount, isRefund = false) {
  // Check if user has enough coins and deduct from balance
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // First check user's current balance
    const balanceResult = await pool.query(
      'SELECT balance FROM user_credits WHERE user_id = $1',
      [userId]
    );
    
    if (balanceResult.rows.length === 0) {
      console.log(`[LowCard] User ${userId} has no credit record`);
      return false;
    }
    
    const currentBalance = balanceResult.rows[0].balance;
    console.log(`[LowCard] User ${userId} has ${currentBalance} coins, needs ${amount}`);
    
    if (currentBalance < amount) {
      console.log(`[LowCard] User ${userId} insufficient balance: ${currentBalance} < ${amount}`);
      return false;
    }
    
    // Deduct coins from user's balance
    await pool.query(
      'UPDATE user_credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, userId]
    );
    
    // Record transaction in credit_transactions (if not a refund)
    if (!isRefund) {
      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
        VALUES ($1, $1, $2, 'game_bet', 'LowCard Game Bet')
      `, [userId, amount]);
    }
    
    console.log(`[LowCard] Deducted ${amount} coins from user ${userId}, new balance: ${currentBalance - amount}`);
    return true;
  } catch (error) {
    console.error('Error checking/deducting coins:', error);
    return false;
  }
}

async function tambahCoin(userId, amount, isRefund = false) {
  // Add coins to user's database balance
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // Add coins to user's balance
    await pool.query(
      'UPDATE user_credits SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [amount, userId]
    );
    
    // Record transaction in credit_transactions
    const transactionType = isRefund ? 'game_refund' : 'game_win';
    const description = isRefund ? 'LowCard Game Refund' : 'LowCard Game Win';
    
    await pool.query(`
      INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
      VALUES ($1, $1, $2, $3, $4)
    `, [userId, amount, transactionType, description]);
    
    console.log(`[LowCard] Added ${amount} coins to user ${userId} (${transactionType})`);
  } catch (error) {
    console.error('Error adding coins:', error);
  }
}

// Database persistence functions
async function initializeLowCardTables() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // Create lowcard_games table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lowcard_games (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(255) NOT NULL,
        bet_amount INTEGER NOT NULL,
        total_pot INTEGER DEFAULT 0,
        started_by VARCHAR(255) NOT NULL,
        started_by_id INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'joining',
        current_round INTEGER DEFAULT 0,
        total_rounds INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP,
        winner_id INTEGER,
        winner_username VARCHAR(255)
      )
    `);

    // Create lowcard_game_players table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lowcard_game_players (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES lowcard_games(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        username VARCHAR(255) NOT NULL,
        bet_amount INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        card_value VARCHAR(10),
        card_suit VARCHAR(10),
        eliminated_round INTEGER,
        refunded BOOLEAN DEFAULT false,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ LowCard persistence tables initialized');
    
    // Run auto-refund for incomplete games
    await autoRefundIncompleteGames();
  } catch (error) {
    console.error('Error initializing LowCard tables:', error);
  }
}

async function autoRefundIncompleteGames() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // Find all incomplete games (not finished and not already processed)
    const incompleteGamesResult = await pool.query(`
      SELECT DISTINCT g.id, g.room_id, g.bet_amount
      FROM lowcard_games g
      WHERE g.status IN ('joining', 'running', 'drawing')
      AND g.finished_at IS NULL
    `);

    if (incompleteGamesResult.rows.length === 0) {
      console.log('✅ No incomplete LowCard games found - no refunds needed');
      return;
    }

    console.log(`🔄 Found ${incompleteGamesResult.rows.length} incomplete LowCard game(s) - processing refunds...`);

    for (const game of incompleteGamesResult.rows) {
      // Get all players in this game who haven't been refunded
      const playersResult = await pool.query(`
        SELECT user_id, username, bet_amount
        FROM lowcard_game_players
        WHERE game_id = $1 AND refunded = false
      `, [game.id]);

      console.log(`💰 Refunding ${playersResult.rows.length} player(s) from game ${game.id} in room ${game.room_id}`);

      // Refund each player
      for (const player of playersResult.rows) {
        await tambahCoin(player.user_id, player.bet_amount, true);
        console.log(`   ✅ Refunded ${player.bet_amount} COIN to ${player.username} (ID: ${player.user_id})`);
      }

      // Mark all players as refunded
      await pool.query(`
        UPDATE lowcard_game_players
        SET refunded = true
        WHERE game_id = $1
      `, [game.id]);

      // Mark game as refunded
      await pool.query(`
        UPDATE lowcard_games
        SET status = 'refunded', finished_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [game.id]);

      console.log(`✅ Game ${game.id} marked as refunded`);
    }

    console.log('✅ All incomplete games have been refunded');
  } catch (error) {
    console.error('❌ Error in auto-refund process:', error);
  }
}

async function createGameInDB(roomId, betAmount, startedBy, startedById) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query(`
      INSERT INTO lowcard_games (room_id, bet_amount, started_by, started_by_id, status)
      VALUES ($1, $2, $3, $4, 'joining')
      RETURNING id
    `, [roomId, betAmount, startedBy, startedById]);

    return result.rows[0].id;
  } catch (error) {
    console.error('Error creating game in DB:', error);
    return null;
  }
}

async function addPlayerToDB(gameId, userId, username, betAmount) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    await pool.query(`
      INSERT INTO lowcard_game_players (game_id, user_id, username, bet_amount)
      VALUES ($1, $2, $3, $4)
    `, [gameId, userId, username, betAmount]);
  } catch (error) {
    console.error('Error adding player to DB:', error);
  }
}

async function updateGameStatus(gameId, status, winnerId = null, winnerUsername = null) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    if (status === 'finished') {
      await pool.query(`
        UPDATE lowcard_games
        SET status = $1, finished_at = CURRENT_TIMESTAMP, winner_id = $2, winner_username = $3
        WHERE id = $4
      `, [status, winnerId, winnerUsername, gameId]);
    } else {
      await pool.query(`
        UPDATE lowcard_games
        SET status = $1
        WHERE id = $2
      `, [status, gameId]);
    }
  } catch (error) {
    console.error('Error updating game status:', error);
  }
}

// Initialize bot presence in a room
function ensureBotPresence(io, roomId) {
  if (!botPresence[roomId]) {
    botPresence[roomId] = true;
    sendBotMessage(io, roomId, 'LowCardBot is now active! Type !start <bet> to begin playing');
    console.log(`LowCardBot initialized in room: ${roomId}`);
  }
}

function startJoinPhase(io, room) {
  console.log(`[LowCard] startJoinPhase called for room: ${room}`);
  const data = rooms[room];
  if (!data) {
    console.log(`[LowCard] No game data found for room ${room}`);
    return;
  }

  console.log(`[LowCard] Sending join phase message for room ${room}, bet: ${data.bet}, started by: ${data.startedBy}`);
  sendBotMessage(io, room, `LowCard started by ${data.startedBy} (auto-joined). Enter !j to join the game. Cost: ${data.bet} COIN (30s)`);

  data.timeout = setTimeout(async () => {
    if (data.players.length < 2) {
      sendBotMessage(io, room, `Joining ends. Not enough players. Need at least 2 players.`);
      sendBotMessage(io, room, `Game canceled - All bets refunded!`);
      
      // Refund all players who joined
      for (const player of data.players) {
        await tambahCoin(player.id, player.bet, true);
        console.log(`[LowCard] Refunded ${player.bet} coins to ${player.username} (game canceled)`);
      }
      
      if (data.players.length > 0) {
        sendBotMessage(io, room, `${data.players.length} player(s) refunded ${data.bet} COIN each.`);
      }
      
      delete rooms[room];
    } else {
      data.activePlayers = [...data.players];
      data.totalRounds = data.players.length; // Total rounds = number of players
      data.currentRound = 1;
      sendBotMessage(io, room, `Game starting with ${data.players.length} players! Total rounds: ${data.totalRounds}`);
      startRound(io, room);
    }
  }, 30000);
}

function startRound(io, room) {
  const data = rooms[room];
  if (!data) return;

  if (data.timeout) {
    clearTimeout(data.timeout);
    delete data.timeout;
  }

  // Check if game should end
  if (data.activePlayers.length <= 1) {
    finishGame(io, room);
    return;
  }

  data.isRunning = true;
  
  // Update game status to 'running' in DB on first round
  if (data.currentRound === 1 && data.gameId) {
    updateGameStatus(data.gameId, 'running').catch(err => {
      console.error('Failed to update game status to running:', err);
    });
  }

  // Reset cards for all active players
  data.activePlayers.forEach(player => {
    player.card = undefined;
  });

  sendBotMessage(io, room, `ROUND ${data.currentRound} - ${data.activePlayers.length} players remaining`);
  sendBotMessage(io, room, `Draw phase started! Type !d to draw your card. (20s auto-draw)`);

  // Auto-draw after 20 seconds
  data.drawTimeout = setTimeout(() => {
    data.activePlayers.forEach(player => {
      if (!player.card) {
        player.card = drawCard();
        sendBotMessage(io, room, `${player.username} auto drew a card.`, null, player.card.imageUrl);
      }
    });

    const allDrawn = data.activePlayers.every(p => p.card);
    if (allDrawn) {
      processRoundResults(io, room);
    }
  }, 20000);
}

function processTieBreaker(io, room, tiedPlayers) {
  const data = rooms[room];
  if (!data) return;

  // Show tied players
  const tiedNames = tiedPlayers.map(p => p.username).join(', ');
  sendBotMessage(io, room, `Tied players: ${tiedNames}`);
  sendBotMessage(io, room, `Tied players ONLY draw again. Next round starts in 3 seconds.`);

  // Reset cards for tied players only
  tiedPlayers.forEach(player => {
    player.card = undefined;
  });

  // Mark as tie breaker phase and store tied players
  data.isTieBreaker = true;
  data.tiedPlayers = tiedPlayers;

  // Start tie breaker draw phase
  setTimeout(() => {
    sendBotMessage(io, room, `ROUND #${data.currentRound}: Players. !d to DRAW. 20 seconds.`);

    // Auto-draw after 20 seconds for tied players
    data.drawTimeout = setTimeout(() => {
      tiedPlayers.forEach(player => {
        if (!player.card) {
          player.card = drawCard();
          sendBotMessage(io, room, `${player.username}:`, null, player.card.imageUrl);
        }
      });

      const allDrawn = tiedPlayers.every(p => p.card);
      if (allDrawn) {
        processTieResults(io, room, tiedPlayers);
      }
    }, 20000);
  }, 3000);
}

function processTieResults(io, room, tiedPlayers) {
  const data = rooms[room];
  if (!data) return;

  if (data.drawTimeout) {
    clearTimeout(data.drawTimeout);
    delete data.drawTimeout;
  }

  // Show "Times up" message
  sendBotMessage(io, room, `Times up! Tallying cards.`);

  // Sort tied players by card value (lowest first)
  const sorted = [...tiedPlayers].sort((a, b) => getCardValue(a.card) - getCardValue(b.card));
  const lowestValue = getCardValue(sorted[0].card);
  const newEliminatedCandidates = sorted.filter(p => getCardValue(p.card) === lowestValue);

  // Check if still tied
  if (newEliminatedCandidates.length > 1) {
    // Still tied, do another tie breaker
    sendBotMessage(io, room, `Still tied! Drawing again...`);
    processTieBreaker(io, room, newEliminatedCandidates);
  } else {
    // We have a clear loser
    const eliminatedPlayer = newEliminatedCandidates[0];
    
    // Show bot draws for other active players (not in tie)
    const nonTiedPlayers = data.activePlayers.filter(p => !tiedPlayers.some(tp => tp.username === p.username));
    nonTiedPlayers.forEach(player => {
      sendBotMessage(io, room, `Bot draws - ${player.username}:`, null, player.card.imageUrl);
    });
    
    // Show tied results
    sorted.forEach(player => {
      sendBotMessage(io, room, `${player.username}:`, null, player.card.imageUrl);
    });
    
    sendBotMessage(io, room, `${eliminatedPlayer.username}: OUT with the lowest card!`, null, eliminatedPlayer.card.imageUrl);

    // Remove eliminated player from active players
    data.activePlayers = data.activePlayers.filter(p => p.username !== eliminatedPlayer.username);
    eliminatedPlayer.isActive = false;

    // Reset tie breaker flags
    data.isTieBreaker = false;
    data.tiedPlayers = null;

    // Check if game should end
    if (data.activePlayers.length <= 1) {
      setTimeout(() => {
        finishGame(io, room);
      }, 3000);
    } else {
      // Continue to next round
      data.currentRound++;
      sendBotMessage(io, room, `${data.activePlayers.length} players remaining. Next round in 5 seconds...`);

      data.roundTimeout = setTimeout(() => {
        startRound(io, room);
      }, 5000);
    }
  }
}

function processRoundResults(io, room) {
  const data = rooms[room];
  if (!data) return;

  if (data.drawTimeout) {
    clearTimeout(data.drawTimeout);
    delete data.drawTimeout;
  }

  // Show "Times up" message when tallying cards
  sendBotMessage(io, room, `Times up! Tallying cards.`);

  // Sort active players by card value (lowest first)
  const sorted = [...data.activePlayers].sort((a, b) => getCardValue(a.card) - getCardValue(b.card));
  const lowestValue = getCardValue(sorted[0].card);
  const eliminatedCandidates = sorted.filter(p => getCardValue(p.card) === lowestValue);

  let eliminatedPlayer;

  if (eliminatedCandidates.length > 1) {
    // Tie detected - start tie breaker re-draw
    sorted.forEach(player => {
      sendBotMessage(io, room, `${player.username}:`, null, player.card.imageUrl);
    });
    processTieBreaker(io, room, eliminatedCandidates);
    return;
  } else {
    eliminatedPlayer = eliminatedCandidates[0];
    
    // Show all cards
    sorted.forEach(player => {
      sendBotMessage(io, room, `${player.username}:`, null, player.card.imageUrl);
    });
    
    sendBotMessage(io, room, `${eliminatedPlayer.username}: OUT with the lowest card!`, null, eliminatedPlayer.card.imageUrl);
  }

  // Remove eliminated player from active players
  data.activePlayers = data.activePlayers.filter(p => p.username !== eliminatedPlayer.username);
  eliminatedPlayer.isActive = false;

  // Check if game should end
  if (data.activePlayers.length <= 1) {
    // Game over - we have a winner
    setTimeout(() => {
      finishGame(io, room);
    }, 3000);
  } else {
    // Continue to next round
    data.currentRound++;
    sendBotMessage(io, room, `${data.activePlayers.length} players remaining. Next round in 5 seconds...`);

    data.roundTimeout = setTimeout(() => {
      startRound(io, room);
    }, 5000);
  }
}

async function finishGame(io, room) {
  const data = rooms[room];
  if (!data) return;

  if (data.roundTimeout) {
    clearTimeout(data.roundTimeout);
    delete data.roundTimeout;
  }

  // Calculate winnings
  const totalBet = data.players.reduce((sum, p) => sum + p.bet, 0);
  const housecut = totalBet * 0.1; // 10% house cut
  const winAmount = totalBet - housecut;

  if (data.activePlayers.length === 1) {
    const winner = data.activePlayers[0];
    await tambahCoin(winner.id, winAmount);

    sendBotMessage(io, room, `LowCard game over! ${winner.username} WINS ${winAmount.toFixed(1)} COIN! CONGRATS!`);
    
    // Mark game as finished in DB
    if (data.gameId) {
      await updateGameStatus(data.gameId, 'finished', winner.id, winner.username);
    }
  } else {
    // This shouldn't happen, but handle it just in case
    sendBotMessage(io, room, `Game ended with no clear winner.`);
    
    // Mark game as finished anyway
    if (data.gameId) {
      await updateGameStatus(data.gameId, 'finished');
    }
  }

  // Show final standings
  sendBotMessage(io, room, `Final Standings:`);
  const finalStandings = [...data.players].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return 0;
  });

  finalStandings.forEach((player, index) => {
    const position = index + 1;
    const status = player.isActive ? " WINNER" : `#${position}`;
    sendBotMessage(io, room, `${status} ${player.username}`);
  });

  sendBotMessage(io, room, `Type !start <bet> to play again!`);

  // Clean up
  delete rooms[room];
}

// Function to check if bot is active in a room
function isBotActiveInRoom(roomId) {
  return botPresence[roomId] === true;
}

// Function to get bot status for a room
function getBotStatus(roomId) {
  if (botPresence[roomId]) {
    const game = rooms[roomId];
    if (game?.isRunning) {
      return `LowCardBot is running Round ${game.currentRound}/${game.totalRounds} with ${game.activePlayers.length} players remaining.`;
    } else if (game) {
      return `LowCardBot is waiting for players to join. Type !j to join! (${game.players.length} players joined)`;
    }
    return `LowCardBot is active! Type !start <bet> to begin playing.`;
  }
  return `LowCardBot is not active in this room.`;
}

// Helper function to send bot messages
function sendBotMessage(io, room, content, media = null, image = null) {
  // If an image is provided, embed it in the content with <card:> tag
  let finalContent = content;
  if (image) {
    finalContent = `${content} <card:${image}>`;
  }

  const botMessage = {
    id: `${Date.now()}_lowcardbot_${Math.random().toString(36).substr(2, 9)}`,
    sender: 'LowCardBot',
    content: finalContent,
    timestamp: new Date().toISOString(),
    roomId: room,
    role: 'bot',
    level: 999,
    type: 'message',
    media: media,
    image: image
  };

  console.log(`LowCardBot sending message to room ${room}:`, finalContent);

  // Send to all clients in the room
  io.to(room).emit('new-message', botMessage);

  // Also broadcast using sendMessage event for better compatibility
  io.to(room).emit('sendMessage', {
    roomId: room,
    sender: 'LowCardBot',
    content: finalContent,
    role: 'bot',
    level: 1,
    type: 'message',
    media: media,
    image: image,
    timestamp: new Date().toISOString()
  });

  // Ensure delivery with retry
  setTimeout(() => {
    io.to(room).emit('new-message', { ...botMessage, id: botMessage.id + '_retry' });
  }, 100);
}

// Helper function to send private bot messages (only to specific user)
function sendPrivateBotMessage(socket, room, content, media = null, image = null) {
  // If an image is provided, embed it in the content with <card:> tag
  let finalContent = content;
  if (image) {
    finalContent = `${content} <card:${image}>`;
  }

  const botMessage = {
    id: `${Date.now()}_lowcardbot_private_${Math.random().toString(36).substr(2, 9)}`,
    sender: 'LowCardBot',
    content: finalContent,
    timestamp: new Date().toISOString(),
    roomId: room,
    role: 'bot',
    level: 999,
    type: 'message',
    media: media,
    image: image
  };

  console.log(`LowCardBot sending PRIVATE message to user:`, finalContent);

  // Send only to this specific socket
  if (socket && socket.id) {
    socket.emit('new-message', botMessage);
    socket.emit('sendMessage', {
      roomId: room,
      sender: 'LowCardBot',
      content: finalContent,
      role: 'bot',
      level: 1,
      type: 'message',
      media: media,
      image: image,
      timestamp: new Date().toISOString()
    });
  }
}

// Helper function to send private bot messages to user by userId
function sendPrivateBotMessageToUser(io, userId, room, content, media = null, image = null) {
  // If an image is provided, embed it in the content with <card:> tag
  let finalContent = content;
  if (image) {
    finalContent = `${content} <card:${image}>`;
  }

  const botMessage = {
    id: `${Date.now()}_lowcardbot_private_${Math.random().toString(36).substr(2, 9)}`,
    sender: 'LowCardBot',
    content: finalContent,
    timestamp: new Date().toISOString(),
    roomId: room,
    role: 'bot',
    level: 999,
    type: 'message',
    media: media,
    image: image
  };

  console.log(`LowCardBot sending PRIVATE message to user ${userId}:`, finalContent);

  // Send only to this specific user's notification room
  io.to(`user_${userId}`).emit('new-message', botMessage);
  io.to(`user_${userId}`).emit('sendMessage', {
    roomId: room,
    sender: 'LowCardBot',
    content: finalContent,
    role: 'bot',
    level: 1,
    type: 'message',
    media: media,
    image: image,
    timestamp: new Date().toISOString()
  });
}

async function processLowCardCommand(io, room, msg, userId, username, userRole = 'user') {
  console.log('Processing LowCard command directly:', msg, 'in room:', room, 'for user:', username, 'role:', userRole);

  // Comprehensive validation of all parameters
  if (!io || !room || !userId || !username) {
    console.error('Invalid parameters for LowCard command:', { io: !!io, room, userId, username });
    return;
  }

  // Enhanced message validation with multiple checks
  if (msg === null || msg === undefined) {
    console.error('Message is null or undefined');
    return;
  }

  if (typeof msg !== 'string') {
    console.error('Message is not a string, received type:', typeof msg, 'value:', msg);
    return;
  }

  if (msg.length === 0) {
    console.error('Message is empty string');
    return;
  }

  const trimmedMsg = msg.trim();

  // Additional safety check after trimming
  if (!trimmedMsg || trimmedMsg.length === 0) {
    console.error('Message became empty after trimming, original:', JSON.stringify(msg));
    return;
  }

  // Handle /init_bot command specifically - force initialize bot (ADMIN ONLY)
  if (trimmedMsg === '/init_bot') {
    console.log(`Force initializing LowCardBot in room ${room} by ${username} (role: ${userRole})`);
    
    // Check if user is admin
    if (userRole !== 'admin') {
      sendBotMessage(io, room, `❌ Only admins can initialize LowCardBot.`);
      console.log(`⚠️ Non-admin user ${username} attempted to init LowCardBot`);
      return;
    }
    
    if (!botPresence[room]) {
      botPresence[room] = true;
      sendBotMessage(io, room, 'LowCardBot is now active! Type !start <bet> to begin playing');
      console.log(`LowCardBot successfully activated in room ${room} by admin ${username}`);
    } else {
      sendBotMessage(io, room, 'LowCardBot is already active in this room! Type !help for commands.');
      console.log(`LowCardBot already active in room ${room}`);
    }
    return;
  }

  // Handle /bot lowcard add command specifically (ADMIN ONLY)
  if (trimmedMsg === '/bot lowcard add' || trimmedMsg === '/add' || trimmedMsg === '/addbot' || trimmedMsg === '/add lowcard') {
    console.log(`Add bot command received in room ${room} from user ${username} (role: ${userRole})`);
    
    // Check if user is admin
    if (userRole !== 'admin') {
      sendBotMessage(io, room, `❌ Only admins can add LowCardBot to rooms.`);
      console.log(`⚠️ Non-admin user ${username} attempted to add LowCardBot`);
      return;
    }
    
    // Check if Sicbo game is running (dynamic import)
    try {
      const { hasActiveSicboGame } = await import('./sicbo.js');
      if (hasActiveSicboGame(room)) {
        sendBotMessage(io, room, '⚠️ Sicbo is running this room, off bot sicbo to add bot new');
        console.log(`[LowCard] Cannot add LowCardBot - Sicbo game is running in room ${room}`);
        return;
      }
    } catch (err) {
      console.error('[LowCard] Error checking Sicbo game:', err);
    }
    
    if (!botPresence[room]) {
      botPresence[room] = true;
      sendBotMessage(io, room, '🎮 LowCardBot is now active! Type !start <bet> to begin playing');
      console.log(`LowCardBot successfully added to room ${room} by admin ${username}`);
    } else {
      sendBotMessage(io, room, '⚠️ LowCardBot is already active in this room! Type !help for commands.');
      console.log(`LowCardBot already active in room ${room}`);
    }
    return;
  }

  // Handle /bot off command specifically
  if (trimmedMsg === '/bot off') {
    // Check if bot is already off
    if (!botPresence[room]) {
      sendBotMessage(io, room, `Bot is off in room`);
      return;
    }

    // Remove bot presence from room
    delete botPresence[room];

    // Cancel any ongoing games in this room
    const data = rooms[room];
    if (data) {
      let refundCount = 0;
      let totalRefunded = 0;
      
      // Refund all players if game exists
      for (const player of data.players) {
        await tambahCoin(player.id, player.bet, true);
        refundCount++;
        totalRefunded += player.bet;
        console.log(`[LowCard] Refunded ${player.bet} coins to ${player.username} (bot shutdown)`);
      }

      // Clear timeouts
      if (data.timeout) {
        clearTimeout(data.timeout);
      }
      if (data.drawTimeout) {
        clearTimeout(data.drawTimeout);
      }
      if (data.roundTimeout) {
        clearTimeout(data.roundTimeout);
      }

      // Notify about refunds
      if (refundCount > 0) {
        sendBotMessage(io, room, `Game canceled - ${refundCount} player(s) refunded ${totalRefunded} COIN total.`);
      }

      // Remove room data
      delete rooms[room];
    }

    // Send goodbye message
    sendBotMessage(io, room, 'LowCardBot has left the room. Type "/bot lowcard add" to add the bot back.');
    return;
  }

  // Enhanced safety check for startsWith with comprehensive validation
  try {
    if (!trimmedMsg || typeof trimmedMsg !== 'string' || !trimmedMsg.startsWith('!')) {
      console.log('Not a bot command, ignoring. Message:', JSON.stringify(trimmedMsg));
      return;
    }
  } catch (error) {
    console.error('Error checking if message starts with !:', error, 'Message:', JSON.stringify(trimmedMsg));
    return;
  }

  // Ensure bot is present in the room when any command is used
  ensureBotPresence(io, room);

  const [command, ...args] = trimmedMsg.split(' ');

  handleLowCardCommand(io, room, command, args, userId, username, null, userId);
}

// Separate command handling logic  
async function handleLowCardCommand(io, room, command, args, userId, username, socket = null, userIdForPrivate = null) {
  console.log(`[LowCard] Processing command: ${command} with args: [${args.join(', ')}] from user: ${username} in room: ${room}`);

  switch (command) {
    case '!start': {
      console.log(`[LowCard] START command received - Room: ${room}, User: ${username}, Args: [${args.join(', ')}]`);

      if (rooms[room]) {
        console.log(`[LowCard] Game already in progress in room ${room}`);
        if (socket) {
          sendPrivateBotMessage(socket, room, `Game already in progress!`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `Game already in progress!`);
        } else {
          sendBotMessage(io, room, `Game already in progress!`);
        }
        return;
      }

      const bet = parseInt(args[0]) || 500;
      console.log(`[LowCard] Parsed bet amount: ${bet}`);

      if (bet < 500) {
        console.log(`[LowCard] Bet too low: ${bet}`);
        if (socket) {
          sendPrivateBotMessage(socket, room, `Minimum bet is 500 COIN!`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `Minimum bet is 500 COIN!`);
        } else {
          sendBotMessage(io, room, `Minimum bet is 500 COIN!`);
        }
        return;
      }

      if (bet > 10000) {
        console.log(`[LowCard] Bet too high: ${bet}`);
        if (socket) {
          sendPrivateBotMessage(socket, room, `Bet too high! Maximum bet is 10,000 COIN.`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `Bet too high! Maximum bet is 10,000 COIN.`);
        } else {
          sendBotMessage(io, room, `Bet too high! Maximum bet is 10,000 COIN.`);
        }
        return;
      }

      // Check if starter has enough coins and deduct immediately
      if (!(await potongCoin(userId, bet))) {
        if (socket) {
          sendPrivateBotMessage(socket, room, `You don't have enough COIN to start the game.`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `You don't have enough COIN to start the game.`);
        } else {
          // Fallback: send private to user instead of broadcasting
          sendPrivateBotMessageToUser(io, userId, room, `You don't have enough COIN to start the game.`);
        }
        return;
      }

      console.log(`[LowCard] Creating new game in room ${room} with bet ${bet}`);
      
      // Create game in database
      const gameId = await createGameInDB(room, bet, username, userId);
      
      rooms[room] = {
        gameId, // Store DB game ID
        players: [],
        activePlayers: [],
        bet,
        startedBy: username,
        isRunning: false,
        currentRound: 0,
        totalRounds: 0
      };

      // Auto-join the starter
      const starterPlayer = {
        id: userId,
        username,
        socketId: '', // This will be populated by socket.id from the socket event listener
        coin: 1000, // This should come from database
        bet: bet,
        isActive: true
      };

      rooms[room].players.push(starterPlayer);
      
      // Add starter to DB
      if (gameId) {
        await addPlayerToDB(gameId, userId, username, bet);
      }
      
      sendBotMessage(io, room, `${username} started the game and joined automatically.`);

      console.log(`[LowCard] Starting join phase for room ${room}`);
      startJoinPhase(io, room);
      break;
    }

    case '!j': {
      const data = rooms[room];
      if (!data) {
        sendBotMessage(io, room, `No game in progress. Type !start <bet> to start a game.`);
        return;
      }

      if (data.isRunning) {
        if (socket) {
          sendPrivateBotMessage(socket, room, `Game already started! Wait for next game.`);
        } else {
          sendBotMessage(io, room, `Game already started! Wait for next game.`);
        }
        return;
      }

      if (data.players.find(p => p.username === username)) {
        if (socket) {
          sendPrivateBotMessage(socket, room, `You already joined!`);
        } else {
          sendBotMessage(io, room, `${username} already joined!`);
        }
        return;
      }

      if (data.players.length >= 200) {
        sendBotMessage(io, room, `Game is full! Maximum 200 players.`);
        return;
      }

      // Check if user has enough coins
      if (!(await potongCoin(userId, data.bet))) {
        // Send private error message to user only
        if (socket) {
          sendPrivateBotMessage(socket, room, `You don't have enough COIN to join. Need ${data.bet} COIN.`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `You don't have enough COIN to join. Need ${data.bet} COIN.`);
        } else {
          // Fallback: send private to user instead of broadcasting
          sendPrivateBotMessageToUser(io, userId, room, `You don't have enough COIN to join. Need ${data.bet} COIN.`);
        }
        return;
      }

      const player = {
        id: userId,
        username,
        socketId: '', // This will be populated by socket.id from the socket event listener
        coin: 1000, // This should come from database
        bet: data.bet,
        isActive: true
      };

      data.players.push(player);
      
      // Add player to DB
      if (data.gameId) {
        await addPlayerToDB(data.gameId, userId, username, data.bet);
      }
      
      sendBotMessage(io, room, `${username} joined the game.`);
      break;
    }

    case '!d': {
      const data = rooms[room];
      if (!data) {
        if (socket) {
          sendPrivateBotMessage(socket, room, `No game in progress.`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `No game in progress.`);
        } else {
          sendBotMessage(io, room, `No game in progress.`);
        }
        return;
      }

      if (!data.isRunning) {
        if (socket) {
          sendPrivateBotMessage(socket, room, `Game has not started yet`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `Game has not started yet`);
        } else {
          sendBotMessage(io, room, `Game has not started yet`);
        }
        return;
      }

      const player = data.activePlayers.find(p => p.username === username);
      if (!player) {
        if (socket) {
          sendPrivateBotMessage(socket, room, `You are not in this round`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `You are not in this round`);
        } else {
          sendBotMessage(io, room, `${username} is not in this round`);
        }
        return;
      }

      if (player.card) {
        if (socket) {
          sendPrivateBotMessage(socket, room, `You already drew a card`);
        } else if (userIdForPrivate) {
          sendPrivateBotMessageToUser(io, userIdForPrivate, room, `You already drew a card`);
        } else {
          sendBotMessage(io, room, `${username} already drew a card`);
        }
        return;
      }

      player.card = drawCard();
      sendBotMessage(io, room, `${username}:`, null, player.card.imageUrl);

      // Check if all players have drawn (depending on tie breaker mode)
      if (data.isTieBreaker && data.tiedPlayers) {
        // In tie breaker, only check tied players
        const allDrawn = data.tiedPlayers.every(p => p.card);
        if (allDrawn) {
          processTieResults(io, room, data.tiedPlayers);
        }
      } else {
        // Normal round, check all active players
        const allDrawn = data.activePlayers.every(p => p.card);
        if (allDrawn) {
          processRoundResults(io, room);
        }
      }
      break;
    }

    case '!status': {
      const status = getBotStatus(room);
      sendBotMessage(io, room, status);
      break;
    }

    case '!leave': {
      const data = rooms[room];
      if (!data) {
        sendBotMessage(io, room, `No game in progress.`);
        return;
      }

      if (data.isRunning) {
        // Allow leaving during game - eliminate player and continue
        const activePlayerIndex = data.activePlayers.findIndex(p => p.username === username);
        if (activePlayerIndex !== -1) {
          const leavingPlayer = data.activePlayers[activePlayerIndex];
          leavingPlayer.card = { value: "2", suit: "c", imageUrl: "/cards/lc_2c.png" }; // Worst card
          sendBotMessage(io, room, `${username} left game`);

          // Check if all remaining players have cards
          const allDrawn = data.activePlayers.every(p => p.card);
          if (allDrawn) {
            processRoundResults(io, room);
          }
        }
        return;
      }

      const playerIndex = data.players.findIndex(p => p.username === username);
      if (playerIndex === -1) {
        sendBotMessage(io, room, `${username} is not in this game!`);
        return;
      }

      const player = data.players[playerIndex];
      
      // Refund the bet
      await tambahCoin(userId, data.bet, true);
      data.players.splice(playerIndex, 1);
      sendBotMessage(io, room, `${username} left the game. ${data.bet} COIN refunded.`);
      console.log(`[LowCard] Refunded ${data.bet} coins to ${username} (manual leave)`);
      
      // Check if game should be canceled due to insufficient players
      if (data.players.length < 2 && data.timeout) {
        clearTimeout(data.timeout);
        
        // Refund remaining players
        for (const remainingPlayer of data.players) {
          await tambahCoin(remainingPlayer.id, remainingPlayer.bet, true);
          console.log(`[LowCard] Refunded ${remainingPlayer.bet} coins to ${remainingPlayer.username} (game canceled due to insufficient players)`);
        }
        
        if (data.players.length > 0) {
          sendBotMessage(io, room, `Game canceled - ${data.players.length} remaining player(s) refunded.`);
        } else {
          sendBotMessage(io, room, `Game canceled - Not enough players.`);
        }
        
        delete rooms[room];
      }
      
      break;
    }

    case '!help': {
      const helpText = `LowCard Commands:
!start <bet> - Start a new elimination game (min 500 COIN)
!j - Join current game
!d - Draw your card in current round
!leave - Leave game (before it starts)
!status - Check bot status
!help - Show this help

Admin Commands:
/add or /addbot - Add LowCardBot to room (Admin only)
/bot off - Remove LowCardBot from room

Game Rules:
- Minimum bet: 500 COIN
- Each round, lowest card gets eliminated
- Game continues until 1 player remains
- Winner takes the pot (minus 10% house cut)`;
      sendBotMessage(io, room, helpText);
      break;
    }
  }
}

function handleLowCardBot(io, socket) {
  console.log('Setting up LowCard bot command listener for socket:', socket.id);

  // Handle the command directly if socket.on is not available
  if (typeof socket.on !== 'function') {
    console.log('Socket.on not available, handling command directly');
    return;
  }

  socket.on('command', (room, msg) => {
    console.log('LowCard bot received command:', msg, 'in room:', room, 'from socket:', socket.id);
    if (!msg.startsWith('!')) {
      console.log('Not a bot command, ignoring');
      return;
    }

    // Ensure bot is present in the room when any command is used
    ensureBotPresence(io, room);

    const [command, ...args] = msg.trim().split(' ');
    const username = socket.username;
    const userId = socket.userId;

    // When a player joins, their socketId is assigned here
    if (command === '!j' && rooms[room] && !rooms[room].isRunning) {
      const player = rooms[room].players.find(p => p.username === username);
      if (player) {
        player.socketId = socket.id;
      }
    }

    handleLowCardCommand(io, room, command, args, userId, username, socket);
  });

  socket.on('disconnecting', async () => {
    // Handle player disconnect
    for (const [room, data] of Object.entries(rooms)) {
      const playerIndex = data.players.findIndex(p => p.id === socket.userId);
      if (playerIndex !== -1) {
        const player = data.players[playerIndex];

        if (!data.isRunning) {
          // Refund bet if game hasn't started
          await tambahCoin(player.id, player.bet, true);
          data.players.splice(playerIndex, 1);
          sendBotMessage(io, room, `${player.username} disconnected and left the game. ${player.bet} COIN refunded.`);
          console.log(`[LowCard] Refunded ${player.bet} coins to ${player.username} (disconnect during join phase)`);

          // Cancel game if not enough players and refund remaining players
          if (data.players.length < 2 && data.timeout) {
            clearTimeout(data.timeout);
            
            // Refund remaining players
            for (const remainingPlayer of data.players) {
              await tambahCoin(remainingPlayer.id, remainingPlayer.bet);
              console.log(`[LowCard] Refunded ${remainingPlayer.bet} coins to ${remainingPlayer.username} (game canceled due to insufficient players)`);
            }
            
            if (data.players.length > 0) {
              sendBotMessage(io, room, `Game canceled - ${data.players.length} remaining player(s) refunded.`);
            } else {
              sendBotMessage(io, room, `Game canceled - Not enough players.`);
            }
            
            delete rooms[room];
          }
        } else {
          // Game is running - mark as auto-loss if they're in active players
          if (data.activePlayers.find(p => p.id === player.id)) {
            if (!player.card) {
              player.card = { value: "2", suit: "c", filename: "lc_2c.png" }; // Worst possible card
            }
            sendBotMessage(io, room, `${player.username} disconnected and auto-loses!`);

            // Check if all remaining have cards
            const allDrawn = data.activePlayers.every(p => p.card);
            if (allDrawn) {
              processRoundResults(io, room);
            }
          }
        }
      }
    }
  });
}

// Check if there's an active game in room
function hasActiveLowcardGame(roomId) {
  return rooms[roomId]?.isRunning === true;
}

module.exports = {
  processLowCardCommand,
  handleLowCardBot,
  isBotActiveInRoom,
  getBotStatus,
  initializeLowCardTables,
  hasActiveLowcardGame
};
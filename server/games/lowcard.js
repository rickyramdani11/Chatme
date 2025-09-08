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
function potongCoin(userId, amount) {
  // Check if user has enough coins
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // For now, assume minimum 100 coins required
    if (amount > 100) {
      return false;
    }
    // TODO: Actually implement database check and deduction
    // For now, reject if bet is too high for demo
    return true;
  } catch (error) {
    console.error('Error checking coins:', error);
    return false;
  }
}

function tambahCoin(userId, amount) {
  // TODO: Implement actual coin addition to database
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
  sendBotMessage(io, room, `LowCard started by ${data.startedBy}. Enter !j to join the game. Cost: ${data.bet} COIN (30s)`);

  data.timeout = setTimeout(() => {
    if (data.players.length < 2) {
      sendBotMessage(io, room, `Joining ends. Not enough players. Need at least 2 players.`);
      sendBotMessage(io, room, `Game canceled`);
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

function processRoundResults(io, room) {
  const data = rooms[room];
  if (!data) return;

  if (data.drawTimeout) {
    clearTimeout(data.drawTimeout);
    delete data.drawTimeout;
  }

  // Sort active players by card value (lowest first)
  const sorted = [...data.activePlayers].sort((a, b) => getCardValue(a.card) - getCardValue(b.card));
  const lowestValue = getCardValue(sorted[0].card);
  const eliminatedCandidates = sorted.filter(p => getCardValue(p.card) === lowestValue);

  let eliminatedPlayer;

  if (eliminatedCandidates.length > 1) {
    // Tie breaker - random selection
    eliminatedPlayer = eliminatedCandidates[Math.floor(Math.random() * eliminatedCandidates.length)];
    sendBotMessage(io, room, `Tie broken! ${eliminatedPlayer.username} is OUT with the lowest card!`, null, eliminatedPlayer.card.imageUrl);
  } else {
    eliminatedPlayer = eliminatedCandidates[0];
    sendBotMessage(io, room, `${eliminatedPlayer.username} is OUT with the lowest card!`, null, eliminatedPlayer.card.imageUrl);
  }

  // Show round results
  sendBotMessage(io, room, `Round ${data.currentRound} Results:`);
  sorted.forEach(player => {
    const status = player.username === eliminatedPlayer.username ? " OUT" : " SAFE";
    sendBotMessage(io, room, `${player.username}: ${player.card.value.toUpperCase()}${player.card.suit.toUpperCase()}${status}`, null, player.card.imageUrl);
  });

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

function finishGame(io, room) {
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
    tambahCoin(winner.id, winAmount);

    sendBotMessage(io, room, `LowCard game over! ${winner.username} WINS ${winAmount.toFixed(1)} COIN! CONGRATS!`);
  } else {
    // This shouldn't happen, but handle it just in case
    sendBotMessage(io, room, `Game ended with no clear winner.`);
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
  const botMessage = {
    id: `${Date.now()}_lowcardbot_${Math.random().toString(36).substr(2, 9)}`,
    sender: 'LowCardBot',
    content: content,
    timestamp: new Date().toISOString(),
    roomId: room,
    role: 'bot',
    level: 999,
    type: 'message',
    media: media,
    image: image
  };

  console.log(`LowCardBot sending message to room ${room}:`, content);

  // Send to all clients in the room
  io.to(room).emit('new-message', botMessage);

  // Also broadcast using sendMessage event for better compatibility
  io.to(room).emit('sendMessage', {
    roomId: room,
    sender: 'LowCardBot',
    content: content,
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

function processLowCardCommand(io, room, msg, userId, username) {
  console.log('Processing LowCard command directly:', msg, 'in room:', room, 'for user:', username);

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

  // Handle /init_bot command specifically - force initialize bot
  if (trimmedMsg === '/init_bot') {
    console.log(`Force initializing LowCardBot in room ${room}`);
    if (!botPresence[room]) {
      botPresence[room] = true;
      sendBotMessage(io, room, 'LowCardBot is now active! Type !start <bet> to begin playing');
      console.log(`LowCardBot successfully activated in room ${room}`);
    } else {
      sendBotMessage(io, room, 'LowCardBot is already active in this room! Type !help for commands.');
      console.log(`LowCardBot already active in room ${room}`);
    }
    return;
  }

  // Handle /bot lowcard add command specifically
  if (trimmedMsg === '/bot lowcard add' || trimmedMsg === '/add' || trimmedMsg === '/addbot' || trimmedMsg === '/add lowcard') {
    console.log(`Add bot command received in room ${room}`);
    if (!botPresence[room]) {
      botPresence[room] = true;
      sendBotMessage(io, room, 'LowCardBot is now active! Type !start <bet> to begin playing');
      console.log(`LowCardBot successfully added to room ${room}`);
    } else {
      sendBotMessage(io, room, 'LowCardBot is already active in this room! Type !help for commands.');
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
      // Refund all players if game exists
      data.players.forEach(player => {
        tambahCoin(player.id, player.bet);
      });

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

  handleLowCardCommand(io, room, command, args, userId, username);
}

// Separate command handling logic
async function handleLowCardCommand(io, room, command, args, userId, username) {
  console.log(`[LowCard] Processing command: ${command} with args: [${args.join(', ')}] from user: ${username} in room: ${room}`);

  switch (command) {
    case '!start': {
      console.log(`[LowCard] START command received - Room: ${room}, User: ${username}, Args: [${args.join(', ')}]`);

      if (rooms[room]) {
        console.log(`[LowCard] Game already in progress in room ${room}`);
        sendBotMessage(io, room, `Game already in progress!`);
        return;
      }

      const bet = parseInt(args[0]) || 50;
      console.log(`[LowCard] Parsed bet amount: ${bet}`);

      if (bet <= 0) {
        console.log(`[LowCard] Invalid bet amount: ${bet}`);
        sendBotMessage(io, room, `Invalid bet amount! Must be greater than 0.`);
        return;
      }

      if (bet > 10000) {
        console.log(`[LowCard] Bet too high: ${bet}`);
        sendBotMessage(io, room, `Bet too high! Maximum bet is 10,000 COIN.`);
        return;
      }

      console.log(`[LowCard] Creating new game in room ${room} with bet ${bet}`);
      rooms[room] = {
        players: [],
        activePlayers: [],
        bet,
        startedBy: username,
        isRunning: false,
        currentRound: 0,
        totalRounds: 0
      };

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
        sendBotMessage(io, room, `Game already started! Wait for next game.`);
        return;
      }

      if (data.players.find(p => p.username === username)) {
        sendBotMessage(io, room, `${username} already joined!`);
        return;
      }

      if (data.players.length >= 200) {
        sendBotMessage(io, room, `Game is full! Maximum 200 players.`);
        return;
      }

      // Check if user has enough coins
      if (!potongCoin(userId, data.bet)) {
        sendBotMessage(io, room, `${username} doesn't have enough COIN to join.`);
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
      sendBotMessage(io, room, `${username} joined the game.`);
      break;
    }

    case '!d': {
      const data = rooms[room];
      if (!data) {
        sendBotMessage(io, room, `No game in progress.`);
        return;
      }

      if (!data.isRunning) {
        sendBotMessage(io, room, `Game has not started yet`);
        return;
      }

      const player = data.activePlayers.find(p => p.username === username);
      if (!player) {
        sendBotMessage(io, room, `${username} is not in this round`);
        return;
      }

      if (player.card) {
        sendBotMessage(io, room, `${username} already drew a card`);
        return;
      }

      player.card = drawCard();
      sendBotMessage(io, room, `${username} drew a card`, null, player.card.imageUrl);

      // Check if all active players have drawn
      const allDrawn = data.activePlayers.every(p => p.card);
      if (allDrawn) {
        processRoundResults(io, room);
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

      // Refund the bet
      tambahCoin(userId, data.bet);
      data.players.splice(playerIndex, 1);
      sendBotMessage(io, room, `${username} left the game. Bet refunded.`);
      break;
    }

    case '!help': {
      const helpText = `LowCard Commands:
!start <bet> - Start a new elimination game
!j - Join current game
!d - Draw your card in current round
!leave - Leave game (before it starts)
!status - Check bot status
!help - Show this help

Game Rules:
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

    handleLowCardCommand(io, room, command, args, userId, username);
  });

  socket.on('disconnecting', () => {
    // Handle player disconnect
    Object.entries(rooms).forEach(([room, data]) => {
      const playerIndex = data.players.findIndex(p => p.id === socket.userId);
      if (playerIndex !== -1) {
        const player = data.players[playerIndex];

        if (!data.isRunning) {
          // Refund bet if game hasn't started
          tambahCoin(player.id, player.bet);
          data.players.splice(playerIndex, 1);
          sendBotMessage(io, room, `${player.username} disconnected and left the game. Bet refunded.`);

          // Cancel game if not enough players
          if (data.players.length < 2 && data.timeout) {
            clearTimeout(data.timeout);
            sendBotMessage(io, room, `Not enough players. Game canceled.`);
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
    });
  });
}

module.exports = {
  processLowCardCommand,
  handleLowCardBot,
  isBotActiveInRoom,
  getBotStatus
};
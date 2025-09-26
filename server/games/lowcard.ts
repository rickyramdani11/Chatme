import { Server } from 'socket.io';

interface Player {
  id: string;
  username: string;
  socketId: string;
  card?: Card;
  coin: number;
  bet: number;
  isActive: boolean;
}

interface Card {
  value: string; // e.g., "2", "k", "a"
  suit: string;  // e.g., "h", "s", "d", "c"
  filename: string; // e.g., "lc_2h.png"
}

interface GameRoom {
  players: Player[];
  activePlayers: Player[];
  bet: number;
  startedBy: string;
  isRunning: boolean;
  currentRound: number;
  totalRounds: number;
  timeout?: NodeJS.Timeout;
  drawTimeout?: NodeJS.Timeout;
  roundTimeout?: NodeJS.Timeout;
}

const rooms: Record<string, GameRoom> = {};
const botPresence: Record<string, boolean> = {};

// Card utilities
function drawCard(): Card {
  const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"];
  const suits = ["h", "d", "s", "c"];
  const value = values[Math.floor(Math.random() * values.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const filename = `lc_${value}${suit}.png`;
  return { value, suit, filename };
}

function getCardValue(card: Card): number {
  const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"];
  return order.indexOf(card.value);
}

// Mock function - replace with actual database logic
function potongCoin(userId: string, amount: number): boolean {
  // TODO: Implement actual coin deduction from database
  return true; // For now, always return true
}

function tambahCoin(userId: string, amount: number): void {
  // TODO: Implement actual coin addition to database
}

// Initialize bot presence in a room
function ensureBotPresence(io: Server, roomId: string): void {
  if (!botPresence[roomId]) {
    botPresence[roomId] = true;
    sendBotMessage(io, roomId, 'LowCardBot is now active! Type !start <bet> to begin playing');
    console.log(`LowCardBot initialized in room: ${roomId}`);
  }
}

function startJoinPhase(io: Server, room: string): void {
  console.log(`[LowCard] startJoinPhase called for room: ${room}`);
  const data = rooms[room];
  if (!data) {
    console.log(`[LowCard] No game data found for room ${room}`);
    return;
  }

  console.log(`[LowCard] Sending join phase message for room ${room}, bet: ${data.bet}, started by: ${data.startedBy}`);
  sendBotMessage(io, room, `🎮 LowCard started by ${data.startedBy}! Enter !j to join the game. Cost: ${data.bet} COIN [30s]`);

  data.timeout = setTimeout(() => {
    if (data.players.length < 2) {
      sendBotMessage(io, room, `⏰ Joining ends. Not enough players. Need at least 2 players.`);
      sendBotMessage(io, room, `❌ Game canceled`);
      delete rooms[room];
    } else {
      data.activePlayers = [...data.players];
      data.totalRounds = data.players.length - 1; // Total rounds = players - 1
      data.currentRound = 1;
      sendBotMessage(io, room, `🎯 Game starting with ${data.players.length} players! Total rounds: ${data.totalRounds}`);
      startRound(io, room);
    }
  }, 30000);
}

function startRound(io: Server, room: string): void {
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

  sendBotMessage(io, room, `🔥 ROUND ${data.currentRound}/${data.totalRounds} - ${data.activePlayers.length} players remaining`);
  sendBotMessage(io, room, `🎴 Draw phase started! Type !d to draw your card. [20s auto-draw]`);

  // Auto-draw after 20 seconds
  data.drawTimeout = setTimeout(() => {
    data.activePlayers.forEach(player => {
      if (!player.card) {
        player.card = drawCard();
        sendBotMessage(io, room, `🎲 ${player.username} auto drew a card.`, `cards/${player.card.filename}`);
      }
    });

    const allDrawn = data.activePlayers.every(p => p.card);
    if (allDrawn) {
      processRoundResults(io, room);
    }
  }, 20000);
}

function processRoundResults(io: Server, room: string): void {
  const data = rooms[room];
  if (!data) return;

  if (data.drawTimeout) {
    clearTimeout(data.drawTimeout);
    delete data.drawTimeout;
  }

  // Sort active players by card value (lowest first)
  const sorted = [...data.activePlayers].sort((a, b) => getCardValue(a.card!) - getCardValue(b.card!));
  const lowestValue = getCardValue(sorted[0].card!);
  const eliminatedCandidates = sorted.filter(p => getCardValue(p.card!) === lowestValue);

  let eliminatedPlayer: Player;

  if (eliminatedCandidates.length > 1) {
    // Tie breaker - random selection
    eliminatedPlayer = eliminatedCandidates[Math.floor(Math.random() * eliminatedCandidates.length)];
    sendBotMessage(io, room, `⚡ Tie broken! ${eliminatedPlayer.username} is ELIMINATED with the lowest card!`, `cards/${eliminatedPlayer.card!.filename}`);
  } else {
    eliminatedPlayer = eliminatedCandidates[0];
    sendBotMessage(io, room, `💀 ${eliminatedPlayer.username} is ELIMINATED with the lowest card!`, `cards/${eliminatedPlayer.card!.filename}`);
  }

  // Show round results
  sendBotMessage(io, room, `📊 Round ${data.currentRound} Results:`);
  sorted.forEach(player => {
    const status = player.username === eliminatedPlayer.username ? " ❌ ELIMINATED" : " ✅ SAFE";
    sendBotMessage(io, room, `${player.username}: ${player.card!.value.toUpperCase()}${player.card!.suit.toUpperCase()}${status}`, `cards/${player.card!.filename}`);
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
    sendBotMessage(io, room, `⏭️ ${data.activePlayers.length} players remaining. Next round in 5 seconds...`);

    data.roundTimeout = setTimeout(() => {
      startRound(io, room);
    }, 5000);
  }
}

function finishGame(io: Server, room: string): void {
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

    sendBotMessage(io, room, `🎉 GAME OVER! 🎉`);
    sendBotMessage(io, room, `👑 ${winner.username} WINS THE GAME! +${winAmount.toFixed(1)} COIN`, `cards/${winner.card!.filename}`);
    sendBotMessage(io, room, `💰 House cut: ${housecut.toFixed(1)} COIN`);
  } else {
    // This shouldn't happen, but handle it just in case
    sendBotMessage(io, room, `🎮 Game ended with no clear winner.`);
  }

  // Show final standings
  sendBotMessage(io, room, `📈 Final Standings:`);
  const finalStandings = [...data.players].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return 0;
  });

  finalStandings.forEach((player, index) => {
    const position = index + 1;
    const status = player.isActive ? "🏆 WINNER" : `#${position}`;
    sendBotMessage(io, room, `${status} ${player.username}`);
  });

  sendBotMessage(io, room, `🎮 Type !start <bet> to play again!`);

  // Clean up
  delete rooms[room];
}

// Function to check if bot is active in a room
export function isBotActiveInRoom(roomId: string): boolean {
  return botPresence[roomId] === true;
}

// Function to get bot status for a room
export function getBotStatus(roomId: string): string {
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

// Direct command processing function
// Helper function to send bot messages
function sendBotMessage(io: Server, room: string, content: string, media: string | null = null): void {
  const botMessage = {
    id: `${Date.now()}_lowcardbot_${Math.random().toString(36).substr(2, 9)}`,
    sender: 'LowCardBot',
    content: content,
    timestamp: new Date().toISOString(),
    roomId: room,
    role: 'bot',
    level: 999,
    type: 'message',
    media: media
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
    level: 999,
    type: 'message',
    media: media,
    timestamp: new Date().toISOString()
  });

  // Ensure delivery with retry
  setTimeout(() => {
    io.to(room).emit('new-message', { ...botMessage, id: botMessage.id + '_retry' });
  }, 100);
}

export function processLowCardCommand(io: Server, room: string, msg: string, userId: string, username: string): void {
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
      sendBotMessage(io, room, '⚠️ LowCardBot is already active in this room! Type !help for commands.');
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
      sendBotMessage(io, room, '⚠️ LowCardBot is already active in this room! Type !help for commands.');
      console.log(`LowCardBot already active in room ${room}`);
    }
    return;
  }

  // Handle /bot off command specifically
  if (trimmedMsg === '/bot off') {
    // Check if bot is already off
    if (!botPresence[room]) {
      sendBotMessage(io, room, `⚠️ Bot is off in room`);
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
    sendBotMessage(io, room, '🎮 LowCardBot has left the room. Type "/bot lowcard add" to add the bot back.');
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
function handleLowCardCommand(io: Server, room: string, command: string, args: string[], userId: string, username: string): void {
  console.log(`[LowCard] Processing command: ${command} with args: [${args.join(', ')}] from user: ${username} in room: ${room}`);

    switch (command) {
    case '!start': {
        console.log(`[LowCard] START command received - Room: ${room}, User: ${username}, Args: [${args.join(', ')}]`);

        if (rooms[room]) {
          console.log(`[LowCard] Game already in progress in room ${room}`);
          sendBotMessage(io, room, `🎮 Game already in progress!`);
          return;
        }

        const bet = parseInt(args[0]) || 500;
        console.log(`[LowCard] Parsed bet amount: ${bet}`);

        if (bet < 500) {
          console.log(`[LowCard] Bet too low: ${bet}`);
          sendBotMessage(io, room, `❌ Minimum bet is 500 COIN!`);
          return;
        }

        if (bet > 10000) {
          console.log(`[LowCard] Bet too high: ${bet}`);
          sendBotMessage(io, room, `❌ Bet too high! Maximum bet is 10,000 COIN.`);
          return;
        }

        // Check if starter has enough coins and deduct immediately
        if (!potongCoin(userId, bet)) {
          sendBotMessage(io, room, `❌ ${username} doesn't have enough COIN to start the game.`);
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

        // Auto-join the starter
        const starterPlayer: Player = {
          id: userId,
          username,
          socketId: '', // This will be populated by socket.id from the socket event listener
          coin: 1000, // This should come from database
          bet: bet,
          isActive: true
        };

        rooms[room].players.push(starterPlayer);
        sendBotMessage(io, room, `✅ ${username} started the game and joined automatically.`);

        console.log(`[LowCard] Starting join phase for room ${room}`);
        startJoinPhase(io, room);
        break;
      }

      case '!j': {
        const data = rooms[room];
        if (!data) {
          sendBotMessage(io, room, `❌ No game in progress. Type !start <bet> to start a game.`);
          return;
        }

        if (data.isRunning) {
          sendBotMessage(io, room, `⚠️ Game already started! Wait for next game.`);
          return;
        }

        if (data.players.find(p => p.username === username)) {
          sendBotMessage(io, room, `⚠️ ${username} already joined!`);
          return;
        }

        if (data.players.length >= 200) {
          sendBotMessage(io, room, `❌ Game is full! Maximum 200 players.`);
          return;
        }

        // Check if user has enough coins
        if (!potongCoin(userId, data.bet)) {
          sendBotMessage(io, room, `❌ ${username} doesn't have enough COIN to join.`);
          return;
        }

        const player: Player = {
          id: userId,
          username,
          socketId: '', // This will be populated by socket.id from the socket event listener
          coin: 1000, // This should come from database
          bet: data.bet,
          isActive: true
        };

        data.players.push(player);
        sendBotMessage(io, room, `✅ ${username} joined the game! (${data.players.length} players)`);
        break;
      }

      case '!d': {
        const data = rooms[room];
        if (!data) {
          sendBotMessage(io, room, `❌ No game in progress.`);
          return;
        }

        if (!data.isRunning) {
          sendBotMessage(io, room, `❌ Game hasn't started yet!`);
          return;
        }

        const player = data.activePlayers.find(p => p.username === username);
        if (!player) {
          sendBotMessage(io, room, `❌ ${username} is not in this round!`);
          return;
        }

        if (player.card) {
          sendBotMessage(io, room, `⚠️ ${username} already drew a card!`);
          return;
        }

        player.card = drawCard();
        sendBotMessage(io, room, `🎴 ${username} drew a card!`, `cards/${player.card.filename}`);

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
          sendBotMessage(io, room, `❌ No game in progress.`);
          return;
        }

        if (data.isRunning) {
          sendBotMessage(io, room, `❌ Cannot leave during game! Wait for round to finish.`);
          return;
        }

        const playerIndex = data.players.findIndex(p => p.username === username);
        if (playerIndex === -1) {
          sendBotMessage(io, room, `❌ ${username} is not in this game!`);
          return;
        }

        // Refund the bet
        tambahCoin(userId, data.bet);
        data.players.splice(playerIndex, 1);
        sendBotMessage(io, room, `👋 ${username} left the game. Bet refunded.`);
        break;
      }

      case '!help': {
        const helpText = `🎮 LowCard Commands:
!start <bet> - Start a new elimination game (min 500 COIN)
!j - Join current game
!d - Draw your card in current round
!leave - Leave game (before it starts)
!status - Check bot status
!help - Show this help

🎯 Game Rules:
- Minimum bet: 500 COIN
- Each round, lowest card gets eliminated
- Game continues until 1 player remains
- Winner takes the pot (minus 10% house cut)`;
        sendBotMessage(io, room, helpText);
        break;
      }
    }
}

export function handleLowCardBot(io: Server, socket: any): void {
  console.log('Setting up LowCard bot command listener for socket:', socket.id);

  // Handle the command directly if socket.on is not available
  if (typeof socket.on !== 'function') {
    console.log('Socket.on not available, handling command directly');
    return;
  }

  socket.on('command', (room: string, msg: string) => {
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
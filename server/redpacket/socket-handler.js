/**
 * Red Packet Socket.IO Event Handlers
 */

import { 
  createRedPacket, 
  claimRedPacket, 
  getActivePackets,
  getPacketDetails 
} from './redpacket.js';

/**
 * Setup red packet socket events
 */
export function setupRedPacketEvents(io, socket) {
  
  // Create red packet (admin/user sends via modal UI)
  socket.on('create-red-packet', async (data) => {
    const { roomId, senderId, senderName, totalAmount, totalSlots, message } = data;
    
    console.log(`[RedPacket] User ${senderName} creating packet in room ${roomId}: ${totalAmount} credits, ${totalSlots} slots`);
    
    const result = await createRedPacket(roomId, senderId, senderName, totalAmount, totalSlots, message);
    
    if (result.success) {
      // Broadcast to all users in room (including sender)
      io.to(roomId).emit('red-packet-dropped', {
        packet: result.packet,
        animation: 'drop' // Trigger falling animation
      });
      
      // Send success to creator
      socket.emit('red-packet-created', {
        success: true,
        packetId: result.packet.id
      });
      
      console.log(`[RedPacket] ✅ Packet ${result.packet.id} broadcasted to room ${roomId}`);
    } else {
      // Send error to creator only
      socket.emit('red-packet-created', {
        success: false,
        message: result.message
      });
      
      console.log(`[RedPacket] ❌ Failed to create packet: ${result.message}`);
    }
  });
  
  // Claim red packet (user clicks envelope)
  socket.on('claim-red-packet', async (data) => {
    const { packetId, userId, username, roomId } = data;
    
    console.log(`[RedPacket] User ${username} attempting to claim packet ${packetId}`);
    
    const result = await claimRedPacket(packetId, userId, username);
    
    if (result.success) {
      const claim = result.claim;
      
      // Send claim result to user
      socket.emit('red-packet-claimed-success', {
        packetId: claim.packetId,
        amount: claim.amount,
        senderName: claim.senderName
      });
      
      // Broadcast update to room
      io.to(roomId).emit('red-packet-update', {
        packetId: claim.packetId,
        roomId: roomId, // Include roomId for client routing
        remainingSlots: claim.remainingSlots,
        remainingAmount: claim.remainingAmount,
        status: claim.status,
        claimInfo: {
          userId: claim.userId,
          username: claim.username,
          amount: claim.amount
        }
      });
      
      // If completed, remove from display
      if (claim.status === 'completed') {
        io.to(roomId).emit('red-packet-completed', {
          packetId: claim.packetId
        });
      }
      
      console.log(`[RedPacket] ✅ ${username} claimed ${claim.amount} from packet ${packetId}`);
    } else {
      // Send error to claimer only
      socket.emit('red-packet-claimed-error', {
        packetId,
        message: result.message
      });
      
      console.log(`[RedPacket] ❌ ${username} failed to claim: ${result.message}`);
    }
  });
  
  // Get active packets in room
  socket.on('get-active-red-packets', async (data) => {
    const { roomId } = data;
    
    const packets = await getActivePackets(roomId);
    
    socket.emit('active-red-packets', {
      roomId,
      packets
    });
  });
  
  // Get packet details (for viewing claims history)
  socket.on('get-red-packet-details', async (data) => {
    const { packetId } = data;
    
    const details = await getPacketDetails(packetId);
    
    socket.emit('red-packet-details', {
      packetId,
      details
    });
  });
}

/**
 * Notify room about red packet expiry
 */
export function notifyPacketExpired(io, roomId, packetId) {
  io.to(roomId).emit('red-packet-expired', {
    packetId
  });
}

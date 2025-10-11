/**
 * Red Packet System - UI Modal Based
 * 
 * Admin creates red packet via modal UI:
 * - Input total coin amount
 * - Input number of users who can claim
 * - Send → Red envelope animation drops
 * 
 * Users click envelope to claim random amount
 */

import { pool } from './database.js';

const EXPIRY_MINUTES = 5; // Red packet expires after 5 minutes

/**
 * Random distribution algorithm (WeChat style)
 * Ensures fairness - everyone gets at least 1 coin
 */
function distributeRandomly(totalAmount, slots) {
  if (slots === 1) return [totalAmount];
  
  const amounts = [];
  let remaining = totalAmount;
  
  for (let i = 0; i < slots - 1; i++) {
    // Calculate safe range
    const min = 1;
    const max = Math.floor(remaining - (slots - i - 1));
    
    // Random amount within range
    const amount = Math.floor(Math.random() * (max - min + 1)) + min;
    
    amounts.push(amount);
    remaining -= amount;
  }
  
  // Last slot gets remaining
  amounts.push(remaining);
  
  // Shuffle for fairness
  return amounts.sort(() => Math.random() - 0.5);
}

/**
 * Create new red packet
 */
export async function createRedPacket(roomId, senderId, senderName, totalAmount, totalSlots, message = '') {
  try {
    // Validate inputs
    if (totalAmount < totalSlots) {
      return { success: false, message: 'Total amount must be at least equal to number of slots!' };
    }
    
    if (totalSlots < 1 || totalSlots > 50) {
      return { success: false, message: 'Slots must be between 1 and 50!' };
    }

    // Check sender has enough credits
    const creditsResult = await pool.query(
      'SELECT balance FROM user_credits WHERE user_id = $1',
      [senderId]
    );

    if (creditsResult.rows.length === 0 || creditsResult.rows[0].balance < totalAmount) {
      return { success: false, message: 'Insufficient credits!' };
    }

    // Deduct credits from sender
    await pool.query(
      'UPDATE user_credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [totalAmount, senderId]
    );

    // Record transaction
    await pool.query(
      `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
       VALUES ($1, $1, $2, 'red_packet_send', $3)`,
      [senderId, totalAmount, `Red Packet: ${message || 'Lucky Money'}`]
    );

    // Create red packet
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
    
    const result = await pool.query(
      `INSERT INTO red_packets 
       (room_id, sender_id, sender_name, total_amount, total_slots, remaining_slots, remaining_amount, message, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING *`,
      [roomId, senderId, senderName, totalAmount, totalSlots, totalSlots, totalAmount, message, expiresAt]
    );

    const packet = result.rows[0];

    console.log(`[RedPacket] Created packet ${packet.id} by ${senderName} in room ${roomId}: ${totalAmount} credits, ${totalSlots} slots`);

    return {
      success: true,
      packet: {
        id: packet.id,
        roomId: packet.room_id,
        senderId: packet.sender_id,
        senderName: packet.sender_name,
        totalAmount: packet.total_amount,
        totalSlots: packet.total_slots,
        remainingSlots: packet.remaining_slots,
        remainingAmount: packet.remaining_amount,
        message: packet.message,
        expiresAt: packet.expires_at,
        status: packet.status
      }
    };
  } catch (error) {
    console.error('[RedPacket] Error creating packet:', error);
    return { success: false, message: 'Failed to create red packet' };
  }
}

/**
 * Claim red packet
 */
export async function claimRedPacket(packetId, userId, username) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get packet with lock
    const packetResult = await client.query(
      'SELECT * FROM red_packets WHERE id = $1 FOR UPDATE',
      [packetId]
    );

    if (packetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Red packet not found!' };
    }

    const packet = packetResult.rows[0];

    // Check if expired
    if (new Date() > new Date(packet.expires_at)) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Red packet expired!' };
    }

    // Check if already claimed by this user
    const claimCheck = await client.query(
      'SELECT * FROM red_packet_claims WHERE packet_id = $1 AND user_id = $2',
      [packetId, userId]
    );

    if (claimCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You already claimed this red packet!' };
    }

    // Check if packet still has slots
    if (packet.remaining_slots <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'All red packets claimed!' };
    }

    // Calculate random amount for this claim
    const amounts = distributeRandomly(packet.remaining_amount, packet.remaining_slots);
    const claimAmount = amounts[0]; // Take first amount from randomized array

    // Record claim
    await client.query(
      `INSERT INTO red_packet_claims (packet_id, user_id, username, amount)
       VALUES ($1, $2, $3, $4)`,
      [packetId, userId, username, claimAmount]
    );

    // Update packet
    const newRemainingSlots = packet.remaining_slots - 1;
    const newRemainingAmount = packet.remaining_amount - claimAmount;
    const newStatus = newRemainingSlots === 0 ? 'completed' : 'active';

    await client.query(
      `UPDATE red_packets 
       SET remaining_slots = $1, remaining_amount = $2, status = $3
       WHERE id = $4`,
      [newRemainingSlots, newRemainingAmount, newStatus, packetId]
    );

    // Add credits to user
    await client.query(
      'UPDATE user_credits SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [claimAmount, userId]
    );

    // Record transaction
    await client.query(
      `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
       VALUES ($1, $2, $3, 'red_packet_claim', $4)`,
      [packet.sender_id, userId, claimAmount, `Red Packet from ${packet.sender_name}`]
    );

    await client.query('COMMIT');

    console.log(`[RedPacket] ${username} claimed ${claimAmount} from packet ${packetId} (${newRemainingSlots} slots left)`);

    return {
      success: true,
      claim: {
        packetId,
        userId,
        username,
        amount: claimAmount,
        remainingSlots: newRemainingSlots,
        remainingAmount: newRemainingAmount,
        status: newStatus,
        senderName: packet.sender_name
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[RedPacket] Error claiming packet:', error);
    return { success: false, message: 'Failed to claim red packet' };
  } finally {
    client.release();
  }
}

/**
 * Get active red packets in room
 */
export async function getActivePackets(roomId) {
  try {
    const result = await pool.query(
      `SELECT * FROM red_packets 
       WHERE room_id = $1 AND status = 'active' AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [roomId]
    );

    return result.rows.map(packet => ({
      id: packet.id,
      roomId: packet.room_id,
      senderId: packet.sender_id,
      senderName: packet.sender_name,
      totalAmount: packet.total_amount,
      totalSlots: packet.total_slots,
      remainingSlots: packet.remaining_slots,
      remainingAmount: packet.remaining_amount,
      message: packet.message,
      expiresAt: packet.expires_at,
      status: packet.status
    }));
  } catch (error) {
    console.error('[RedPacket] Error fetching active packets:', error);
    return [];
  }
}

/**
 * Get packet details with claims
 */
export async function getPacketDetails(packetId) {
  try {
    const packetResult = await pool.query(
      'SELECT * FROM red_packets WHERE id = $1',
      [packetId]
    );

    if (packetResult.rows.length === 0) {
      return null;
    }

    const packet = packetResult.rows[0];

    const claimsResult = await pool.query(
      'SELECT * FROM red_packet_claims WHERE packet_id = $1 ORDER BY claimed_at ASC',
      [packetId]
    );

    return {
      ...packet,
      claims: claimsResult.rows
    };
  } catch (error) {
    console.error('[RedPacket] Error fetching packet details:', error);
    return null;
  }
}

/**
 * Auto-expire red packets (cron job)
 */
export async function expireOldPackets() {
  try {
    // Get expired packets with remaining amount
    const expiredResult = await pool.query(
      `SELECT * FROM red_packets 
       WHERE status = 'active' AND expires_at < NOW() AND remaining_amount > 0`
    );

    for (const packet of expiredResult.rows) {
      // Refund remaining amount to sender
      await pool.query(
        'UPDATE user_credits SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [packet.remaining_amount, packet.sender_id]
      );

      // Record refund transaction
      await pool.query(
        `INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
         VALUES ($1, $2, $3, 'red_packet_refund', 'Expired red packet refund')`,
        [packet.sender_id, packet.sender_id, packet.remaining_amount]
      );

      // Mark as expired
      await pool.query(
        "UPDATE red_packets SET status = 'expired' WHERE id = $1",
        [packet.id]
      );

      console.log(`[RedPacket] Expired packet ${packet.id}, refunded ${packet.remaining_amount} to user ${packet.sender_id}`);
    }

    return expiredResult.rows.length;
  } catch (error) {
    console.error('[RedPacket] Error expiring packets:', error);
    return 0;
  }
}

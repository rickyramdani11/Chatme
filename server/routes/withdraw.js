
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Get exchange rate
router.get('/exchange-rate', async (req, res) => {
  try {
    // In a real application, you would fetch this from a financial API
    const exchangeRate = {
      usdToIdr: 15500, // Example rate
      minWithdrawCoins: 155000, // Minimum coins for withdrawal (equivalent to $10 USD)
      timestamp: new Date().toISOString()
    };

    res.json(exchangeRate);
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

// Get user's gift earnings balance
router.get('/user/gift-earnings-balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get gift earnings balance
    const balanceResult = await pool.query(`
      SELECT balance, total_earned
      FROM user_gift_earnings_balance 
      WHERE user_id = $1
    `, [userId]);

    let balance = 0;
    let totalEarned = 0;

    if (balanceResult.rows.length > 0) {
      balance = balanceResult.rows[0].balance || 0;
      totalEarned = balanceResult.rows[0].total_earned || 0;
    }

    // Get total withdrawn amount
    const withdrawnResult = await pool.query(`
      SELECT COALESCE(SUM(amount_coins), 0) as total_withdrawn
      FROM withdrawal_requests 
      WHERE user_id = $1 AND status = 'completed'
    `, [userId]);

    const totalWithdrawn = parseInt(withdrawnResult.rows[0]?.total_withdrawn || 0);

    // Calculate USD equivalent (1 coin = 1 IDR, 15500 IDR = 1 USD)
    const exchangeRate = 15500;
    const balanceUSD = balance / exchangeRate;

    // Check if user can withdraw (minimum 155,000 coins = $10 USD)
    const minWithdrawCoins = 155000;
    const canWithdraw = balance >= minWithdrawCoins;

    res.json({
      balance,
      totalEarned,
      totalWithdrawn,
      balanceUSD: parseFloat(balanceUSD.toFixed(2)),
      canWithdraw
    });

  } catch (error) {
    console.error('Error fetching gift earnings balance:', error);
    res.status(500).json({ error: 'Failed to fetch gift earnings balance' });
  }
});

// Get user's linked accounts
router.get('/user/linked-accounts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT id, account_type, account_name, account_number, holder_name, created_at
      FROM user_linked_accounts 
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `, [userId]);

    const accounts = result.rows.map(row => ({
      id: row.id.toString(),
      type: row.account_type,
      name: row.account_name,
      accountNumber: row.account_number,
      accountName: row.holder_name,
      createdAt: row.created_at
    }));

    res.json({ accounts });

  } catch (error) {
    console.error('Error fetching linked accounts:', error);
    res.status(500).json({ error: 'Failed to fetch linked accounts' });
  }
});

// Link a new account
router.post('/user/link-account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId, accountName, accountNumber, holderName, type } = req.body;

    if (!accountId || !accountName || !accountNumber || !holderName || !type) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['bank', 'ewallet'].includes(type)) {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    // Create user_linked_accounts table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_linked_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        account_id VARCHAR(50) NOT NULL,
        account_name VARCHAR(100) NOT NULL,
        account_number VARCHAR(50) NOT NULL,
        holder_name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if account already exists
    const existingAccount = await pool.query(`
      SELECT id FROM user_linked_accounts 
      WHERE user_id = $1 AND account_number = $2 AND is_active = true
    `, [userId, accountNumber]);

    if (existingAccount.rows.length > 0) {
      return res.status(400).json({ error: 'Account already linked' });
    }

    // Insert new account
    const result = await pool.query(`
      INSERT INTO user_linked_accounts 
      (user_id, account_type, account_id, account_name, account_number, holder_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [userId, type, accountId, accountName, accountNumber, holderName]);

    const newAccount = result.rows[0];

    res.json({
      success: true,
      message: 'Account linked successfully',
      account: {
        id: newAccount.id.toString(),
        type: newAccount.account_type,
        name: newAccount.account_name,
        accountNumber: newAccount.account_number,
        accountName: newAccount.holder_name
      }
    });

  } catch (error) {
    console.error('Error linking account:', error);
    res.status(500).json({ error: 'Failed to link account' });
  }
});

// Submit withdrawal request
router.post('/user/withdraw', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, accountId, currency = 'USD' } = req.body;

    if (!amount || !accountId) {
      return res.status(400).json({ error: 'Amount and account ID are required' });
    }

    if (amount < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal is $10 USD' });
    }

    // Get user's gift earnings balance
    const balanceResult = await pool.query(`
      SELECT balance FROM user_gift_earnings_balance WHERE user_id = $1
    `, [userId]);

    if (balanceResult.rows.length === 0) {
      return res.status(400).json({ error: 'No gift earnings balance found' });
    }

    const currentBalance = balanceResult.rows[0].balance || 0;
    const exchangeRate = 15500; // 1 USD = 15500 IDR
    const requiredCoins = amount * exchangeRate;

    if (currentBalance < requiredCoins) {
      return res.status(400).json({ 
        error: 'Insufficient gift earnings balance',
        required: requiredCoins,
        available: currentBalance
      });
    }

    // Verify linked account exists
    const accountResult = await pool.query(`
      SELECT * FROM user_linked_accounts 
      WHERE id = $1 AND user_id = $2 AND is_active = true
    `, [accountId, userId]);

    if (accountResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid account ID' });
    }

    const linkedAccount = accountResult.rows[0];

    // Create withdrawal_requests table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount_usd DECIMAL(10,2) NOT NULL,
        amount_coins INTEGER NOT NULL,
        amount_idr DECIMAL(12,2) NOT NULL,
        account_id INTEGER NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        account_details JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        fee_percentage DECIMAL(5,2) DEFAULT 3.0,
        net_amount_idr DECIMAL(12,2) NOT NULL,
        payout_id VARCHAR(255),
        xendit_status VARCHAR(50),
        xendit_response JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        notes TEXT
      )
    `);

    // Idempotent migrations
    await pool.query(`
      DO $$ 
      BEGIN
        -- Drop wrong FK pointing to user_payout_accounts if exists
        IF EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_class r ON r.oid = c.confrelid
          WHERE t.relname = 'withdrawal_requests'
            AND c.conname = 'withdrawal_requests_account_id_fkey'
            AND r.relname <> 'user_linked_accounts'
        ) THEN
          ALTER TABLE withdrawal_requests DROP CONSTRAINT withdrawal_requests_account_id_fkey;
        END IF;

        -- Add correct FK to user_linked_accounts if missing
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_class r ON r.oid = c.confrelid
          WHERE t.relname = 'withdrawal_requests'
            AND c.conname = 'withdrawal_requests_account_id_fkey'
            AND r.relname = 'user_linked_accounts'
        ) THEN
          ALTER TABLE withdrawal_requests
            ADD CONSTRAINT withdrawal_requests_account_id_fkey
            FOREIGN KEY (account_id) REFERENCES user_linked_accounts(id) ON DELETE CASCADE;
        END IF;

        -- Ensure FK to users exists
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'withdrawal_requests_user_id_fkey'
        ) THEN
          ALTER TABLE withdrawal_requests
            ADD CONSTRAINT withdrawal_requests_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        -- Add Xendit columns if not exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'withdrawal_requests' AND column_name = 'payout_id'
        ) THEN
          ALTER TABLE withdrawal_requests ADD COLUMN payout_id VARCHAR(255);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'withdrawal_requests' AND column_name = 'xendit_status'
        ) THEN
          ALTER TABLE withdrawal_requests ADD COLUMN xendit_status VARCHAR(50);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'withdrawal_requests' AND column_name = 'xendit_response'
        ) THEN
          ALTER TABLE withdrawal_requests ADD COLUMN xendit_response JSONB;
        END IF;
      END $$;
    `);

    // Calculate amounts
    const amountCoins = Math.floor(amount * exchangeRate);
    const grossAmountIdr = amount * exchangeRate;
    const feePercentage = 3.0; // 3% fee
    const netAmountIdr = grossAmountIdr * (1 - feePercentage / 100);

    // Start transaction with dedicated client
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Atomically deduct from gift earnings balance with balance check
      const balanceUpdateResult = await client.query(`
        UPDATE user_gift_earnings_balance 
        SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2 AND balance >= $1
        RETURNING balance
      `, [amountCoins, userId]);

      if (balanceUpdateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ 
          error: 'Insufficient balance or concurrent withdrawal detected',
          required: amountCoins,
          available: currentBalance
        });
      }

      // Insert withdrawal request
      const withdrawalResult = await client.query(`
        INSERT INTO withdrawal_requests 
        (user_id, amount_usd, amount_coins, amount_idr, account_id, account_type, account_details, net_amount_idr)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId, 
        amount, 
        amountCoins,
        grossAmountIdr,
        accountId, 
        linkedAccount.account_type,
        JSON.stringify({
          accountName: linkedAccount.account_name,
          accountNumber: linkedAccount.account_number,
          holderName: linkedAccount.holder_name
        }),
        netAmountIdr
      ]);

      const withdrawal = withdrawalResult.rows[0];

      // Create Xendit payout
      try {
        // Map account to Xendit channel code (all uppercase for e-wallets, ID_ prefix for banks)
        let channelCode;
        if (linkedAccount.account_type === 'bank') {
          // Bank mapping based on account_name
          const bankMapping = {
            'BCA': 'ID_BCA',
            'MANDIRI': 'ID_MANDIRI',
            'BNI': 'ID_BNI',
            'BRI': 'ID_BRI',
            'CIMB': 'ID_CIMB',
            'PERMATA': 'ID_PERMATA'
          };
          channelCode = bankMapping[linkedAccount.account_name?.toUpperCase()];
          if (!channelCode) {
            throw new Error(`Unsupported bank: ${linkedAccount.account_name}`);
          }
        } else {
          // E-wallet mapping (Payout API v2 requires ID_ prefix for Indonesia)
          const ewalletMapping = {
            'GOPAY': 'ID_GOPAY',
            'OVO': 'ID_OVO',
            'DANA': 'ID_DANA',
            'LINKAJA': 'ID_LINKAJA',
            'SHOPEEPAY': 'ID_SHOPEEPAY'
          };
          channelCode = ewalletMapping[linkedAccount.account_name?.toUpperCase()];
          if (!channelCode) {
            throw new Error(`Unsupported e-wallet: ${linkedAccount.account_name}`);
          }
        }
        
        // Xendit Payout API v2 format (snake_case required fields only)
        const payoutData = {
          reference_id: `WD-${withdrawal.id}-${Date.now()}`,
          channel_code: channelCode,
          channel_properties: {
            account_holder_name: linkedAccount.holder_name || linkedAccount.account_name,
            account_number: linkedAccount.account_number
          },
          amount: Math.floor(netAmountIdr),
          currency: 'IDR',
          description: `Withdrawal for user ${userId}`
        };

        console.log('🚀 Sending Xendit payout via raw HTTP:', JSON.stringify(payoutData, null, 2));

        // Call Xendit Payout API v2 directly (SDK v7.0.0 is broken)
        // Using Basic Auth: base64(XENDIT_SECRET_KEY:)
        const xenditSecretKey = process.env.XENDIT_SECRET_KEY;
        const authHeader = 'Basic ' + Buffer.from(xenditSecretKey + ':').toString('base64');
        
        const xenditResponse = await fetch('https://api.xendit.co/v2/payouts', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Idempotency-key': `withdrawal-${withdrawal.id}`
          },
          body: JSON.stringify(payoutData)
        });

        if (!xenditResponse.ok) {
          const errorData = await xenditResponse.json();
          throw new Error(`Xendit API error: ${JSON.stringify(errorData)}`);
        }

        const xenditPayout = await xenditResponse.json();
        console.log('✅ Xendit payout created:', xenditPayout);

        // Update withdrawal with Xendit payout details
        await client.query(`
          UPDATE withdrawal_requests 
          SET payout_id = $1, xendit_status = $2, xendit_response = $3, status = $4
          WHERE id = $5
        `, [
          xenditPayout.id,
          xenditPayout.status,
          JSON.stringify(xenditPayout),
          'processing',
          withdrawal.id
        ]);

        await client.query('COMMIT');

        res.json({
          success: true,
          message: 'Withdrawal request submitted to Xendit successfully',
          withdrawal: {
            id: withdrawal.id.toString(),
            amountUsd: withdrawal.amount_usd,
            amountCoins: withdrawal.amount_coins,
            netAmountIdr: withdrawal.net_amount_idr,
            status: 'processing',
            xenditPayoutId: xenditPayout.id,
            xenditStatus: xenditPayout.status,
            createdAt: withdrawal.created_at
          }
        });

      } catch (xenditError) {
        console.error('Xendit payout error:', xenditError);
        
        // Update withdrawal with error details (use 'rejected' status, not 'failed')
        await client.query(`
          UPDATE withdrawal_requests 
          SET status = $1, notes = $2, xendit_response = $3
          WHERE id = $4
        `, [
          'rejected',
          `Xendit error: ${xenditError.message}`,
          JSON.stringify({ error: xenditError.message }),
          withdrawal.id
        ]);

        await client.query('COMMIT');

        return res.status(500).json({ 
          error: 'Failed to process payout with Xendit',
          details: xenditError.message
        });
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Get withdrawal history
router.get('/withdrawals/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT * FROM withdrawal_requests 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    const withdrawals = result.rows.map(row => ({
      id: row.id.toString(),
      amountUsd: parseFloat(row.amount_usd),
      amountCoins: row.amount_coins,
      netAmountIdr: parseFloat(row.net_amount_idr),
      status: row.status,
      accountType: row.account_type,
      accountDetails: row.account_details,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      notes: row.notes
    }));

    res.json({ withdrawals });

  } catch (error) {
    console.error('Error fetching withdrawal history:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal history' });
  }
});

module.exports = router;

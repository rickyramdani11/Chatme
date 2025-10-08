
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

// Dynamic exchange rate (fetched from server)
const MIN_WITHDRAW_USD = 10;

interface BankAccount {
  id: string;
  type: 'bank' | 'ewallet';
  name: string;
  accountNumber: string;
  accountName: string;
}

export default function WithdrawScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [giftEarningsBalance, setGiftEarningsBalance] = useState({
    balance: 0,
    totalEarned: 0,
    totalWithdrawn: 0,
    balanceUSD: 0,
    canWithdraw: false
  });
  const [loading, setLoading] = useState(true);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [exchangeRate, setExchangeRate] = useState({
    usdToIdr: 15500, // fallback
    minWithdrawCoins: 155000,
    timestamp: null
  });
  const [showAccountLinkModal, setShowAccountLinkModal] = useState(false);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<'bank' | 'ewallet'>('bank');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const ewalletOptions = [
    { id: 'dana', name: 'DANA', icon: 'wallet' },
    { id: 'ovo', name: 'OVO', icon: 'wallet' },
    { id: 'gopay', name: 'GoPay', icon: 'wallet' },
    { id: 'linkaja', name: 'LinkAja', icon: 'wallet' }
  ];

  const bankOptions = [
    { id: 'bri', name: 'BRI', icon: 'business' },
    { id: 'danamon', name: 'DANAMON', icon: 'business' },
    { id: 'jago', name: 'JAGO', icon: 'business' },
    { id: 'bca', name: 'BCA', icon: 'business' },
    { id: 'mandiri', name: 'MANDIRI', icon: 'business' }
  ];

  useEffect(() => {
    fetchExchangeRate();
    fetchUserBalance();
    fetchLinkedAccounts();
  }, []);

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/withdraw/exchange-rate`);
      if (response.ok) {
        const data = await response.json();
        setExchangeRate({
          usdToIdr: data.usdToIdr,
          minWithdrawCoins: data.minWithdrawCoins,
          timestamp: data.timestamp
        });
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      // Keep fallback values
    }
  };

  const fetchUserBalance = async () => {
    try {

      const response = await fetch(`${API_BASE_URL}/withdraw/user/gift-earnings-balance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setGiftEarningsBalance({
          balance: data.balance || 0,
          totalEarned: data.totalEarned || 0,
          totalWithdrawn: data.totalWithdrawn || 0,
          balanceUSD: data.balanceUSD || 0,
          canWithdraw: data.canWithdraw || false
        });
      }
    } catch (error) {
      console.error('Error fetching gift earnings balance:', error);
    } finally {
      setLoading(false);
    }
  };


  const fetchLinkedAccounts = async () => {
    try {

      const response = await fetch(`${API_BASE_URL}/withdraw/user/linked-accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLinkedAccounts(data.accounts || []);
      }
    } catch (error: any) {
      console.error('Error fetching linked accounts:', error);
    }
  };

  const handleLinkAccount = (option: any, type: 'bank' | 'ewallet') => {
    setSelectedOption(option);
    setSelectedType(type);
    setAccountNumber('');
    setAccountHolderName('');
    setShowBankModal(false);
    setShowAccountLinkModal(true);
  };

  const handleChangeAccountRequest = async () => {
    setIsSendingOtp(true);
    try {
      const response = await fetch(`${API_BASE_URL}/withdraw/user/send-change-account-otp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setShowOtpModal(true);
        Alert.alert('OTP Sent', 'Kode OTP telah dikirim ke email Anda untuk keamanan');
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to send OTP');
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      Alert.alert('Error', 'Gagal mengirim OTP. Periksa koneksi Anda.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpValue || otpValue.length !== 6) {
      Alert.alert('Error', 'Masukkan 6 digit kode OTP');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const response = await fetch(`${API_BASE_URL}/withdraw/user/verify-change-account-otp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ otp: otpValue })
      });

      if (response.ok) {
        setShowOtpModal(false);
        setOtpValue('');
        setShowBankModal(true);
        Alert.alert('Verified', 'OTP berhasil diverifikasi!');
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Invalid OTP');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      Alert.alert('Error', 'Gagal memverifikasi OTP');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSubmitAccountLink = async () => {
    if (!accountNumber.trim()) {
      Alert.alert('Error', 'Please enter account number');
      return;
    }
    if (!accountHolderName.trim()) {
      Alert.alert('Error', 'Please enter account holder name');
      return;
    }
    if (accountNumber.length < 8) {
      Alert.alert('Error', 'Account number must be at least 8 digits');
      return;
    }

    setIsLinking(true);
    try {
      await linkAccountToServer(
        selectedOption.id,
        selectedOption.name,
        accountNumber.trim(),
        accountHolderName.trim(),
        selectedType
      );
      setShowAccountLinkModal(false);
      setAccountNumber('');
      setAccountHolderName('');
    } catch (error) {
      // Error handling is done in linkAccountToServer
    } finally {
      setIsLinking(false);
    }
  };

  const formatAccountNumber = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    // Limit to 20 digits (reasonable max for account numbers)
    return cleaned.substring(0, 20);
  };

  const linkAccountToServer = async (
    accountId: string, 
    accountName: string, 
    accountNumber: string, 
    holderName: string, 
    type: 'bank' | 'ewallet'
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/withdraw/user/link-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId,
          accountName,
          accountNumber,
          holderName,
          type
        })
      });

      if (response.ok) {
        Alert.alert('Success', 'Account linked successfully!');
        fetchLinkedAccounts();
      } else {
        // Try to parse as JSON, fallback to text
        let errorMessage = 'Failed to link account';
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch (jsonError) {
            console.error('Failed to parse error response as JSON:', jsonError);
          }
        } else {
          // Response is not JSON (probably HTML error page)
          const textResponse = await response.text();
          console.error('Non-JSON error response:', textResponse);
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }
        
        Alert.alert('Error', errorMessage);
        throw new Error('Failed to link account');
      }
    } catch (error) {
      console.error('Error linking account:', error);
      if (error instanceof TypeError) {
        Alert.alert('Error', 'Network error. Please check your connection.');
      } else if (error instanceof Error && !error.message.includes('Failed to link account')) {
        Alert.alert('Error', 'An unexpected error occurred');
      }
      throw error;
    }
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    
    if (!selectedAccount) {
      Alert.alert('Error', 'Please select a linked account');
      return;
    }

    if (!amount || amount < MIN_WITHDRAW_USD) {
      Alert.alert('Error', `Minimum withdrawal is $${MIN_WITHDRAW_USD} USD`);
      return;
    }

    if (!giftEarningsBalance.canWithdraw) {
      Alert.alert(
        'Insufficient Gift Earnings',
        `You need at least 155,000 coins from gift earnings to withdraw.\nYour current gift earnings: ${giftEarningsBalance.balance.toLocaleString()} coins ($${giftEarningsBalance.balanceUSD.toFixed(2)} USD)`
      );
      return;
    }

    if (amount > giftEarningsBalance.balanceUSD) {
      Alert.alert(
        'Insufficient Balance',
        `You only have $${giftEarningsBalance.balanceUSD.toFixed(2)} USD available for withdrawal.\nRequested: $${amount} USD`
      );
      return;
    }

    const idrAmount = amount * exchangeRate.usdToIdr;
    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw $${amount} USD (Rp${idrAmount.toLocaleString()}) from gift earnings to ${selectedAccount.name}?\n\nAccount: ${selectedAccount.accountNumber}\nFee: 3% (Rp${(idrAmount * 0.03).toLocaleString()})\nYou'll receive: Rp${(idrAmount * 0.97).toLocaleString()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: processWithdrawal }
      ]
    );
  };

  const processWithdrawal = async () => {
    setIsProcessing(true);
    try {

      const response = await fetch(`${API_BASE_URL}/withdraw/user/withdraw`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parseFloat(withdrawAmount),
          accountId: selectedAccount?.id,
          currency: 'USD'
        })
      });

      if (response.ok) {
        Alert.alert('Success', 'Withdrawal request submitted successfully!');
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        setSelectedAccount(null);
        fetchUserBalance();
      } else {
        Alert.alert('Error', 'Failed to process withdrawal');
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      Alert.alert('Error', 'Failed to process withdrawal');
    } finally {
      setIsProcessing(false);
    }
  };

  const MenuButton = ({ icon, title, subtitle, onPress, iconColor = "#666" }: any) => (
    <TouchableOpacity style={styles.menuButton} onPress={onPress}>
      <View style={styles.menuButtonLeft}>
        <Ionicons name={icon} size={24} color={iconColor} />
        <View style={styles.menuButtonText}>
          <Text style={styles.menuButtonTitle}>{title}</Text>
          {subtitle && <Text style={styles.menuButtonSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#9C27B0" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw</Text>
        <View style={{width: 24}} />
      </View>

      <ScrollView style={styles.content}>
        {/* Gift Earnings Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceTitle}>Gift Earnings (Withdrawable)</Text>
          <View style={styles.balanceRow}>
            <View style={styles.coinIcon} />
            <Text style={styles.balanceAmount}>{giftEarningsBalance.balance.toLocaleString()}</Text>
            <Text style={styles.balanceIdr}>≈${giftEarningsBalance.balanceUSD.toFixed(2)} USD (1 USD = {exchangeRate.usdToIdr.toLocaleString()} IDR)</Text>
          </View>
          <View style={styles.earningsInfo}>
            <Text style={styles.earningsText}>Total Earned: {giftEarningsBalance.totalEarned.toLocaleString()} coins</Text>
            <Text style={styles.earningsText}>Total Withdrawn: {giftEarningsBalance.totalWithdrawn.toLocaleString()} coins</Text>
          </View>
          <TouchableOpacity 
            style={[styles.withdrawButton, !giftEarningsBalance.canWithdraw && styles.disabledWithdrawButton]}
            onPress={() => {
              if (!giftEarningsBalance.canWithdraw) {
                Alert.alert('Minimum Not Met', 'You need at least 155,000 coins (from gift earnings) to withdraw');
                return;
              }
              if (linkedAccounts.length === 0) {
                Alert.alert('No Linked Accounts', 'Please link a bank account or e-wallet first');
                return;
              }
              setShowWithdrawModal(true);
            }}
          >
            <Ionicons name={giftEarningsBalance.canWithdraw ? "cash" : "lock-closed"} size={16} color="#666" />
            <Text style={styles.withdrawButtonText}>
              {giftEarningsBalance.canWithdraw ? 'Tarik saldo' : 'Minimal 155k coins'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Linked Accounts Section */}
        {linkedAccounts.length > 0 ? (
          <View style={styles.linkedAccountSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleLarge}>Ikat kartu bank</Text>
              <TouchableOpacity 
                onPress={handleChangeAccountRequest}
                style={styles.changeButton}
                disabled={isSendingOtp}
              >
                {isSendingOtp ? (
                  <ActivityIndicator size="small" color="#FF69B4" />
                ) : (
                  <Text style={styles.changeButtonText}>mau ubah?</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <View style={styles.walletSection}>
              <Text style={styles.walletTitle}>WALLET</Text>
              
              {linkedAccounts.map((account, index) => (
                <View key={account.id} style={styles.accountCard}>
                  <View style={styles.accountCardInfo}>
                    <Text style={styles.accountLabel}>Negara & Mata Uang</Text>
                    <Text style={styles.accountValue}>Indonesia&IDR</Text>
                  </View>
                  
                  <View style={styles.accountCardInfo}>
                    <Text style={styles.accountLabel}>Nama</Text>
                    <Text style={styles.accountValue}>
                      {account.accountName.substring(0, 1)}***{account.accountName.slice(-1)}
                    </Text>
                  </View>
                  
                  <View style={styles.accountCardInfo}>
                    <Text style={styles.accountLabel}>Akun</Text>
                    <Text style={styles.accountValue}>
                      {account.accountNumber.substring(0, 1)}{'*'.repeat(account.accountNumber.length - 2)}{account.accountNumber.slice(-1)}
                    </Text>
                  </View>
                </View>
              ))}
              
              <Text style={styles.linkedSuccessText}>
                Kartu bank telah berhasil diikat, <Text style={styles.changeLink}>mau ubah?</Text>
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.menuSection}>
            <MenuButton
              icon="card"
              title="Ikat kartu bank"
              subtitle="Ubah pengikatan"
              onPress={() => setShowBankModal(true)}
              iconColor="#9C27B0"
            />
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <MenuButton
            icon="receipt"
            title="Riwayat penarikan"
            onPress={() => navigation.navigate('WithdrawHistory')}
            iconColor="#9C27B0"
          />

          <MenuButton
            icon="information-circle"
            title="Detail koin"
            onPress={() => Alert.alert('Detail Koin', '1 Koin = 1 IDR\n1 USD = 15,500 IDR\nMinimal penarikan: $10 USD')}
            iconColor="#9C27B0"
          />
        </View>

        {/* Gift Earnings Details */}
        <View style={styles.giftEarningsSection}>
          <Text style={styles.sectionTitleLarge}>Pendapatan dari Gift</Text>
          <View style={styles.giftEarningsCard}>
            <View style={styles.giftEarningsInfo}>
              <Text style={styles.giftEarningsText}>
                Total pendapatan dari gift (setelah dipotong 70%):
              </Text>
              <Text style={styles.giftEarningsAmount}>
                {giftEarningsBalance.balance.toLocaleString()} coins
              </Text>
              <Text style={styles.giftEarningsUsd}>
                ≈ ${giftEarningsBalance.balanceUSD.toFixed(2)} USD
              </Text>
            </View>
            <View style={styles.giftExample}>
              <View style={styles.giftExampleRow}>
                <Text style={styles.giftIcon}>❤️</Text>
                <View style={styles.giftExampleInfo}>
                  <Text style={styles.giftExampleName}>Love</Text>
                  <Text style={styles.giftExamplePrice}>500 coins → 150 coins (30%)</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Information */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Keterangan</Text>
          <Text style={styles.infoText}>
            1. Hanya ketika saldo mencapai 155000 koin ($10 USD) baru dapat ditarik, fungsi penarikan otomatis mingguan ini dapat dipicu.
          </Text>
          <Text style={styles.infoText}>
            2. Setelah persyaratan terpenuhi, pendapatan yang dapat ditarik akan ditarik secara otomatis dalam waktu tiga hari kerja pada minggu ini.
          </Text>
          <Text style={styles.infoText}>
            3. Jumlah penarikan bergantung nilai tukar USD ke IDR.
          </Text>
          <Text style={styles.infoText}>
            4. Jika kartu bank tidak terikat, fungsi tarik tunai otomatis tidak akan terpicu.
          </Text>
        </View>
      </ScrollView>

      {/* Bank Linking Modal */}
      <Modal
        visible={showBankModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBankModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link Account</Text>
              <TouchableOpacity onPress={() => setShowBankModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.sectionTitle}>E-Wallet</Text>
              {ewalletOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.optionButton}
                  onPress={() => handleLinkAccount(option, 'ewallet')}
                >
                  <Ionicons name={option.icon as any} size={24} color="#9C27B0" />
                  <Text style={styles.optionText}>{option.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              ))}

              <Text style={styles.sectionTitle}>Bank</Text>
              {bankOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.optionButton}
                  onPress={() => handleLinkAccount(option, 'bank')}
                >
                  <Ionicons name={option.icon as any} size={24} color="#9C27B0" />
                  <Text style={styles.optionText}>{option.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Withdraw Modal */}
      <Modal
        visible={showWithdrawModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Funds</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Select Account</Text>
              {linkedAccounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[
                    styles.accountOption,
                    selectedAccount?.id === account.id && styles.selectedAccount
                  ]}
                  onPress={() => setSelectedAccount(account)}
                >
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountNumber}>**** {account.accountNumber.slice(-4)}</Text>
                  </View>
                  {selectedAccount?.id === account.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Amount (USD)</Text>
              <TextInput
                style={styles.input}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder={`Minimum $${MIN_WITHDRAW_USD} USD`}
                keyboardType="numeric"
              />

              {withdrawAmount && (
                <View style={styles.conversionInfo}>
                  <Text style={styles.conversionText}>
                    ${withdrawAmount} USD = Rp{(parseFloat(withdrawAmount || '0') * exchangeRate.usdToIdr).toLocaleString()}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.withdrawSubmitButton, isProcessing && styles.disabledButton]}
                onPress={handleWithdraw}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.withdrawSubmitText}>Submit Withdrawal</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Account Linking Modal */}
      <Modal
        visible={showAccountLinkModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAccountLinkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Link {selectedOption?.name} Account
              </Text>
              <TouchableOpacity onPress={() => setShowAccountLinkModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.accountTypeInfo}>
                {selectedType === 'bank' ? 'Bank Account' : 'E-Wallet'}: {selectedOption?.name}
              </Text>

              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={styles.input}
                value={accountNumber}
                onChangeText={(text) => setAccountNumber(formatAccountNumber(text))}
                placeholder="Enter account number"
                keyboardType="numeric"
                maxLength={20}
              />

              <Text style={styles.label}>Account Holder Name</Text>
              <TextInput
                style={styles.input}
                value={accountHolderName}
                onChangeText={setAccountHolderName}
                placeholder="Enter account holder name"
                autoCapitalize="words"
                maxLength={50}
              />

              <TouchableOpacity
                style={[styles.linkSubmitButton, isLinking && styles.disabledButton]}
                onPress={handleSubmitAccountLink}
                disabled={isLinking}
              >
                {isLinking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="link" size={16} color="#fff" />
                    <Text style={styles.linkSubmitText}>Link Account</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* OTP Verification Modal */}
      <Modal
        visible={showOtpModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowOtpModal(false);
          setOtpValue('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verifikasi OTP</Text>
              <TouchableOpacity onPress={() => {
                setShowOtpModal(false);
                setOtpValue('');
              }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.otpInfoBox}>
                <Ionicons name="shield-checkmark" size={32} color="#9C27B0" />
                <Text style={styles.otpInfoText}>
                  Untuk keamanan, kode OTP telah dikirim ke email Anda
                </Text>
              </View>

              <Text style={styles.label}>Masukkan Kode OTP (6 digit)</Text>
              <TextInput
                style={styles.otpInput}
                value={otpValue}
                onChangeText={(text) => setOtpValue(text.replace(/\D/g, '').substring(0, 6))}
                placeholder="000000"
                keyboardType="numeric"
                maxLength={6}
                autoFocus={true}
              />

              <TouchableOpacity
                style={[styles.verifyOtpButton, isVerifyingOtp && styles.disabledButton]}
                onPress={handleVerifyOtp}
                disabled={isVerifyingOtp}
              >
                {isVerifyingOtp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.verifyOtpText}>Verifikasi OTP</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendOtpButton}
                onPress={handleChangeAccountRequest}
                disabled={isSendingOtp}
              >
                <Text style={styles.resendOtpText}>
                  {isSendingOtp ? 'Mengirim...' : 'Kirim Ulang OTP'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  balanceCard: {
    backgroundColor: '#4A148C',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  balanceTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  coinIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFD700',
    marginRight: 10,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 10,
  },
  balanceIdr: {
    color: '#E1BEE7',
    fontSize: 16,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  withdrawButtonText: {
    color: '#666',
    fontWeight: '500',
    marginLeft: 8,
  },
  earningsInfo: {
    marginTop: 10,
    marginBottom: 10,
  },
  earningsText: {
    color: '#E1BEE7',
    fontSize: 14,
    marginBottom: 2,
  },
  disabledWithdrawButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  menuSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuButtonText: {
    marginLeft: 12,
  },
  menuButtonTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  menuButtonSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 10,
  },
  selectedAccount: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8E9',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  accountNumber: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  conversionInfo: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  conversionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  withdrawSubmitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  withdrawSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  accountTypeInfo: {
    fontSize: 16,
    color: '#9C27B0',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
    backgroundColor: '#F3E5F5',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  linkSubmitButton: {
    backgroundColor: '#9C27B0',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 30,
  },
  linkSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  // New styles for linked accounts display
  linkedAccountSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitleLarge: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  changeButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  changeButtonText: {
    color: '#FF69B4',
    fontSize: 14,
    fontWeight: '500',
  },
  walletSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 15,
  },
  walletTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 15,
    letterSpacing: 1,
  },
  accountCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  accountCardInfo: {
    marginBottom: 12,
  },
  accountLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  accountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  linkedSuccessText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  changeLink: {
    color: '#FF69B4',
    fontWeight: '500',
  },
  // Gift earnings section styles
  giftEarningsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  giftEarningsCard: {
    backgroundColor: '#F0F8F4',
    borderRadius: 8,
    padding: 15,
  },
  giftEarningsInfo: {
    marginBottom: 15,
  },
  giftEarningsText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  giftEarningsAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 5,
  },
  giftEarningsUsd: {
    fontSize: 16,
    color: '#666',
  },
  giftExample: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 15,
  },
  giftExampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  giftIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  giftExampleInfo: {
    flex: 1,
  },
  giftExampleName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  giftExamplePrice: {
    fontSize: 14,
    color: '#666',
  },
  // OTP Modal styles
  otpInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  otpInfoText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    lineHeight: 20,
  },
  otpInput: {
    borderWidth: 2,
    borderColor: '#9C27B0',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 8,
    backgroundColor: '#fff',
  },
  verifyOtpButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 20,
  },
  verifyOtpText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  resendOtpButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 15,
  },
  resendOtpText: {
    color: '#9C27B0',
    fontSize: 14,
    fontWeight: '500',
  },
});

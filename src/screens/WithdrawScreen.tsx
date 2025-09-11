
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

const USD_TO_IDR = 15500;
const MIN_WITHDRAW_USD = 10;

interface BankAccount {
  id: string;
  type: 'bank' | 'ewallet';
  name: string;
  accountNumber: string;
  accountName: string;
}

export default function WithdrawScreen({ navigation }: any) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

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
    fetchUserBalance();
    fetchLinkedAccounts();
  }, []);

  const fetchUserBalance = async () => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/user/balance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedAccounts = async () => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/user/linked-accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLinkedAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching linked accounts:', error);
    }
  };

  const handleLinkAccount = (option: any, type: 'bank' | 'ewallet') => {
    Alert.prompt(
      `Link ${option.name} Account`,
      `Enter your ${option.name} account number:`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Next', 
          onPress: (accountNumber) => {
            if (accountNumber) {
              Alert.prompt(
                'Account Name',
                'Enter account holder name:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Link', 
                    onPress: (accountName) => {
                      if (accountName) {
                        linkAccountToServer(option.id, option.name, accountNumber, accountName, type);
                      }
                    }
                  }
                ]
              );
            }
          }
        }
      ],
      'plain-text'
    );
    setShowBankModal(false);
  };

  const linkAccountToServer = async (
    accountId: string, 
    accountName: string, 
    accountNumber: string, 
    holderName: string, 
    type: 'bank' | 'ewallet'
  ) => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/user/link-account`, {
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
        Alert.alert('Error', 'Failed to link account');
      }
    } catch (error) {
      console.error('Error linking account:', error);
      Alert.alert('Error', 'Failed to link account');
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

    const requiredCoins = amount * USD_TO_IDR;
    if (balance < requiredCoins) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${requiredCoins.toLocaleString()} coins to withdraw $${amount} USD.\nYour current balance: ${balance.toLocaleString()} coins`
      );
      return;
    }

    const idrAmount = amount * USD_TO_IDR;
    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw $${amount} USD (Rp${idrAmount.toLocaleString()}) to ${selectedAccount.name}?\n\nAccount: ${selectedAccount.accountNumber}\nFee: 3% (Rp${(idrAmount * 0.03).toLocaleString()})\nYou'll receive: Rp${(idrAmount * 0.97).toLocaleString()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: processWithdrawal }
      ]
    );
  };

  const processWithdrawal = async () => {
    setIsProcessing(true);
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/user/withdraw`, {
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
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceTitle}>Koin saya</Text>
          <View style={styles.balanceRow}>
            <View style={styles.coinIcon} />
            <Text style={styles.balanceAmount}>{balance.toLocaleString()}</Text>
            <Text style={styles.balanceIdr}>≈Rp{(balance).toLocaleString()}</Text>
          </View>
          <TouchableOpacity 
            style={styles.withdrawButton}
            onPress={() => {
              if (linkedAccounts.length === 0) {
                Alert.alert('No Linked Accounts', 'Please link a bank account or e-wallet first');
                return;
              }
              setShowWithdrawModal(true);
            }}
          >
            <Ionicons name="lock-closed" size={16} color="#666" />
            <Text style={styles.withdrawButtonText}>Tarik saldo</Text>
          </TouchableOpacity>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <MenuButton
            icon="card"
            title="Ikat kartu bank"
            subtitle="Ubah pengikatan"
            onPress={() => setShowBankModal(true)}
            iconColor="#9C27B0"
          />

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
                    ${withdrawAmount} USD = Rp{(parseFloat(withdrawAmount || '0') * USD_TO_IDR).toLocaleString()}
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
});

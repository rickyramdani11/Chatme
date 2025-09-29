
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';


export default function CreditScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [balance, setBalance] = useState(0);
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    fetchBalance();
    fetchTransactionHistory();
  }, []);

  useEffect(() => {
    // Listen for navigation focus to refresh balance
    const unsubscribe = navigation.addListener('focus', () => {
      fetchBalance();
      fetchTransactionHistory();
    });

    return unsubscribe;
  }, [navigation]);

  const fetchBalance = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/credits/balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const fetchTransactionHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/credits/history`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching transaction history:', error);
    }
  };

  const handleSendCredits = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username harus diisi');
      return;
    }

    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Error', 'Jumlah kredit harus berupa angka positif');
      return;
    }

    if (!pin.trim()) {
      Alert.alert('Error', 'PIN harus diisi');
      return;
    }

    if (Number(amount) > balance) {
      Alert.alert('Error', 'Saldo tidak mencukupi');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/credits/transfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toUsername: username.trim(),
          amount: Number(amount),
          pin: pin.trim()
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Berhasil', 'Kredit berhasil dikirim!');
        setUsername('');
        setAmount('');
        setPin('');
        fetchBalance();
        fetchTransactionHistory();
      } else {
        Alert.alert('Error', data.error || 'Gagal mengirim kredit');
      }
    } catch (error) {
      console.error('Error sending credits:', error);
      Alert.alert('Error', 'Gagal mengirim kredit. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const showTransactionHistory = () => {
    navigation.navigate('TransactionHistory');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#9C27B0', '#E91E63']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kredit</Text>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={showTransactionHistory}
        >
          <Ionicons name="time" size={24} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Balance Section */}
      <View style={styles.balanceSection}>
        <View style={styles.userInfoContainer}>
          <Text style={styles.usernameText}>{user?.username || 'User'}</Text>
          <View style={styles.balanceContainer}>
            <Ionicons name="diamond" size={24} color="#FFD700" />
            <Text style={styles.balanceText}>{balance.toLocaleString()}</Text>
            <Text style={styles.coinLabel}>Coins</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Kirim Kredit</Text>
          
          {/* Username Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username Penerima</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Masukkan username"
              autoCapitalize="none"
            />
          </View>

          {/* Amount Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Jumlah Kredit</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="Masukkan jumlah"
              keyboardType="numeric"
            />
          </View>

          {/* PIN Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>PIN</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={setPin}
              placeholder="Masukkan PIN (default: 123456)"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
            />
          </View>

          {/* Send Button */}
          <TouchableOpacity
            style={styles.sendButtonContainer}
            onPress={handleSendCredits}
            disabled={loading}
          >
            <LinearGradient
              colors={['#9C27B0', '#E91E63']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendButton}
            >
              <Text style={styles.sendButtonText}>
                {loading ? 'Mengirim...' : 'Kirim'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Recent Transactions */}
          {transactions.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>Transaksi Terbaru</Text>
              {transactions.slice(0, 3).map((transaction: any, index: number) => (
                <View key={index} style={styles.transactionItem}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                      {transaction.type === 'send' ? 'Kirim ke' : 'Terima dari'} {transaction.otherUser}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {new Date(transaction.createdAt).toLocaleDateString('id-ID')}
                    </Text>
                  </View>
                  <Text style={[
                    styles.transactionAmount,
                    { color: transaction.type === 'send' ? '#F44336' : '#4CAF50' }
                  ]}>
                    {transaction.type === 'send' ? '-' : '+'}{transaction.amount.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  historyButton: {
    padding: 8,
  },
  balanceSection: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfoContainer: {
    alignItems: 'center',
  },
  usernameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  coinLabel: {
    fontSize: 16,
    color: '#666',
    marginLeft: 4,
  },
  scrollView: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    fontSize: 16,
    color: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonContainer: {
    marginTop: 20,
    marginBottom: 30,
    alignItems: 'center',
  },
  sendButton: {
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  recentSection: {
    marginTop: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

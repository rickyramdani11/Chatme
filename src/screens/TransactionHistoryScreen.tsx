
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';


interface Transaction {
  id: number;
  amount: number;
  type: 'send' | 'receive';
  otherUser: string;
  createdAt: string;
  status?: 'success' | 'failed';
}

export default function TransactionHistoryScreen({ navigation }: any) {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactionHistory();
  }, []);

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
      } else {
        Alert.alert('Error', 'Gagal mengambil riwayat transaksi');
      }
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      Alert.alert('Error', 'Gagal mengambil riwayat transaksi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactionHistory();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const getTransactionIcon = (type: string) => {
    return type === 'send' ? 'arrow-up-circle' : 'arrow-down-circle';
  };

  const getTransactionColor = (type: string, status?: string) => {
    if (status === 'failed') return '#FF8C00'; // Orange for failed
    return type === 'send' ? '#F44336' : '#4CAF50';
  };

  const getStatusText = (status?: string) => {
    if (status === 'failed') return 'FAILED';
    return 'SUCCESS';
  };

  return (
    <View style={styles.container}>
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
        <Text style={styles.headerTitle}>Riwayat Transaksi</Text>
        <View style={styles.placeholder} />
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Memuat riwayat...</Text>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Belum ada transaksi</Text>
              <Text style={styles.emptySubtext}>
                Transaksi kredit Anda akan muncul di sini
              </Text>
            </View>
          ) : (
            transactions.map((transaction, index) => (
              <View key={index} style={styles.transactionCard}>
                <View style={styles.transactionHeader}>
                  <View style={styles.transactionInfo}>
                    <View style={styles.transactionTitleRow}>
                      <Ionicons
                        name={getTransactionIcon(transaction.type)}
                        size={24}
                        color={getTransactionColor(transaction.type, transaction.status)}
                      />
                      <Text style={styles.transactionTitle}>
                        {transaction.type === 'send' ? 'Kirim ke' : 'Terima dari'}
                      </Text>
                    </View>
                    <Text style={styles.username}>@{transaction.otherUser}</Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(transaction.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.amountContainer}>
                    <Text style={[
                      styles.transactionAmount,
                      { color: getTransactionColor(transaction.type, transaction.status) }
                    ]}>
                      {transaction.type === 'send' ? '-' : '+'}
                      {transaction.amount.toLocaleString()}
                    </Text>
                    <Text style={[
                      styles.statusText,
                      { color: getTransactionColor(transaction.type, transaction.status) }
                    ]}>
                      {getStatusText(transaction.status)}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.transactionFooter}>
                  <View style={styles.divider} />
                  <Text style={styles.transactionId}>
                    ID: {transaction.id}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
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
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  transactionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  username: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#9C27B0',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  transactionFooter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginBottom: 8,
  },
  transactionId: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },
});

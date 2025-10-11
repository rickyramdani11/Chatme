
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

interface WithdrawalItem {
  id: number;
  amountUSD: number;
  amountCoins: number;
  amountIDR: number;
  netAmountIDR: number;
  status: string;
  date: string;
  accountType: string;
  accountName: string;
  accountNumber: string;
  holderName: string;
  payoutId?: string;
  xenditStatus?: string;
  refunded: boolean;
}

export default function WithdrawHistoryScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWithdrawHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/withdraw/user/history`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setWithdrawalHistory(data.history || []);
      } else {
        console.error('Failed to fetch withdrawal history');
      }
    } catch (error) {
      console.error('Error fetching withdrawal history:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWithdrawHistory();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchWithdrawHistory();
  }, []);

  const getStatusColor = (status: string, refunded: boolean) => {
    if (refunded) return '#FF5722'; // Red for refunded
    switch (status.toLowerCase()) {
      case 'completed':
        return '#4CAF50'; // Green
      case 'processing':
        return '#2196F3'; // Blue
      case 'pending':
        return '#FF9800'; // Orange
      case 'failed':
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Gray
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Withdraw History</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading withdrawal history...</Text>
          </View>
        ) : withdrawalHistory.length > 0 ? (
          withdrawalHistory.map((withdrawal) => (
            <View key={withdrawal.id} style={styles.historyItem}>
              {/* Amount Section */}
              <View style={styles.amountSection}>
                <Text style={styles.amountLabel}>Amount</Text>
                <Text style={styles.amountValue}>
                  ${withdrawal.amountUSD.toFixed(2)} USD
                </Text>
                <Text style={styles.amountSubtext}>
                  {withdrawal.amountCoins.toLocaleString()} coins → Rp{withdrawal.netAmountIDR.toLocaleString()}
                </Text>
              </View>

              {/* Account Info */}
              <View style={styles.infoRow}>
                <Ionicons 
                  name={withdrawal.accountType === 'bank' ? 'business' : 'wallet'} 
                  size={16} 
                  color="#666" 
                />
                <Text style={styles.infoText}>
                  {withdrawal.accountName} - {withdrawal.accountNumber.slice(-4).padStart(withdrawal.accountNumber.length, '•')}
                </Text>
              </View>

              {/* Date */}
              <View style={styles.infoRow}>
                <Ionicons name="calendar" size={16} color="#666" />
                <Text style={styles.infoText}>
                  {new Date(withdrawal.date).toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </View>

              {/* Status Badge */}
              <View style={styles.statusContainer}>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(withdrawal.status, withdrawal.refunded) }
                ]}>
                  <Text style={styles.statusText}>
                    {withdrawal.refunded ? 'REFUNDED' : withdrawal.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Xendit Status (if available) */}
              {withdrawal.xenditStatus && (
                <Text style={styles.xenditStatus}>
                  Xendit: {withdrawal.xenditStatus}
                </Text>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No withdrawal history found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 5,
    marginRight: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  historyItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  amountSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  amountLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  amountSubtext: {
    fontSize: 12,
    color: '#666',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  statusContainer: {
    marginTop: 8,
    alignItems: 'flex-start',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  xenditStatus: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});

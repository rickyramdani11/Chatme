
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

export default function WithdrawHistoryScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [withdrawalHistory, setWithdrawalHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWithdrawHistory = async () => {
    try {
      setLoading(true);
      // Add your API call here to fetch withdrawal history
      // const response = await fetch(`${API_BASE_URL}/withdrawals/history`, {
      //   headers: {
      //     'Authorization': `Bearer ${token}`,
      //     'Content-Type': 'application/json',
      //   },
      // });
      // const data = await response.json();
      // setWithdrawalHistory(data);
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
          withdrawalHistory.map((withdrawal, index) => (
            <View key={index} style={styles.historyItem}>
              <Text style={styles.historyText}>
                Amount: {withdrawal.amount}
              </Text>
              <Text style={styles.historyDate}>
                Date: {withdrawal.date}
              </Text>
              <Text style={[
                styles.historyStatus,
                { color: withdrawal.status === 'completed' ? '#4CAF50' : '#FF9800' }
              ]}>
                Status: {withdrawal.status}
              </Text>
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
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  historyText: {
    fontSize: 16,
    marginBottom: 5,
  },
  historyDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  historyStatus: {
    fontSize: 14,
    fontWeight: 'bold',
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

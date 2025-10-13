import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://abed75e4-0074-4553-b02b-0ccf98d04bb1-00-3cbrqb7zslnfk.pike.replit.dev';

interface TransferRecord {
  id: number;
  adminId: number;
  adminUsername: string;
  action: string;
  resourceType: string;
  resourceId: number;
  details: {
    username: string;
    amount: number;
    reason: string;
  };
  status: string;
  createdAt: string;
}

interface AdminTransferHistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AdminTransferHistoryModal({ 
  visible, 
  onClose 
}: AdminTransferHistoryModalProps) {
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchTransferHistory();
    }
  }, [visible]);

  const fetchTransferHistory = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Authentication token not found');
        return;
      }

      const response = await axios.get(`${API_URL}/api/admin/audit-logs/transfers`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setTransfers(response.data.transfers);
      }
    } catch (error: any) {
      console.error('Error fetching transfer history:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to load transfer history');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Authentication token not found');
        return;
      }

      const response = await axios.get(`${API_URL}/api/admin/audit-logs/transfers`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setTransfers(response.data.transfers);
      }
    } catch (error: any) {
      console.error('Error refreshing transfer history:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to refresh transfer history');
    } finally {
      setRefreshing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const formatNumber = (num: number) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const renderTransferItem = ({ item }: { item: TransferRecord }) => {
    const details = typeof item.details === 'string' 
      ? JSON.parse(item.details) 
      : item.details;

    return (
      <View style={styles.transferItem}>
        <View style={styles.transferHeader}>
          <View style={styles.userInfo}>
            <Ionicons name="person-circle" size={20} color="#4a90e2" />
            <Text style={styles.username}>{details.username}</Text>
          </View>
          <Text style={styles.amount}>+{formatNumber(details.amount)} 💰</Text>
        </View>

        <View style={styles.transferDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="shield-checkmark" size={14} color="#666" />
            <Text style={styles.detailText}>Admin: {item.adminUsername}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Ionicons name="document-text" size={14} color="#666" />
            <Text style={styles.detailText}>Alasan: {details.reason}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="time" size={14} color="#666" />
            <Text style={styles.detailText}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>✓ {item.status}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#4a90e2', '#357abd', '#2c5aa0']}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Ionicons name="receipt" size={24} color="#fff" />
              <Text style={styles.headerTitle}>History Transfer Admin</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Memuat history...</Text>
              </View>
            ) : (
              <>
                <View style={styles.statsContainer}>
                  <Text style={styles.statsText}>
                    Total Transfer: {transfers.length} transaksi
                  </Text>
                </View>

                <FlatList
                  data={transfers}
                  renderItem={renderTransferItem}
                  keyExtractor={(item) => item.id.toString()}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      tintColor="#fff"
                      colors={['#fff']}
                    />
                  }
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Ionicons name="document-outline" size={48} color="#fff" />
                      <Text style={styles.emptyText}>Belum ada history transfer</Text>
                    </View>
                  }
                />
              </>
            )}

            {/* Refresh Button */}
            {!loading && (
              <TouchableOpacity 
                style={styles.refreshButton}
                onPress={fetchTransferHistory}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 5,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 14,
  },
  statsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
  },
  statsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  list: {
    maxHeight: 400,
  },
  listContent: {
    paddingBottom: 10,
  },
  transferItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
  },
  transferHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#27ae60',
  },
  transferDetails: {
    gap: 8,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#d4edda',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    color: '#155724',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    gap: 8,
  },
  refreshText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

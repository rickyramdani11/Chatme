import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../utils/apiConfig';

interface MerchantStatistics {
  mentorUsername: string;
  promotedAt: string;
  expiresAt: string;
  status: 'active' | 'expired';
  topupRequirement: number;
  monthlyTopup: number;
  totalTopUp: number;
  totalTransactions: number;
  currentMonthTopUp: number;
  currentMonthTransactions: number;
  topUpHistory: Array<{
    id: number;
    amount: number;
    description: string;
    createdAt: string;
    monthYear: string;
  }>;
}

export default function MerchantScreen() {
  const [statistics, setStatistics] = useState<MerchantStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('No token found for fetching statistics');
        Alert.alert('Error', 'Token tidak ditemukan. Silakan login ulang.');
        return;
      }

      console.log('Fetching merchant statistics from:', `${BASE_URL}/merchant/statistics`);
      const response = await fetch(`${BASE_URL}/merchant/statistics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Merchant statistics data:', data);
        setStatistics(data.statistics);
      } else {
        const errorText = await response.text();
        console.error('Fetch statistics failed:', response.status, errorText);
        Alert.alert('Error', `Gagal mengambil data statistik (Status: ${response.status})`);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat mengambil data statistik: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDaysLeft = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getProgressPercentage = () => {
    if (!statistics) return 0;
    return Math.min((statistics.currentMonthTopUp / statistics.topupRequirement) * 100, 100);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#F57C00', '#FF9800']}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Merchant Panel</Text>

        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={fetchStatistics}
        >
          <Ionicons name="refresh-outline" size={24} color="white" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF9800" />
            <Text style={styles.loadingText}>Memuat data...</Text>
          </View>
        ) : statistics ? (
          <>
            {/* Status Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Status Merchant</Text>
              <View style={styles.statusCard}>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Mentor:</Text>
                  <Text style={styles.statusValue}>{statistics.mentorUsername}</Text>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Status:</Text>
                  <View style={[styles.statusBadge, { 
                    backgroundColor: statistics.status === 'active' ? '#4CAF50' : '#F44336' 
                  }]}>
                    <Text style={styles.statusBadgeText}>
                      {statistics.status === 'active' ? 'AKTIF' : 'EXPIRED'}
                    </Text>
                  </View>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Dipromosikan:</Text>
                  <Text style={styles.statusValue}>{formatDate(statistics.promotedAt)}</Text>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Berakhir:</Text>
                  <Text style={[styles.statusValue, {
                    color: getDaysLeft(statistics.expiresAt) <= 7 ? '#F44336' : '#333'
                  }]}>
                    {formatDate(statistics.expiresAt)}
                  </Text>
                </View>
                {statistics.status === 'active' && (
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Sisa Waktu:</Text>
                    <Text style={[styles.statusValue, {
                      color: getDaysLeft(statistics.expiresAt) <= 7 ? '#F44336' : '#FF9800'
                    }]}>
                      {getDaysLeft(statistics.expiresAt)} hari
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Monthly Progress Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Progress Bulan Ini</Text>
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressAmount}>
                    {statistics.currentMonthTopUp.toLocaleString('id-ID')} / {statistics.topupRequirement.toLocaleString('id-ID')}
                  </Text>
                  <Text style={styles.progressPercentage}>{getProgressPercentage().toFixed(0)}%</Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${getProgressPercentage()}%` }]} />
                </View>
                <Text style={styles.progressLabel}>
                  Target Top Up Bulanan
                </Text>
              </View>
            </View>

            {/* Statistics Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Statistik Top Up</Text>
              <View style={styles.statsCard}>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Ionicons name="cash-outline" size={24} color="#4CAF50" />
                    <Text style={styles.statValue}>
                      {statistics.totalTopUp.toLocaleString('id-ID')}
                    </Text>
                    <Text style={styles.statLabel}>Total Top Up</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="receipt-outline" size={24} color="#2196F3" />
                    <Text style={styles.statValue}>{statistics.totalTransactions}</Text>
                    <Text style={styles.statLabel}>Total Transaksi</Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Ionicons name="trending-up-outline" size={24} color="#FF9800" />
                    <Text style={styles.statValue}>
                      {statistics.currentMonthTopUp.toLocaleString('id-ID')}
                    </Text>
                    <Text style={styles.statLabel}>Bulan Ini</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="calendar-outline" size={24} color="#9C27B0" />
                    <Text style={styles.statValue}>{statistics.currentMonthTransactions}</Text>
                    <Text style={styles.statLabel}>Transaksi Bulan Ini</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Top Up History */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Riwayat Top Up</Text>
              {statistics.topUpHistory.length > 0 ? (
                <>
                  {statistics.topUpHistory.map((item) => (
                    <View key={item.id} style={styles.historyItem}>
                      <View style={styles.historyIcon}>
                        <Ionicons name="arrow-up-circle" size={24} color="#4CAF50" />
                      </View>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyAmount}>
                          +{item.amount.toLocaleString('id-ID')} coins
                        </Text>
                        <Text style={styles.historyDescription}>{item.description}</Text>
                        <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="document-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>Belum ada riwayat top up</Text>
                </View>
              )}
            </View>

            {/* Info Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informasi</Text>
              <View style={styles.infoCard}>
                <View style={styles.infoItem}>
                  <Ionicons name="information-circle-outline" size={20} color="#FF9800" />
                  <Text style={styles.infoText}>
                    Status merchant berlaku selama 1 bulan. Pastikan melakukan top up minimal {statistics.topupRequirement.toLocaleString('id-ID')} coins per bulan.
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="warning-outline" size={20} color="#F44336" />
                  <Text style={styles.infoText}>
                    Jika tidak memenuhi target top up, status merchant akan expired dan kembali ke role user.
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Tidak ada data merchant</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  statusCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF9800',
  },
  progressLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  statsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  historyIcon: {
    marginRight: 12,
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  historyDescription: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },
});

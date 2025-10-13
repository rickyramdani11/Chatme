import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  FlatList,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../utils/apiConfig';

interface MerchantRecord {
  id: string;
  username: string;
  promoted_by: string;
  promoted_at: string;
  expires_at: string;
  status: 'active' | 'expired';
}

interface MentorStatistics {
  totalTopUp: number;
  totalMerchants: number;
  totalTransactions: number;
  monthlyTopUp: number;
  monthlyTransactions: number;
  merchantDetails: Array<{
    username: string;
    merchantId: number;
    totalTopUp: number;
    transactionCount: number;
    lastTopUpDate: string;
  }>;
}

export default function MentorScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [statistics, setStatistics] = useState<MentorStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const { user } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    fetchMerchants();
    fetchStatistics();
  }, []);

  const fetchMerchants = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('No token found for fetching merchants');
        Alert.alert('Error', 'Token tidak ditemukan. Silakan login ulang.');
        return;
      }

      console.log('Fetching merchants from:', `${BASE_URL}/mentor/merchants`);
      const response = await fetch(`${BASE_URL}/mentor/merchants`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('Fetch merchants response status:', response.status);
      
      if (response.ok) {
        const text = await response.text();
        console.log('Fetch merchants response text:', text);
        try {
          const data = JSON.parse(text);
          console.log('Parsed merchants data:', data);
          setMerchants(data.merchants || []);
          console.log('Merchants set successfully, count:', data.merchants?.length || 0);
        } catch (parseError) {
          console.error('JSON parse error:', parseError, 'Response text:', text);
          Alert.alert('Error', 'Gagal memproses data merchant');
        }
      } else {
        const errorText = await response.text();
        console.error('Fetch merchants failed:', response.status, response.statusText, 'Body:', errorText);
        Alert.alert('Error', `Gagal mengambil data merchant (Status: ${response.status})`);
      }
    } catch (error) {
      console.error('Error fetching merchants:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat mengambil data merchant: ' + error.message);
    }
  };

  const fetchStatistics = async () => {
    setStatsLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('No token found for fetching statistics');
        return;
      }

      console.log('Fetching statistics from:', `${BASE_URL}/mentor/statistics`);
      const response = await fetch(`${BASE_URL}/mentor/statistics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Statistics data:', data);
        setStatistics(data.statistics);
      } else {
        const errorText = await response.text();
        console.error('Fetch statistics failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const addMerchant = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username harus diisi');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Token tidak ditemukan. Silakan login ulang.');
        setLoading(false);
        return;
      }

      console.log('Adding merchant:', username.trim());
      console.log('Using token:', token ? 'Present' : 'Missing');

      const requestBody = { username: username.trim() };
      console.log('Request body:', requestBody);

      const response = await fetch(`${BASE_URL}/mentor/add-merchant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);
      const text = await response.text();
      console.log('Response text:', text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        Alert.alert('Error', 'Server response tidak valid');
        setLoading(false);
        return;
      }

      if (response.ok) {
        Alert.alert('Berhasil', data.message || 'Merchant berhasil ditambahkan');
        setUsername('');
        fetchMerchants();
      } else {
        Alert.alert('Error', data.error || `HTTP ${response.status}: Gagal menambah merchant`);
      }
    } catch (error) {
      console.error('Error adding merchant:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat menambah merchant: ' + error.message);
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

  const getStatusColor = (status: string) => {
    return status === 'active' ? '#4CAF50' : '#F44336';
  };

  const getDaysLeft = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const renderMerchantItem = ({ item }: { item: MerchantRecord }) => {
    const daysLeft = getDaysLeft(item.expires_at);

    return (
      <View style={styles.merchantItem}>
        <View style={styles.merchantHeader}>
          <View style={styles.merchantAvatar}>
            <Text style={styles.merchantAvatarText}>
              {item.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.merchantInfo}>
            <Text style={styles.merchantUsername}>{item.username}</Text>
            <Text style={styles.merchantPromoter}>
              Dipromosikan oleh: {item.promoted_by}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>
              {item.status === 'active' ? 'AKTIF' : 'EXPIRED'}
            </Text>
          </View>
        </View>

        <View style={styles.merchantDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              Tanggal Add: {formatDate(item.promoted_at)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              Expired: {formatDate(item.expires_at)}
            </Text>
          </View>
          {item.status === 'active' && (
            <View style={styles.detailRow}>
              <Ionicons 
                name="warning-outline" 
                size={16} 
                color={daysLeft <= 7 ? "#F44336" : "#FF9800"} 
              />
              <Text style={[
                styles.detailText,
                { color: daysLeft <= 7 ? "#F44336" : "#FF9800" }
              ]}>
                Sisa {daysLeft} hari
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Mentor Panel</Text>

        <TouchableOpacity 
          style={styles.historyButton}
          onPress={() => setShowHistory(true)}
        >
          <Ionicons name="list-outline" size={24} color="white" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Add Merchant Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tambah Merchant</Text>
          <View style={styles.addMerchantCard}>
            <Text style={styles.inputLabel}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Masukkan username"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />

            <TouchableOpacity 
              style={[styles.addButton, loading && styles.disabledButton]} 
              onPress={addMerchant}
              disabled={loading}
            >
              <LinearGradient
                colors={loading ? ['#ccc', '#999'] : ['#667eea', '#764ba2']}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Menambahkan...' : 'Add Merchant'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Traffic Statistics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Traffic Total Top Up</Text>
          {statsLoading ? (
            <View style={styles.statsCard}>
              <Text style={styles.loadingText}>Memuat statistik...</Text>
            </View>
          ) : statistics ? (
            <View style={styles.statsCard}>
              {/* Summary Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="cash-outline" size={24} color="#4CAF50" />
                  <Text style={styles.statValue}>
                    {statistics.totalTopUp.toLocaleString('id-ID')}
                  </Text>
                  <Text style={styles.statLabel}>Total Top Up</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="people-outline" size={24} color="#2196F3" />
                  <Text style={styles.statValue}>{statistics.totalMerchants}</Text>
                  <Text style={styles.statLabel}>Merchant Aktif</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="trending-up-outline" size={24} color="#FF9800" />
                  <Text style={styles.statValue}>
                    {statistics.monthlyTopUp.toLocaleString('id-ID')}
                  </Text>
                  <Text style={styles.statLabel}>Top Up Bulan Ini</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="receipt-outline" size={24} color="#9C27B0" />
                  <Text style={styles.statValue}>{statistics.totalTransactions}</Text>
                  <Text style={styles.statLabel}>Total Transaksi</Text>
                </View>
              </View>

              {/* Top Merchants */}
              {statistics.merchantDetails.length > 0 && (
                <View style={styles.topMerchantsSection}>
                  <Text style={styles.topMerchantsTitle}>Top Merchants</Text>
                  {statistics.merchantDetails.slice(0, 3).map((merchant, index) => (
                    <View key={merchant.merchantId} style={styles.topMerchantItem}>
                      <View style={styles.topMerchantRank}>
                        <Text style={styles.rankText}>#{index + 1}</Text>
                      </View>
                      <View style={styles.topMerchantInfo}>
                        <Text style={styles.topMerchantName}>{merchant.username}</Text>
                        <Text style={styles.topMerchantAmount}>
                          {merchant.totalTopUp.toLocaleString('id-ID')} coins
                        </Text>
                      </View>
                      <Text style={styles.topMerchantTransactions}>
                        {merchant.transactionCount}x
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.statsCard}>
              <Text style={styles.emptyText}>Belum ada data statistik</Text>
            </View>
          )}
        </View>

        {/* Recent Merchants */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Merchant Terbaru</Text>
          {merchants.slice(0, 3).map((merchant) => (
            <View key={merchant.id}>
              {renderMerchantItem({ item: merchant })}
            </View>
          ))}

          {merchants.length > 3 && (
            <TouchableOpacity 
              style={styles.viewAllButton}
              onPress={() => setShowHistory(true)}
            >
              <Text style={styles.viewAllText}>Lihat Semua ({merchants.length})</Text>
              <Ionicons name="chevron-forward" size={16} color="#667eea" />
            </TouchableOpacity>
          )}
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informasi</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoItem}>
              <Ionicons name="information-circle-outline" size={20} color="#667eea" />
              <Text style={styles.infoText}>
                User yang dipromosikan menjadi merchant akan otomatis berubah role dan warna.
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={20} color="#FF9800" />
              <Text style={styles.infoText}>
                Status merchant berlaku selama 1 bulan. Setelah expired akan kembali ke role user.
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="card-outline" size={20} color="#4CAF50" />
              <Text style={styles.infoText}>
                Merchant dapat memperpanjang status dengan recharge coin sebelum expired.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* History Modal */}
      <Modal
        visible={showHistory}
        animationType="slide"
        onRequestClose={() => setShowHistory(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowHistory(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>History Merchant</Text>
            <View style={{ width: 24 }} />
          </View>

          <FlatList
            data={merchants}
            renderItem={renderMerchantItem}
            keyExtractor={(item) => item.id}
            style={styles.modalList}
            showsVerticalScrollIndicator={false}
          />
        </SafeAreaView>
      </Modal>
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
  historyButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
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
  addMerchantCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    marginBottom: 16,
  },
  addButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  merchantItem: {
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
  merchantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  merchantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9C27B0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  merchantAvatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  merchantInfo: {
    flex: 1,
  },
  merchantUsername: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  merchantPromoter: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  merchantDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
    marginRight: 4,
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalList: {
    flex: 1,
    padding: 20,
  },
  // Traffic Statistics Styles
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
  loadingText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    padding: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    padding: 20,
  },
  topMerchantsSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  topMerchantsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  topMerchantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  topMerchantRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  topMerchantInfo: {
    flex: 1,
  },
  topMerchantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  topMerchantAmount: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
  },
  topMerchantTransactions: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
});
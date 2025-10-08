
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

interface HeadwearItem {
  id: string;
  name: string;
  image: string;
  price: number;
  duration: number; // days
  description: string;
}

interface UserHeadwear {
  id: string;
  headwearId: string;
  expiresAt: string;
  isActive: boolean;
}

interface FrameItem {
  id: string;
  name: string;
  image: string;
  price: number;
  duration: number; // days
  description: string;
}

interface UserFrame {
  id: string;
  frameId: string;
  expiresAt: string;
  isActive: boolean;
}

type StoreTab = 'frames' | 'headwear';
type ItemType = 'frame' | 'headwear';

export default function StoreScreen({ navigation }: any) {
  const { user, token, refreshUserData } = useAuth();
  const [balance, setBalance] = useState(0);
  const [headwearItems, setHeadwearItems] = useState<HeadwearItem[]>([]);
  const [userHeadwear, setUserHeadwear] = useState<UserHeadwear[]>([]);
  const [frameItems, setFrameItems] = useState<FrameItem[]>([]);
  const [userFrames, setUserFrames] = useState<UserFrame[]>([]);
  const [activeTab, setActiveTab] = useState<StoreTab>('frames');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<(HeadwearItem | FrameItem) | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType>('frame');

  useEffect(() => {
    fetchBalance();
    fetchHeadwearItems();
    fetchUserHeadwear();
    fetchFrameItems();
    fetchUserFrames();
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/credits/balance`, {
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

  const fetchHeadwearItems = async () => {
    try {
      console.log('Fetching headwear items from:', `${API_BASE_URL}/store/headwear`);
      const response = await fetch(`${API_BASE_URL}/store/headwear`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('Headwear response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Headwear data received:', data);
        setHeadwearItems(data.items || []);
        console.log('Total headwear items loaded:', (data.items || []).length);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch headwear:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error fetching headwear items:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserHeadwear = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/store/user-headwear`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserHeadwear(data.headwear || []);
      }
    } catch (error) {
      console.error('Error fetching user headwear:', error);
    }
  };

  const fetchFrameItems = async () => {
    try {
      console.log('Fetching frame items from:', `${API_BASE_URL}/store/frames`);
      const response = await fetch(`${API_BASE_URL}/store/frames`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('Frame response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Frame data received:', data);
        setFrameItems(data.items || []);
        console.log('Total frame items loaded:', (data.items || []).length);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch frames:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error fetching frame items:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserFrames = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/store/user-frames`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserFrames(data.frames || []);
      }
    } catch (error) {
      console.error('Error fetching user frames:', error);
    }
  };

  const handlePurchase = async () => {
    if (!selectedItem) return;

    if (balance < selectedItem.price) {
      Alert.alert('Coin Tidak Cukup', 'Anda tidak memiliki cukup coin untuk membeli item ini.');
      return;
    }

    setPurchasing(selectedItem.id);
    try {
      const endpoint = selectedItemType === 'frame' 
        ? `${API_BASE_URL}/frames/purchase`
        : `${API_BASE_URL}/headwear/purchase`;
      
      const bodyKey = selectedItemType === 'frame' ? 'frameId' : 'headwearId';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [bodyKey]: selectedItem.id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const itemTypeText = selectedItemType === 'frame' ? 'Frame' : 'Headwear';
        Alert.alert('Berhasil!', `${itemTypeText} "${selectedItem.name}" berhasil dibeli untuk ${selectedItem.duration} hari dan otomatis terpasang di profil Anda!`);
        setBalance(data.newBalance);
        if (selectedItemType === 'frame') {
          fetchUserFrames();
        } else {
          fetchUserHeadwear();
        }
        
        // Refresh user data to update avatarFrame in profile
        await refreshUserData();
        
        setShowPurchaseModal(false);
      } else {
        Alert.alert('Gagal', data.error || `Terjadi kesalahan saat membeli ${selectedItemType === 'frame' ? 'frame' : 'headwear'}`);
      }
    } catch (error) {
      console.error(`Error purchasing ${selectedItemType}:`, error);
      Alert.alert('Error', `Gagal membeli ${selectedItemType === 'frame' ? 'frame' : 'headwear'}`);
    } finally {
      setPurchasing(null);
    }
  };

  const isItemOwned = (itemId: string, itemType: ItemType) => {
    if (itemType === 'frame') {
      return userFrames.some(uf => 
        uf.frameId === itemId && 
        uf.isActive && 
        new Date(uf.expiresAt) > new Date()
      );
    } else {
      return userHeadwear.some(hw => 
        hw.headwearId === itemId && 
        hw.isActive && 
        new Date(hw.expiresAt) > new Date()
      );
    }
  };

  const getItemExpiry = (itemId: string, itemType: ItemType) => {
    if (itemType === 'frame') {
      const owned = userFrames.find(uf => 
        uf.frameId === itemId && 
        uf.isActive && 
        new Date(uf.expiresAt) > new Date()
      );
      return owned ? new Date(owned.expiresAt) : null;
    } else {
      const owned = userHeadwear.find(hw => 
        hw.headwearId === itemId && 
        hw.isActive && 
        new Date(hw.expiresAt) > new Date()
      );
      return owned ? new Date(owned.expiresAt) : null;
    }
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('id-ID');
  };

  const renderItem = (item: HeadwearItem | FrameItem, itemType: ItemType) => {
    const isOwned = isItemOwned(item.id, itemType);
    const expiry = getItemExpiry(item.id, itemType);

    return (
      <View key={item.id} style={styles.itemCard}>
        <View style={styles.itemImageContainer}>
          <Image 
            source={{ uri: item.image }} 
            style={styles.itemImage}
            resizeMode="cover"
          />
          {isOwned && (
            <View style={styles.ownedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
            </View>
          )}
        </View>
        
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemDescription}>{item.description}</Text>
          <Text style={styles.itemDuration}>{item.duration} hari</Text>
          
          {isOwned && expiry ? (
            <View style={styles.expiryContainer}>
              <Text style={styles.expiryText}>
                Berakhir: {expiry.toLocaleDateString('id-ID')}
              </Text>
            </View>
          ) : (
            <View style={styles.priceContainer}>
              <Ionicons name="diamond" size={16} color="#FFD700" />
              <Text style={styles.priceText}>{formatPrice(item.price)}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.buyButton,
            isOwned && styles.ownedButton,
            balance < item.price && !isOwned && styles.disabledButton
          ]}
          onPress={() => {
            if (isOwned) {
              Alert.alert('Sudah Dimiliki', `Anda sudah memiliki ${itemType === 'frame' ? 'frame' : 'headwear'} ini.`);
            } else {
              setSelectedItem(item);
              setSelectedItemType(itemType);
              setShowPurchaseModal(true);
            }
          }}
          disabled={isOwned || (balance < item.price && !isOwned)}
        >
          <Text style={[
            styles.buyButtonText,
            isOwned && styles.ownedButtonText,
            balance < item.price && !isOwned && styles.disabledButtonText
          ]}>
            {isOwned ? 'Dimiliki' : 'Beli'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Memuat toko...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#4CAF50', '#45A049']}
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
        <Text style={styles.headerTitle}>Toko</Text>
        <View style={styles.balanceContainer}>
          <Ionicons name="diamond" size={20} color="#FFD700" />
          <Text style={styles.balanceText}>{formatPrice(balance)}</Text>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'frames' && styles.activeTab]}
          onPress={() => setActiveTab('frames')}
        >
          <Text style={[styles.tabText, activeTab === 'frames' && styles.activeTabText]}>
            🖼️ Avatar Frames
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'headwear' && styles.activeTab]}
          onPress={() => setActiveTab('headwear')}
        >
          <Text style={[styles.tabText, activeTab === 'headwear' && styles.activeTabText]}>
            🎩 Headwear
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Frames Section */}
        {activeTab === 'frames' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <Text style={styles.sectionIcon}>🖼️</Text>
                <Text style={styles.sectionTitle}>Avatar Frames</Text>
              </View>
              <Text style={styles.sectionSubtitle}>Bingkai Avatar - Rental 14 Hari</Text>
            </View>

            <View style={styles.itemsGrid}>
              {frameItems.map(item => renderItem(item, 'frame'))}
            </View>

            {frameItems.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Belum ada frame tersedia</Text>
              </View>
            )}
          </View>
        )}

        {/* Headwear Section */}
        {activeTab === 'headwear' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <Text style={styles.sectionIcon}>🎩</Text>
                <Text style={styles.sectionTitle}>Headwear</Text>
              </View>
              <Text style={styles.sectionSubtitle}>Aksesoris Kepala Premium</Text>
            </View>

            <View style={styles.itemsGrid}>
              {headwearItems.map(item => renderItem(item, 'headwear'))}
            </View>

            {headwearItems.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Belum ada headwear tersedia</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Purchase Confirmation Modal */}
      <Modal
        visible={showPurchaseModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPurchaseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Konfirmasi Pembelian</Text>
              <TouchableOpacity onPress={() => setShowPurchaseModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <View style={styles.modalContent}>
                <Image 
                  source={{ uri: selectedItem.image }} 
                  style={styles.modalItemImage}
                  resizeMode="cover"
                />
                <Text style={styles.modalItemName}>{selectedItem.name}</Text>
                <Text style={styles.modalItemDescription}>{selectedItem.description}</Text>
                
                <View style={styles.purchaseDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Durasi:</Text>
                    <Text style={styles.detailValue}>{selectedItem.duration} hari</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Harga:</Text>
                    <View style={styles.priceRow}>
                      <Ionicons name="diamond" size={16} color="#FFD700" />
                      <Text style={styles.detailPrice}>{formatPrice(selectedItem.price)}</Text>
                    </View>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Saldo Anda:</Text>
                    <View style={styles.priceRow}>
                      <Ionicons name="diamond" size={16} color="#FFD700" />
                      <Text style={styles.detailBalance}>{formatPrice(balance)}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowPurchaseModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, purchasing && styles.disabledButton]}
                    onPress={handlePurchase}
                    disabled={!!purchasing}
                  >
                    {purchasing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmButtonText}>Beli Sekarang</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
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
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  balanceText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  activeTab: {
    backgroundColor: '#4CAF50',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginLeft: 32,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  itemCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemImageContainer: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  ownedBadge: {
    position: 'absolute',
    top: -5,
    right: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 4,
  },
  itemInfo: {
    marginBottom: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  itemDuration: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  priceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 4,
  },
  expiryContainer: {
    marginTop: 8,
    backgroundColor: '#E8F5E8',
    padding: 6,
    borderRadius: 6,
  },
  expiryText: {
    fontSize: 11,
    color: '#4CAF50',
    textAlign: 'center',
  },
  buyButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  ownedButton: {
    backgroundColor: '#E0E0E0',
  },
  disabledButton: {
    backgroundColor: '#BDBDBD',
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  ownedButtonText: {
    color: '#666',
  },
  disabledButtonText: {
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    maxWidth: 400,
    width: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    padding: 20,
    alignItems: 'center',
  },
  modalItemImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  modalItemName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  modalItemDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  purchaseDetails: {
    width: '100%',
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 4,
  },
  detailBalance: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginLeft: 4,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

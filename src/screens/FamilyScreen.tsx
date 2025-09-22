
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

interface Family {
  id: string;
  name: string;
  description: string;
  logo: string;
  members: number;
  maxMembers: number;
  level: number;
  isJoined: boolean;
  type: 'AGENCY' | 'FAMILY';
}

export default function FamilyScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userFamily, setUserFamily] = useState<Family | null>(null);

  useEffect(() => {
    fetchFamilies();
    fetchUserFamily();
  }, []);

  const fetchFamilies = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/families`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setFamilies(data);
      }
    } catch (error) {
      console.error('Error fetching families:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserFamily = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${user?.id}/family`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserFamily(data);
      }
    } catch (error) {
      console.error('Error fetching user family:', error);
    }
  };

  const handleJoinFamily = async (familyId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/families/${familyId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        Alert.alert('Berhasil', 'Anda berhasil bergabung dengan family!');
        fetchFamilies();
        fetchUserFamily();
      } else {
        const error = await response.json();
        Alert.alert('Error', error.message || 'Gagal bergabung dengan family');
      }
    } catch (error) {
      console.error('Error joining family:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat bergabung');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchFamilies(), fetchUserFamily()]);
    setRefreshing(false);
  };

  const FamilyHeader = () => (
    <View style={styles.headerContainer}>
      <Image 
        source={{ uri: 'https://via.placeholder.com/400x150/4CAF50/FFFFFF?text=Family+Ranking' }}
        style={styles.headerImage}
      />
      <View style={styles.headerOverlay}>
        <Text style={styles.headerTitle}>Family Ranking</Text>
      </View>
    </View>
  );

  const UserFamilyStatus = () => (
    <View style={styles.statusContainer}>
      {userFamily ? (
        <View style={styles.joinedFamily}>
          <View style={styles.familyIcon}>
            <Ionicons name="people" size={24} color="#4CAF50" />
          </View>
          <View style={styles.familyInfo}>
            <Text style={styles.familyName}>{userFamily.name}</Text>
            <Text style={styles.familyDescription}>
              {userFamily.members}/{userFamily.maxMembers} anggota
            </Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>LV{userFamily.level}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.noFamily}>
          <View style={styles.familyIcon}>
            <Ionicons name="people-outline" size={24} color="#666" />
          </View>
          <View style={styles.familyInfo}>
            <Text style={styles.noFamilyTitle}>belum bergabung dengan keluarga</Text>
            <Text style={styles.noFamilyDescription}>
              bergabung dengan keluarga untuk menikmati lebih banyak keuntungan
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  const FamilyItem = ({ family }: { family: Family }) => (
    <View style={styles.familyItem}>
      <View style={styles.familyItemLeft}>
        <View style={styles.familyLogo}>
          {family.logo ? (
            <Image source={{ uri: family.logo }} style={styles.familyLogoImage} />
          ) : (
            <Ionicons name="people" size={30} color="#fff" />
          )}
        </View>
        <View style={styles.familyDetails}>
          <View style={styles.familyNameRow}>
            <Text style={styles.familyItemName}>{family.name}</Text>
            <View style={styles.familyLevelBadge}>
              <Text style={styles.familyLevelText}>LV{family.level}</Text>
            </View>
            {family.type === 'FAMILY' && (
              <View style={styles.familyTypeBadge}>
                <Text style={styles.familyTypeText}>Family</Text>
              </View>
            )}
          </View>
          <View style={styles.familyStats}>
            <Ionicons name="people" size={12} color="#666" />
            <Text style={styles.familyStatsText}>
              {family.members}/{family.maxMembers}
            </Text>
            <Text style={styles.familyId}>ID:{family.id}</Text>
          </View>
          {family.description && (
            <Text style={styles.familyItemDescription} numberOfLines={1}>
              {family.description}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.joinButton,
          family.isJoined && styles.joinedButton
        ]}
        onPress={() => family.isJoined ? null : handleJoinFamily(family.id)}
        disabled={family.isJoined}
      >
        <Text style={[
          styles.joinButtonText,
          family.isJoined && styles.joinedButtonText
        ]}>
          {family.isJoined ? 'Tergabung' : 'Bergabung'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Keluarga</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateFamilyScreen')}>
          <Text style={styles.createButton}>Membuat</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <FamilyHeader />
        <UserFamilyStatus />

        <View style={styles.discoverSection}>
          <Text style={styles.sectionTitle}>Discover</Text>
          {families.map((family) => (
            <FamilyItem key={family.id} family={family} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  headerContainer: {
    position: 'relative',
    height: 120,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  statusContainer: {
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  joinedFamily: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noFamily: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  familyIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8F5E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  familyInfo: {
    flex: 1,
  },
  familyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  familyDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  noFamilyTitle: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  noFamilyDescription: {
    fontSize: 14,
    color: '#666',
  },
  levelBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  levelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  discoverSection: {
    margin: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  familyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  familyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  familyLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  familyLogoImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  familyDetails: {
    flex: 1,
  },
  familyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  familyItemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  familyLevelBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 6,
  },
  familyLevelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  familyTypeBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  familyTypeText: {
    color: '#2196F3',
    fontSize: 10,
    fontWeight: 'bold',
  },
  familyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  familyStatsText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    marginRight: 8,
  },
  familyId: {
    fontSize: 12,
    color: '#999',
  },
  familyItemDescription: {
    fontSize: 14,
    color: '#666',
  },
  joinButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinedButton: {
    backgroundColor: '#E8F5E8',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  joinedButtonText: {
    color: '#4CAF50',
  },
});

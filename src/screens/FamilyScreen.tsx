
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

// Helper function to get family level color
const getFamilyLevelColor = (level: number): string => {
  switch (level) {
    case 1: return '#4CAF50'; // Green
    case 2: return '#2196F3'; // Blue  
    case 3: return '#9C27B0'; // Purple
    case 4: return '#F44336'; // Red
    case 5: return '#212121'; // Black (Extreme)
    default: return '#4CAF50'; // Default to green
  }
};

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
      const response = await fetch(`${API_BASE_URL}/families`, {
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
      const response = await fetch(`${API_BASE_URL}/users/${user?.id}/family`, {
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
      const response = await fetch(`${API_BASE_URL}/families/${familyId}/join`, {
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

  // Helper to get avatar background color based on first letter
  const getRandomAvatarColor = (name: string): string => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#AAB7B8'];
    const firstLetter = name.charAt(0).toUpperCase();
    const index = firstLetter.charCodeAt(0) % colors.length;
    return colors[index];
  };

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
            {userFamily.familyRole && (
              <Text style={styles.familyRoleText}>
                Role: {userFamily.familyRole === 'admin' ? 'Admin' : userFamily.familyRole === 'moderator' ? 'Moderator' : 'Member'}
              </Text>
            )}
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
        <View style={[styles.familyLogo, !family.logo && { backgroundColor: getRandomAvatarColor(family.name) }]}>
          {family.logo ? (
            <Image source={{ uri: family.logo }} style={styles.familyLogoImage} />
          ) : (
            <Text style={styles.familyLogoText}>{family.name.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.familyDetails}>
          <View style={styles.familyNameRow}>
            <TouchableOpacity onPress={() => navigation.navigate('FamilyDetailScreen', { familyId: family.id })}>
              <Text style={[styles.familyItemName, styles.clickableFamilyName]}>{family.name}</Text>
            </TouchableOpacity>
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
  getFamilyLevelColor: (level: number): string => {
    switch (level) {
      case 1: return '#4CAF50'; // Green
      case 2: return '#2196F3'; // Blue
      case 3: return '#9C27B0'; // Purple
      case 4: return '#F44336'; // Red
      case 5: return '#212121'; // Black (Extreme)
      default: return '#4CAF50'; // Default to green
    }
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
  familyLogoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
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
  familyRoleText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '500',
    marginTop: 2,
  },
  clickableFamilyName: {
    color: '#4CAF50',
    textDecorationLine: 'underline',
  },
});

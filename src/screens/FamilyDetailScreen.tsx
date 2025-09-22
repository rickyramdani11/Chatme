
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
  SafeAreaView,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

interface FamilyMember {
  userId: string;
  username: string;
  familyRole: string;
  joinedAt: string;
  avatar?: string;
  level: number;
  verified: boolean;
}

interface FamilyDetail {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  createdBy: string;
  membersCount: number;
  maxMembers: number;
  level: number;
  createdAt: string;
}

export default function FamilyDetailScreen({ navigation, route }: any) {
  const { user, token } = useAuth();
  const [family, setFamily] = useState<FamilyDetail | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userFamilyRole, setUserFamilyRole] = useState<string>('');
  const [canManageRoles, setCanManageRoles] = useState(false);

  const familyId = route.params?.familyId;

  useEffect(() => {
    if (familyId) {
      fetchFamilyDetails();
      fetchFamilyMembers();
    }
  }, [familyId]);

  const fetchFamilyDetails = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/families/${familyId}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setFamily(data);
      }
    } catch (error) {
      console.error('Error fetching family details:', error);
    }
  };

  const fetchFamilyMembers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/families/${familyId}/members`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
        setUserFamilyRole(data.userFamilyRole || '');
        setCanManageRoles(data.canManageRoles || false);
      }
    } catch (error) {
      console.error('Error fetching family members:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchFamilyDetails(), fetchFamilyMembers()]);
    setRefreshing(false);
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/families/${familyId}/members/${memberId}/role`, {
        method: 'PUT',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({ familyRole: newRole }),
      });

      if (response.ok) {
        const result = await response.json();
        Alert.alert('Success', result.message);
        fetchFamilyMembers(); // Refresh members list
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to update role');
      }
    } catch (error) {
      console.error('Error changing member role:', error);
      Alert.alert('Error', 'Failed to update member role');
    }
  };

  const renderMember = ({ item }: { item: FamilyMember }) => (
    <View style={styles.memberItem}>
      <View style={styles.memberInfo}>
        <View style={styles.memberAvatar}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
          ) : (
            <View style={styles.defaultAvatar}>
              <Text style={styles.avatarText}>
                {item.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.memberDetails}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName}>{item.username}</Text>
            {item.verified && (
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            )}
            {item.familyRole === 'admin' && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>
          
          <Text style={styles.memberRole}>
            {item.familyRole === 'admin' ? 'Administrator' : 
             item.familyRole === 'moderator' ? 'Moderator' : 'Member'} • Level {item.level}
          </Text>
          
          <Text style={styles.joinedDate}>
            Joined {new Date(item.joinedAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {canManageRoles && item.userId !== user?.id && item.familyRole !== 'admin' && (
        <View style={styles.roleActions}>
          <TouchableOpacity
            style={[styles.roleButton, styles.moderatorButton]}
            onPress={() => handleChangeRole(item.userId, 
              item.familyRole === 'moderator' ? 'member' : 'moderator'
            )}
          >
            <Text style={styles.roleButtonText}>
              {item.familyRole === 'moderator' ? 'Remove Mod' : 'Make Mod'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Family Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Family Header */}
        {family && (
          <View style={styles.familyHeader}>
            {family.coverImage && (
              <Image 
                source={{ uri: `${API_BASE_URL}${family.coverImage}` }}
                style={styles.coverImage}
              />
            )}
            
            <View style={styles.familyInfo}>
              <Text style={styles.familyName}>{family.name}</Text>
              <Text style={styles.familyDescription}>{family.description}</Text>
              
              <View style={styles.familyStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{family.membersCount}</Text>
                  <Text style={styles.statLabel}>Members</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{family.level}</Text>
                  <Text style={styles.statLabel}>Level</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{family.maxMembers}</Text>
                  <Text style={styles.statLabel}>Max</Text>
                </View>
              </View>

              <View style={styles.creatorInfo}>
                <Ionicons name="person" size={16} color="#666" />
                <Text style={styles.creatorText}>Created by {family.createdBy}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Members Section */}
        <View style={styles.membersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Members ({members.length})</Text>
            {userFamilyRole && (
              <View style={styles.userRoleBadge}>
                <Text style={styles.userRoleText}>Your role: {userFamilyRole}</Text>
              </View>
            )}
          </View>

          <FlatList
            data={members}
            renderItem={renderMember}
            keyExtractor={(item) => item.userId}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
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
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  familyHeader: {
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  coverImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  familyInfo: {
    padding: 20,
  },
  familyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  familyDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    lineHeight: 22,
  },
  familyStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  membersSection: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  userRoleBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  userRoleText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500',
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  defaultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberDetails: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  adminBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  adminBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  memberRole: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  joinedDate: {
    fontSize: 12,
    color: '#999',
  },
  roleActions: {
    flexDirection: 'row',
  },
  roleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  moderatorButton: {
    backgroundColor: '#2196F3',
  },
  roleButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
});

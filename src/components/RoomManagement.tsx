
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../utils/apiConfig';

interface RoomManagementProps {
  visible: boolean;
  onClose: () => void;
  currentRoom: any;
  currentUser: any;
  token: string;
  socket: any;
  participants: any[];
}

interface BannedUser {
  id: string;
  banned_username: string;
  banned_by_username: string;
  ban_reason: string;
  banned_at: string;
  expires_at?: string;
}

interface Moderator {
  id: string;
  username: string;
  role: string;
  assigned_by_username: string;
  assigned_at: string;
  can_ban: boolean;
  can_kick: boolean;
  can_mute: boolean;
}

export default function RoomManagement({
  visible,
  onClose,
  currentRoom,
  currentUser,
  token,
  socket,
  participants
}: RoomManagementProps) {
  const [activeTab, setActiveTab] = useState<'moderators' | 'banned'>('moderators');
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModerator, setShowAddModerator] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');

  // Check if current user can manage room
  const canManageRoom = () => {
    if (!currentUser || !currentRoom) return false;
    return (
      currentUser.role === 'admin' ||
      currentRoom.managedBy === currentUser.username ||
      (currentRoom.moderators && currentRoom.moderators.includes(currentUser.username))
    );
  };

  // Load moderators
  const loadModerators = async () => {
    if (!currentRoom?.id) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/rooms/${currentRoom.id}/moderators`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setModerators(data);
      } else {
        console.error('Failed to load moderators');
        setModerators([]);
      }
    } catch (error) {
      console.error('Error loading moderators:', error);
      setModerators([]);
    } finally {
      setLoading(false);
    }
  };

  // Load banned users
  const loadBannedUsers = async () => {
    if (!currentRoom?.id) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/rooms/${currentRoom.id}/banned`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBannedUsers(data);
      } else {
        console.error('Failed to load banned users');
        setBannedUsers([]);
      }
    } catch (error) {
      console.error('Error loading banned users:', error);
      setBannedUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Add moderator
  const handleAddModerator = async () => {
    if (!selectedUsername.trim() || !currentRoom?.id) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${currentRoom.id}/moderators`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: selectedUsername.trim(),
          can_ban: true,
          can_kick: true,
          can_mute: true,
        }),
      });

      if (response.ok) {
        Alert.alert('Success', `${selectedUsername} has been added as moderator`);
        setSelectedUsername('');
        setShowAddModerator(false);
        loadModerators();
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to add moderator');
      }
    } catch (error) {
      console.error('Error adding moderator:', error);
      Alert.alert('Error', 'Failed to add moderator');
    }
  };

  // Remove moderator
  const handleRemoveModerator = async (moderatorId: string, username: string) => {
    Alert.alert(
      'Remove Moderator',
      `Are you sure you want to remove ${username} as moderator?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/api/rooms/${currentRoom.id}/moderators/${moderatorId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (response.ok) {
                Alert.alert('Success', `${username} has been removed as moderator`);
                loadModerators();
              } else {
                const error = await response.json();
                Alert.alert('Error', error.error || 'Failed to remove moderator');
              }
            } catch (error) {
              console.error('Error removing moderator:', error);
              Alert.alert('Error', 'Failed to remove moderator');
            }
          }
        }
      ]
    );
  };

  // Unban user
  const handleUnbanUser = async (bannedUserId: string, username: string) => {
    Alert.alert(
      'Unban User',
      `Are you sure you want to unban ${username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unban',
          onPress: async () => {
            try {
              // Emit unban via socket
              if (socket) {
                socket.emit('ban-user', {
                  roomId: currentRoom.id,
                  targetUsername: username,
                  action: 'unban',
                  reason: `Unbanned by ${currentUser?.username}`
                });
              }

              // Also call API endpoint
              const response = await fetch(`${API_BASE_URL}/api/rooms/${currentRoom.id}/banned/${bannedUserId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (response.ok) {
                Alert.alert('Success', `${username} has been unbanned`);
                loadBannedUsers();
              } else {
                const error = await response.json();
                Alert.alert('Error', error.error || 'Failed to unban user');
              }
            } catch (error) {
              console.error('Error unbanning user:', error);
              Alert.alert('Error', 'Failed to unban user');
            }
          }
        }
      ]
    );
  };

  // Load data when modal opens
  useEffect(() => {
    if (visible && canManageRoom()) {
      loadModerators();
      loadBannedUsers();
    }
  }, [visible, currentRoom?.id]);

  if (!canManageRoom()) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Access Denied</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.content}>
              <Text style={styles.errorText}>You don't have permission to manage this room.</Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Room Management</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'moderators' && styles.activeTab]}
              onPress={() => setActiveTab('moderators')}
            >
              <Text style={[styles.tabText, activeTab === 'moderators' && styles.activeTabText]}>
                Moderators
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'banned' && styles.activeTab]}
              onPress={() => setActiveTab('banned')}
            >
              <Text style={[styles.tabText, activeTab === 'banned' && styles.activeTabText]}>
                Banned Users
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#667eea" />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : (
              <>
                {/* Moderators Tab */}
                {activeTab === 'moderators' && (
                  <View>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Room Moderators</Text>
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => setShowAddModerator(true)}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.addButtonText}>Add</Text>
                      </TouchableOpacity>
                    </View>

                    {moderators.length === 0 ? (
                      <Text style={styles.emptyText}>No moderators assigned</Text>
                    ) : (
                      moderators.map((moderator) => (
                        <View key={moderator.id} style={styles.listItem}>
                          <View style={styles.listItemInfo}>
                            <Text style={styles.listItemName}>{moderator.username}</Text>
                            <Text style={styles.listItemSubtext}>
                              Added by {moderator.assigned_by_username}
                            </Text>
                            <View style={styles.permissionsList}>
                              {moderator.can_ban && <Text style={styles.permission}>Ban</Text>}
                              {moderator.can_kick && <Text style={styles.permission}>Kick</Text>}
                              {moderator.can_mute && <Text style={styles.permission}>Mute</Text>}
                            </View>
                          </View>
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => handleRemoveModerator(moderator.id, moderator.username)}
                          >
                            <Ionicons name="trash-outline" size={20} color="#FF6B35" />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* Banned Users Tab */}
                {activeTab === 'banned' && (
                  <View>
                    <Text style={styles.sectionTitle}>Banned Users</Text>

                    {bannedUsers.length === 0 ? (
                      <Text style={styles.emptyText}>No banned users</Text>
                    ) : (
                      bannedUsers.map((bannedUser) => (
                        <View key={bannedUser.id} style={styles.listItem}>
                          <View style={styles.listItemInfo}>
                            <Text style={styles.listItemName}>{bannedUser.banned_username}</Text>
                            <Text style={styles.listItemSubtext}>
                              Banned by {bannedUser.banned_by_username}
                            </Text>
                            {bannedUser.ban_reason && (
                              <Text style={styles.listItemReason}>
                                Reason: {bannedUser.ban_reason}
                              </Text>
                            )}
                            <Text style={styles.listItemDate}>
                              {new Date(bannedUser.banned_at).toLocaleDateString()}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.unbanButton}
                            onPress={() => handleUnbanUser(bannedUser.id, bannedUser.banned_username)}
                          >
                            <Ionicons name="checkmark-circle-outline" size={20} color="#4CAF50" />
                            <Text style={styles.unbanButtonText}>Unban</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Add Moderator Modal */}
          <Modal
            visible={showAddModerator}
            transparent
            animationType="fade"
            onRequestClose={() => setShowAddModerator(false)}
          >
            <View style={styles.addModalOverlay}>
              <View style={styles.addModalContainer}>
                <Text style={styles.addModalTitle}>Add Moderator</Text>
                
                <TextInput
                  style={styles.addModalInput}
                  placeholder="Enter username"
                  value={selectedUsername}
                  onChangeText={setSelectedUsername}
                  autoCapitalize="none"
                />

                <View style={styles.addModalButtons}>
                  <TouchableOpacity
                    style={styles.addModalCancelButton}
                    onPress={() => {
                      setShowAddModerator(false);
                      setSelectedUsername('');
                    }}
                  >
                    <Text style={styles.addModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addModalConfirmButton}
                    onPress={handleAddModerator}
                  >
                    <Text style={styles.addModalConfirmText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginHorizontal: 20,
    maxHeight: '80%',
    width: '90%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#667eea',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#667eea',
    fontWeight: '600',
  },
  content: {
    padding: 20,
    maxHeight: 400,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
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
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#667eea',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  listItemSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  listItemReason: {
    fontSize: 13,
    color: '#FF6B35',
    marginTop: 2,
    fontStyle: 'italic',
  },
  listItemDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  permissionsList: {
    flexDirection: 'row',
    marginTop: 4,
  },
  permission: {
    fontSize: 12,
    color: '#667eea',
    backgroundColor: '#e8eeff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  removeButton: {
    padding: 8,
  },
  unbanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  unbanButtonText: {
    color: '#4CAF50',
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  // Add Moderator Modal Styles
  addModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addModalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 40,
    width: '80%',
  },
  addModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  addModalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  addModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  addModalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  addModalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    backgroundColor: '#667eea',
    borderRadius: 8,
    alignItems: 'center',
  },
  addModalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  addModalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

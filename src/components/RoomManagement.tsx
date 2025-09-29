import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

interface RoomManagementProps {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
  currentUser: any;
  socket: any;
}

export default function RoomManagement({
  visible,
  onClose,
  roomId,
  roomName,
  currentUser,
  socket
}: RoomManagementProps) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'moderators' | 'banned'>('moderators');
  const [moderators, setModerators] = useState<any[]>([]);
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [newModeratorUsername, setNewModeratorUsername] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadModerators();
      loadBannedUsers();
    }
  }, [visible, roomId]);

  const loadModerators = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/moderators`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setModerators(data);
      }
    } catch (error) {
      console.error('Error loading moderators:', error);
    }
  };

  const loadBannedUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/banned`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBannedUsers(data);
      }
    } catch (error) {
      console.error('Error loading banned users:', error);
    }
  };

  const addModerator = async () => {
    if (!newModeratorUsername.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/moderators`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: newModeratorUsername.trim()
        }),
      });

      if (response.ok) {
        Alert.alert('Success', `${newModeratorUsername} has been added as moderator`);
        setNewModeratorUsername('');
        loadModerators();
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to add moderator');
      }
    } catch (error) {
      console.error('Error adding moderator:', error);
      Alert.alert('Error', 'Failed to add moderator');
    }
    setLoading(false);
  };

  const removeModerator = async (username: string) => {
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
              const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/moderators/${username}`, {
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

  const unbanUser = async (username: string) => {
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
                  roomId: roomId,
                  bannedUser: username,
                  bannedBy: currentUser?.username,
                  action: 'unban'
                });
              }

              Alert.alert('Success', `${username} has been unbanned`);
              loadBannedUsers();
            } catch (error) {
              console.error('Error unbanning user:', error);
              Alert.alert('Error', 'Failed to unban user');
            }
          }
        }
      ]
    );
  };

  const renderModerator = ({ item }: { item: any }) => (
    <View style={styles.listItem}>
      <View style={styles.userInfo}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {item.username?.charAt(0).toUpperCase() || 'M'}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.userRole}>Moderator</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeModerator(item.username)}
      >
        <Ionicons name="close" size={20} color="#F44336" />
      </TouchableOpacity>
    </View>
  );

  const renderBannedUser = ({ item }: { item: any }) => (
    <View style={styles.listItem}>
      <View style={styles.userInfo}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {item.username?.charAt(0).toUpperCase() || 'B'}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.userRole}>Banned</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.unbanButton}
        onPress={() => unbanUser(item.username)}
      >
        <Text style={styles.unbanButtonText}>Unban</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Room Management</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <Text style={styles.roomName}>{roomName}</Text>

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

          <View style={styles.content}>
            {activeTab === 'moderators' ? (
              <View style={styles.tabContent}>
                <View style={styles.addSection}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter username to add as moderator"
                    value={newModeratorUsername}
                    onChangeText={setNewModeratorUsername}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={addModerator}
                    disabled={loading}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={moderators}
                  renderItem={renderModerator}
                  keyExtractor={(item) => item.id || item.username}
                  style={styles.list}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>No moderators added yet</Text>
                  }
                />
              </View>
            ) : (
              <View style={styles.tabContent}>
                <FlatList
                  data={bannedUsers}
                  renderItem={renderBannedUser}
                  keyExtractor={(item) => item.id || item.username}
                  style={styles.list}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>No banned users</Text>
                  }
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  roomName: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
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
    borderBottomColor: '#8B5CF6',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#8B5CF6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    padding: 20,
  },
  addSection: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  userRole: {
    fontSize: 14,
    color: '#666',
  },
  removeButton: {
    padding: 8,
  },
  unbanButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  unbanButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    marginTop: 40,
  },
});
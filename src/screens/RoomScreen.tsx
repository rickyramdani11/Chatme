import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput, 
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

interface Room {
  id: string;
  name: string;
  description?: string;
  type: string;
  members?: number;
  maxMembers?: number;
  avatar?: string;
  color?: string;
  isOnline?: boolean;
}




export default function RoomScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [newRoomManagedBy, setNewRoomManagedBy] = useState(user?.username || '');
  const [newRoomCapacity, setNewRoomCapacity] = useState(25);
  const [creatingRoom, setCreatingRoom] = useState(false);
  

  // Fetch rooms from server
  const fetchRooms = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rooms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Rooms data received:', data);
      
      // Filter out private rooms (rooms that start with 'private_')
      const publicRooms = data.filter((room: Room) => !room.name.startsWith('private_'));
      setRooms(publicRooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      Alert.alert('Error', 'Failed to load rooms. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  

  // Join room
  const joinRoom = async (roomId: string, roomName: string, roomDescription?: string, password?: string) => {
    try {
      // Check if room is full before attempting to join
      const room = rooms.find(r => r.id === roomId);
      if (room && room.members >= (room.maxMembers || 25)) {
        Alert.alert(
          'Room is Full',
          'Please wait a moment.',
          [{ text: 'OK', style: 'default' }]
        );
        return;
      }

      const requestBody: any = {};
      if (password) {
        requestBody.password = password;
      }

      const response = await fetch(`${API_BASE_URL}/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.requiresPassword) {
          // Room requires password, prompt user
          Alert.prompt(
            'Room Locked',
            data.message || 'This room is password protected. Please enter the password:',
            [
              {
                text: 'Cancel',
                style: 'cancel',
              },
              {
                text: 'Join',
                onPress: (enteredPassword) => {
                  if (enteredPassword) {
                    joinRoom(roomId, roomName, roomDescription, enteredPassword);
                  }
                },
              },
            ],
            'secure-text'
          );
          return;
        } else {
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
      }

      // Navigate to ChatScreen with room data
      navigation.navigate('Chat', { 
        roomId, 
        roomName,
        roomDescription: roomDescription || `${roomName} room`,
        type: 'room',
        autoFocusTab: true 
      });

    } catch (error) {
      console.error('Error joining room:', error);
      Alert.alert('Error', error.message || 'Failed to join room. Please try again.');
    }
  };

  // Create new room
  const createRoom = async () => {
    if (!newRoomName.trim()) {
      Alert.alert('Error', 'Room name is required');
      return;
    }

    if (!newRoomDescription.trim()) {
      Alert.alert('Error', 'Room description is required');
      return;
    }

    // Check if room name already exists (case-insensitive)
    const roomNameExists = rooms.some(room => 
      room.name.toLowerCase() === newRoomName.trim().toLowerCase()
    );

    if (roomNameExists) {
      Alert.alert(
        'Room Already Exists', 
        `A room named "${newRoomName.trim()}" already exists. Please choose a different name.`,
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    setCreatingRoom(true);

    try {
      const response = await fetch(`${API_BASE_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          name: newRoomName.trim(),
          description: newRoomDescription.trim(),
          type: 'room',
          maxMembers: newRoomCapacity,
          createdBy: newRoomManagedBy
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 400 && errorData.error?.includes('already exists')) {
          Alert.alert(
            'Room Already Exists', 
            `A room named "${newRoomName.trim()}" already exists. Please choose a different name.`
          );
          return;
        }
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const newRoom = await response.json();
      console.log('Room created successfully:', newRoom);

      // Add new room to the list
      setRooms(prevRooms => [newRoom, ...prevRooms]);

      // Reset form and close modal
      setNewRoomName('');
      setNewRoomDescription('');
      setNewRoomCapacity(25);
      setShowCreateRoomModal(false);

      Alert.alert('Success', `Room "${newRoom.name}" created successfully!`);

    } catch (error) {
      console.error('Error creating room:', error);
      Alert.alert('Error', error.message || 'Failed to create room. Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  };

  // Load rooms on component mount
  useEffect(() => {
    fetchRooms();
  }, []);

  // Auto-refresh rooms when screen is focused (e.g., after deleting from admin panel)
  useFocusEffect(
    useCallback(() => {
      console.log('RoomScreen focused - refreshing room list');
      fetchRooms();
    }, [])
  );

  // Set managed by when user is loaded
  useEffect(() => {
    if (user?.username && !newRoomManagedBy) {
      setNewRoomManagedBy(user.username);
    }
  }, [user]);

  // Filter rooms based on search text
  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Generate avatar and color for room
  const generateRoomDisplay = (room: Room) => {
    const colors = ['#8B5CF6', '#6366F1', '#10B981', '#EF4444', '#F59E0B', '#06B6D4'];
    return {
      avatar: room.avatar || room.name.charAt(0).toUpperCase(),
      color: room.color || colors[parseInt(room.id) % colors.length],
    };
  };

  const RoomCard = ({ room }: { room: Room }) => {
    const { avatar, color } = generateRoomDisplay(room);
    const isLocked = room.type === 'locked';

    return (
      <TouchableOpacity 
        style={styles.roomCard} 
        activeOpacity={0.7}
        onPress={() => joinRoom(room.id, room.name, room.description)}
      >
        <View style={styles.roomHeader}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: color }]}>
              <Text style={styles.avatarText}>{avatar}</Text>
            </View>
            <View style={styles.onlineIndicator} />
          </View>

          <View style={styles.roomInfo}>
            <View style={styles.roomNameContainer}>
              <Text style={styles.roomName}>{room.name}</Text>
              {isLocked && (
                <Ionicons 
                  name="lock-closed" 
                  size={16} 
                  color="#F59E0B" 
                  style={styles.lockIcon}
                />
              )}
            </View>
            <Text style={styles.roomDescription}>
              {room.description || `${room.type} room`}
            </Text>
          </View>

          <View style={styles.memberCount}>
            <Ionicons name="people" size={16} color="#666" />
            <Text style={styles.memberText}>
              {room.members || 0}/{room.maxMembers || 25}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  

  

  

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat Rooms</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search rooms..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#999"
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading rooms...</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchRooms();
              }}
              colors={['#8B5CF6']}
            />
          }
        >
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryTitle}>AVAILABLE ROOMS</Text>
              <TouchableOpacity 
                style={styles.createRoomButton}
                onPress={() => setShowCreateRoomModal(true)}
              >
                <Ionicons name="add" size={20} color="#8B5CF6" />
                <Text style={styles.createRoomButtonText}>New Room</Text>
              </TouchableOpacity>
            </View>
            {filteredRooms.length > 0 ? (
              filteredRooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
                <Text style={styles.emptyStateText}>
                  {searchText ? 'No rooms found' : 'No rooms available'}
                </Text>
                <Text style={styles.emptyStateSubtext}>
                  {searchText ? 'Try a different search term' : 'Create a new room to get started'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>
      )}

      {/* Create Room Modal */}
      <Modal
        visible={showCreateRoomModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateRoomModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowCreateRoomModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create New Room</Text>
            <TouchableOpacity
              onPress={createRoom}
              disabled={creatingRoom}
              style={[styles.modalSaveButton, creatingRoom && styles.modalSaveButtonDisabled]}
            >
              {creatingRoom ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalSaveButtonText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Room Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter room name"
                value={newRoomName}
                onChangeText={setNewRoomName}
                maxLength={50}
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Description *</Text>
              <TextInput
                style={[styles.formInput, styles.formInputMultiline]}
                placeholder="Enter room description (will be shown in chat screen)"
                value={newRoomDescription}
                onChangeText={setNewRoomDescription}
                maxLength={200}
                multiline
                numberOfLines={3}
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Managed By</Text>
              <TextInput
                style={[styles.formInput, styles.formInputDisabled]}
                value={newRoomManagedBy}
                editable={false}
                placeholderTextColor="#999"
              />
              <Text style={styles.formHelpText}>This field cannot be edited</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Room Capacity</Text>
              <View style={styles.capacityContainer}>
                {[25, 40, 80].map((capacity) => (
                  <TouchableOpacity
                    key={capacity}
                    style={[
                      styles.capacityOption,
                      newRoomCapacity === capacity && styles.capacityOptionSelected
                    ]}
                    onPress={() => setNewRoomCapacity(capacity)}
                  >
                    <Text style={[
                      styles.capacityOptionText,
                      newRoomCapacity === capacity && styles.capacityOptionTextSelected
                    ]}>
                      {capacity}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  scrollView: {
    flex: 1,
  },
  categorySection: {
    marginBottom: 25,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  createRoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  createRoomButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B5CF6',
    marginLeft: 4,
  },
  roomCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: 'white',
  },
  roomInfo: {
    flex: 1,
    marginRight: 10,
  },
  roomNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  roomName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#CC5500', // Dark orange color
    marginRight: 8,
  },
  
  lockIcon: {
    marginLeft: 4,
  },
  roomDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    fontWeight: '500',
  },
  bottomSpacing: {
    height: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalSaveButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalSaveButtonDisabled: {
    opacity: 0.6,
  },
  modalSaveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#374151',
  },
  formInputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  formInputDisabled: {
    backgroundColor: '#f9fafb',
    color: '#6b7280',
  },
  formHelpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  capacityContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  capacityOption: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  capacityOptionSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: '#f3f4f6',
  },
  capacityOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  capacityOptionTextSelected: {
    color: '#8B5CF6',
    fontWeight: '600',
  },
});
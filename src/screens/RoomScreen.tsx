import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useTheme } from '../contexts/ThemeContext';
import { API_BASE_URL } from '../utils/apiConfig';

interface Room {
  id: string;
  name: string;
  description?: string;
  type: string;
  category?: string;
  members?: number;
  maxMembers?: number;
  avatar?: string;
  color?: string;
  isOnline?: boolean;
}




export default function RoomScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDarkMode } = useTheme();
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
  const [activeCategory, setActiveCategory] = useState('all');
  
  // Password modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingRoom, setPendingRoom] = useState<{id: string, name: string, description?: string} | null>(null);

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
      // console.log('Rooms data received:', data); // Disabled to reduce log verbosity
      
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
          // Room requires password, show custom modal
          setPendingRoom({ id: roomId, name: roomName, description: roomDescription });
          setShowPasswordModal(true);
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
        autoFocusTab: true,
        password: password || undefined
      });

    } catch (error) {
      console.error('Error joining room:', error);
      Alert.alert('Error', error.message || 'Failed to join room. Please try again.');
    }
  };

  // Handle password submit
  const handlePasswordSubmit = () => {
    if (pendingRoom && passwordInput.trim()) {
      setShowPasswordModal(false);
      const password = passwordInput.trim();
      setPasswordInput('');
      setPendingRoom(null);
      joinRoom(pendingRoom.id, pendingRoom.name, pendingRoom.description, password);
    }
  };

  // Handle password cancel
  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPasswordInput('');
    setPendingRoom(null);
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

  // Filter rooms based on search text and category
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.name.toLowerCase().includes(searchText.toLowerCase());
    const roomCategory = (room.category || 'social').toLowerCase();
    const matchesCategory = activeCategory === 'all' || roomCategory === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  // Generate avatar and color for room (theme-aware)
  const generateRoomDisplay = (room: Room) => {
    const roomColors = isDarkMode 
      ? ['#BB86FC', '#64B5F6', '#03DAC6', '#CF6679', '#FFB74D', '#4FC3F7']
      : ['#8B5CF6', '#6366F1', '#10B981', '#EF4444', '#F59E0B', '#06B6D4'];
    return {
      avatar: room.avatar || room.name.charAt(0).toUpperCase(),
      color: room.color || roomColors[parseInt(room.id) % roomColors.length],
    };
  };

  const themedStyles = useMemo(() => createThemedStyles(colors, isDarkMode), [colors, isDarkMode]);

  const RoomCard = ({ room }: { room: Room }) => {
    const { avatar, color } = generateRoomDisplay(room);
    const isLocked = room.type === 'locked';

    return (
      <TouchableOpacity 
        style={themedStyles.roomCard} 
        activeOpacity={0.7}
        onPress={() => joinRoom(room.id, room.name, room.description)}
      >
        <View style={styles.roomHeader}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: color }]}>
              <Text style={themedStyles.avatarText}>{avatar}</Text>
            </View>
            <View style={themedStyles.onlineIndicator} />
          </View>

          <View style={styles.roomInfo}>
            <View style={styles.roomNameContainer}>
              <Text style={themedStyles.roomName}>{room.name}</Text>
              {isLocked && (
                <Ionicons 
                  name="lock-closed" 
                  size={16} 
                  color={colors.warning} 
                  style={styles.lockIcon}
                />
              )}
            </View>
            <Text style={themedStyles.roomDescription}>
              {room.description || `${room.type} room`}
            </Text>
          </View>

          <View style={themedStyles.memberCount}>
            <Ionicons name="people" size={16} color={colors.iconDefault} />
            <Text style={themedStyles.memberText}>
              {room.members || 0}/{room.maxMembers || 25}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  

  

  

  return (
    <SafeAreaView style={themedStyles.container}>
      <View style={themedStyles.header}>
        <Text style={themedStyles.title}>Chat Rooms</Text>
      </View>

      <View style={themedStyles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.iconDefault} style={styles.searchIcon} />
        <TextInput
          style={themedStyles.searchInput}
          placeholder="Search rooms..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Category Tabs */}
      <View style={styles.categoryTabs}>
        <TouchableOpacity
          style={[themedStyles.categoryTab, activeCategory === 'all' && themedStyles.categoryTabActive]}
          onPress={() => setActiveCategory('all')}
        >
          <Text style={[themedStyles.categoryTabText, activeCategory === 'all' && themedStyles.categoryTabTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[themedStyles.categoryTab, activeCategory === 'game' && themedStyles.categoryTabActive]}
          onPress={() => setActiveCategory('game')}
        >
          <Ionicons 
            name="game-controller" 
            size={16} 
            color={activeCategory === 'game' ? colors.badgeTextLight : colors.iconDefault} 
            style={{ marginRight: 4 }}
          />
          <Text style={[themedStyles.categoryTabText, activeCategory === 'game' && themedStyles.categoryTabTextActive]}>
            Game
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[themedStyles.categoryTab, activeCategory === 'social' && themedStyles.categoryTabActive]}
          onPress={() => setActiveCategory('social')}
        >
          <Ionicons 
            name="people" 
            size={16} 
            color={activeCategory === 'social' ? colors.badgeTextLight : colors.iconDefault} 
            style={{ marginRight: 4 }}
          />
          <Text style={[themedStyles.categoryTabText, activeCategory === 'social' && themedStyles.categoryTabTextActive]}>
            Social
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={themedStyles.loadingText}>Loading rooms...</Text>
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
              colors={[colors.primary]}
            />
          }
        >
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Text style={themedStyles.categoryTitle}>AVAILABLE ROOMS</Text>
              <TouchableOpacity 
                style={themedStyles.createRoomButton}
                onPress={() => setShowCreateRoomModal(true)}
              >
                <Ionicons name="add" size={20} color={colors.primary} />
                <Text style={themedStyles.createRoomButtonText}>New Room</Text>
              </TouchableOpacity>
            </View>
            {filteredRooms.length > 0 ? (
              filteredRooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} />
                <Text style={themedStyles.emptyStateText}>
                  {searchText ? 'No rooms found' : 'No rooms available'}
                </Text>
                <Text style={themedStyles.emptyStateSubtext}>
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
        <SafeAreaView style={themedStyles.modalContainer}>
          <View style={themedStyles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowCreateRoomModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color={colors.iconDefault} />
            </TouchableOpacity>
            <Text style={themedStyles.modalTitle}>Create New Room</Text>
            <TouchableOpacity
              onPress={createRoom}
              disabled={creatingRoom}
              style={[themedStyles.modalSaveButton, creatingRoom && styles.modalSaveButtonDisabled]}
            >
              {creatingRoom ? (
                <ActivityIndicator size="small" color={colors.badgeTextLight} />
              ) : (
                <Text style={themedStyles.modalSaveButtonText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.formSection}>
              <Text style={themedStyles.formLabel}>Room Name *</Text>
              <TextInput
                style={themedStyles.formInput}
                placeholder="Enter room name"
                value={newRoomName}
                onChangeText={setNewRoomName}
                maxLength={50}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={themedStyles.formLabel}>Description *</Text>
              <TextInput
                style={[themedStyles.formInput, styles.formInputMultiline]}
                placeholder="Enter room description (will be shown in chat screen)"
                value={newRoomDescription}
                onChangeText={setNewRoomDescription}
                maxLength={200}
                multiline
                numberOfLines={3}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={themedStyles.formLabel}>Managed By</Text>
              <TextInput
                style={[themedStyles.formInput, themedStyles.formInputDisabled]}
                value={newRoomManagedBy}
                editable={false}
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={themedStyles.formHelpText}>This field cannot be edited</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={themedStyles.formLabel}>Room Capacity</Text>
              <View style={styles.capacityContainer}>
                {[25, 40, 80].map((capacity) => (
                  <TouchableOpacity
                    key={capacity}
                    style={[
                      themedStyles.capacityOption,
                      newRoomCapacity === capacity && themedStyles.capacityOptionSelected
                    ]}
                    onPress={() => setNewRoomCapacity(capacity)}
                  >
                    <Text style={[
                      themedStyles.capacityOptionText,
                      newRoomCapacity === capacity && themedStyles.capacityOptionTextSelected
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

      {/* Password Modal */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={handlePasswordCancel}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 20,
            width: '100%',
            maxWidth: 400,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Ionicons name="lock-closed" size={48} color={colors.primary} />
              <Text style={{ 
                fontSize: 20, 
                fontWeight: 'bold', 
                color: colors.text,
                marginTop: 12
              }}>
                Room Locked
              </Text>
              <Text style={{ 
                fontSize: 14, 
                color: colors.textSecondary,
                marginTop: 8,
                textAlign: 'center'
              }}>
                This room is password protected
              </Text>
            </View>

            <TextInput
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.surface,
                marginBottom: 20
              }}
              placeholder="Enter password"
              placeholderTextColor={colors.textSecondary}
              value={passwordInput}
              onChangeText={setPasswordInput}
              secureTextEntry
              autoFocus
              onSubmitEditing={handlePasswordSubmit}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={handlePasswordCancel}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePasswordSubmit}
                disabled={!passwordInput.trim()}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: passwordInput.trim() ? colors.primary : colors.disabled,
                  alignItems: 'center'
                }}
              >
                <Text style={{ 
                  color: passwordInput.trim() ? colors.badgeTextLight : colors.textSecondary,
                  fontSize: 16, 
                  fontWeight: '600' 
                }}>
                  Join
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
    </SafeAreaView>
  );
}

const createThemedStyles = (colors: any, isDarkMode: boolean) => ({
  container: {
    ...styles.container,
    backgroundColor: colors.background,
  },
  header: {
    ...styles.header,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
  },
  title: {
    ...styles.title,
    color: colors.text,
  },
  searchContainer: {
    ...styles.searchContainer,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  searchInput: {
    ...styles.searchInput,
    color: colors.text,
  },
  categoryTab: {
    ...styles.categoryTab,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  categoryTabActive: {
    ...styles.categoryTabActive,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryTabText: {
    ...styles.categoryTabText,
    color: colors.textSecondary,
  },
  categoryTabTextActive: {
    ...styles.categoryTabTextActive,
    color: colors.badgeTextLight,
  },
  categoryTitle: {
    ...styles.categoryTitle,
    color: colors.textSecondary,
  },
  createRoomButton: {
    ...styles.createRoomButton,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  createRoomButtonText: {
    ...styles.createRoomButtonText,
    color: colors.primary,
  },
  roomCard: {
    ...styles.roomCard,
    backgroundColor: colors.card,
    borderColor: colors.border,
    shadowColor: colors.shadow,
  },
  avatarText: {
    ...styles.avatarText,
    color: colors.badgeTextLight,
  },
  onlineIndicator: {
    ...styles.onlineIndicator,
    backgroundColor: colors.success,
    borderColor: colors.surface,
  },
  roomName: {
    ...styles.roomName,
    color: colors.warning,
  },
  roomDescription: {
    ...styles.roomDescription,
    color: colors.textSecondary,
  },
  memberCount: {
    ...styles.memberCount,
    backgroundColor: colors.surface,
  },
  memberText: {
    ...styles.memberText,
    color: colors.textSecondary,
  },
  loadingText: {
    ...styles.loadingText,
    color: colors.textSecondary,
  },
  emptyStateText: {
    ...styles.emptyStateText,
    color: colors.textSecondary,
  },
  emptyStateSubtext: {
    ...styles.emptyStateSubtext,
    color: colors.textSecondary,
  },
  modalContainer: {
    ...styles.modalContainer,
    backgroundColor: colors.background,
  },
  modalHeader: {
    ...styles.modalHeader,
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...styles.modalTitle,
    color: colors.text,
  },
  modalSaveButton: {
    ...styles.modalSaveButton,
    backgroundColor: colors.primary,
  },
  modalSaveButtonText: {
    ...styles.modalSaveButtonText,
    color: colors.badgeTextLight,
  },
  formLabel: {
    ...styles.formLabel,
    color: colors.text,
  },
  formInput: {
    ...styles.formInput,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    color: colors.text,
  },
  formInputDisabled: {
    ...styles.formInputDisabled,
    backgroundColor: colors.background,
    color: colors.textSecondary,
  },
  formHelpText: {
    ...styles.formHelpText,
    color: colors.textSecondary,
  },
  capacityOption: {
    ...styles.capacityOption,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  capacityOptionSelected: {
    ...styles.capacityOptionSelected,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  capacityOptionText: {
    ...styles.capacityOptionText,
    color: colors.text,
  },
  capacityOptionTextSelected: {
    ...styles.capacityOptionTextSelected,
    color: colors.primary,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  categoryTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryTabActive: {
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTabTextActive: {
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  createRoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  createRoomButtonText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  roomCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
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
    borderWidth: 2,
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
    marginRight: 8,
  },
  
  lockIcon: {
    marginLeft: 4,
  },
  roomDescription: {
    fontSize: 14,
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberText: {
    fontSize: 12,
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
    marginTop: 15,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    marginTop: 5,
    textAlign: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalSaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalSaveButtonDisabled: {
    opacity: 0.6,
  },
  modalSaveButtonText: {
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
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  formInputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  formInputDisabled: {
  },
  formHelpText: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  capacityContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  capacityOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  capacityOptionSelected: {
  },
  capacityOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  capacityOptionTextSelected: {
    fontWeight: '600',
  },
});
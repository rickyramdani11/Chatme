
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Participant {
  id: string;
  username: string;
  role: string;
  level: number;
  isOnline: boolean;
  lastSeen?: string;
}

interface ParticipantsListProps {
  visible: boolean;
  onClose: () => void;
  participants: Participant[];
  currentUser: any;
  currentRoom: any;
  loading?: boolean;
  onParticipantPress: (participant: Participant) => void;
}

export default function ParticipantsList({
  visible,
  onClose,
  participants,
  currentUser,
  currentRoom,
  loading = false,
  onParticipantPress
}: ParticipantsListProps) {

  // Filter to only show online participants
  const onlineParticipants = participants.filter(p => p.isOnline);

  const getRoleColor = (role?: string, username?: string, currentRoomId?: string) => {
    // Admin role takes highest precedence
    if (role === 'admin') return '#FF6B35'; // Orange Red for admin

    // Check if user is owner of current room
    const isOwner = currentRoom && currentRoom.managedBy === username;

    // Check if user is moderator of current room
    const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(username);

    if (isOwner) return '#e8d31a'; // Gold/Yellow for room owner
    if (isModerator) return '#e8d31a'; // Gold/Yellow for room moderator

    switch (role) {
      case 'user': return '#2196F3'; // Blue
      case 'merchant': return '#9C27B0'; // Purple
      case 'mentor': return '#eb0e0e'; // Deep Orange
      default: return '#2196F3'; // Default to blue
    }
  };

  const getRoleBackgroundColor = (role?: string, username?: string, currentRoomId?: string) => {
    // Admin role takes highest precedence
    if (role === 'admin') return '#FFEBEE'; // Light red background for admin

    // Check if user is owner of current room
    const isOwner = currentRoom && currentRoom.managedBy === username;

    // Check if user is moderator of current room
    const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(username);

    if (isOwner) return '#fefce8'; // Light yellow background for room owner
    if (isModerator) return '#fefce8'; // Light yellow background for room moderator

    switch (role) {
      case 'user': return '#E3F2FD'; // Light blue background
      case 'merchant': return '#F3E5F5'; // Light purple background
      case 'mentor': return '#FBE9E7'; // Light orange background
      default: return '#E3F2FD'; // Default light blue background
    }
  };

  const getRoleDisplayText = (participant: Participant) => {
    const isOwner = currentRoom && currentRoom.managedBy === participant.username;
    const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(participant.username);

    if (isOwner) return '👤 Owner';
    if (isModerator) return '🛡️ Moderator';

    switch (participant.role) {
      case 'admin': return '👑 Admin';
      case 'merchant': return '🏪 Merchant';
      case 'mentor': return '🎓 Mentor';
      default: return '👤 User';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.participantsModal}>
          <View style={styles.participantsHeader}>
            <Text style={styles.participantsTitle}>Room Participants</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={styles.loadingText}>Loading participants...</Text>
            </View>
          ) : (
            <ScrollView style={styles.participantsList}>
              {onlineParticipants.length > 0 ? (
                onlineParticipants.map((participant, index) => (
                  <TouchableOpacity
                    key={`${participant.username}-${participant.id || index}`}
                    style={[
                      styles.participantItem,
                      { backgroundColor: getRoleBackgroundColor(participant.role, participant.username, currentRoom?.id) }
                    ]}
                    onPress={() => onParticipantPress(participant)}
                  >
                    <View style={[
                      styles.participantAvatar,
                      { backgroundColor: getRoleColor(participant.role, participant.username, currentRoom?.id) }
                    ]}>
                      <Text style={styles.participantAvatarText}>
                        {participant.username ? participant.username.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>
                    <Text style={[
                      styles.participantName,
                      { color: getRoleColor(participant.role, participant.username, currentRoom?.id) }
                    ]}>
                      {participant.username || 'Unknown User'}
                    </Text>
                    <View style={[
                      styles.participantRoleBadge,
                      { backgroundColor: getRoleColor(participant.role, participant.username, currentRoom?.id) }
                    ]}>
                      <Text style={styles.participantRoleBadgeText}>
                        {getRoleDisplayText(participant)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.noParticipants}>
                  <Text style={styles.noParticipantsText}>No participants found</Text>
                </View>
              )}
            </ScrollView>
          )}
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
  participantsModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginHorizontal: 20,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  participantsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
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
  participantsList: {
    maxHeight: 400,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginHorizontal: 8,
    marginVertical: 1,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  participantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#229c93',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  participantAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  participantRoleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  participantRoleBadgeText: {
    fontSize: 9,
    color: 'white',
    fontWeight: '600',
  },
  noParticipants: {
    padding: 40,
    alignItems: 'center',
  },
  noParticipantsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

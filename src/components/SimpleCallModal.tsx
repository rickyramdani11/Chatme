import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface SimpleCallModalProps {
  visible: boolean;
  callType: 'video' | 'audio';
  targetUser: any;
  callTimer: number;
  callCost: number;
  totalDeducted: number;
  isMuted?: boolean;
  isVideoOff?: boolean;
  onMuteToggle?: () => void;
  onVideoToggle?: () => void;
  onEndCall: () => void;
}

export default function SimpleCallModal({
  visible,
  callType,
  targetUser,
  callTimer,
  callCost,
  totalDeducted,
  isMuted = false,
  isVideoOff = false,
  onMuteToggle,
  onVideoToggle,
  onEndCall,
}: SimpleCallModalProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onEndCall}
    >
      <LinearGradient
        colors={['#1a1a1a', '#2a2a2a']}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.callTypeText}>
            {callType === 'video' ? 'Video Call' : 'Audio Call'}
          </Text>
          <View style={styles.statusIndicator}>
            <View style={styles.activeDot} />
            <Text style={styles.statusText}>Connected</Text>
          </View>
        </View>

        {/* User Info */}
        <View style={styles.userContainer}>
          {targetUser?.avatar ? (
            <Image
              source={{ uri: targetUser.avatar }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.defaultAvatar}>
              <Text style={styles.avatarInitial}>
                {targetUser?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <Text style={styles.username}>{targetUser?.username || 'User'}</Text>
        </View>

        {/* Call Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Ionicons name="time-outline" size={24} color="#FF9800" />
            <Text style={styles.statValue}>{formatTime(callTimer)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>

          <View style={styles.statBox}>
            <Ionicons name="cash-outline" size={24} color="#4CAF50" />
            <Text style={styles.statValue}>{callCost}</Text>
            <Text style={styles.statLabel}>Est. Cost</Text>
          </View>

          <View style={styles.statBox}>
            <Ionicons name="wallet-outline" size={24} color="#2196F3" />
            <Text style={styles.statValue}>{totalDeducted}</Text>
            <Text style={styles.statLabel}>Deducted</Text>
          </View>
        </View>

        {/* Call Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            💰 First minute: 2,500 coins
          </Text>
          <Text style={styles.infoText}>
            💰 After 1st minute: 2,000 coins/min
          </Text>
          <Text style={styles.noteText}>
            Coins are deducted every 20 seconds
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.activeControl]}
            onPress={onMuteToggle}
          >
            <Ionicons
              name={isMuted ? 'mic-off' : 'mic'}
              size={28}
              color="#fff"
            />
            <Text style={styles.controlLabel}>
              {isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          {callType === 'video' && (
            <TouchableOpacity
              style={[styles.controlButton, isVideoOff && styles.activeControl]}
              onPress={onVideoToggle}
            >
              <Ionicons
                name={isVideoOff ? 'videocam-off' : 'videocam'}
                size={28}
                color="#fff"
              />
              <Text style={styles.controlLabel}>
                {isVideoOff ? 'Camera Off' : 'Camera On'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.controlButton, styles.endCallButton]}
            onPress={onEndCall}
          >
            <Ionicons name="call" size={28} color="#fff" />
            <Text style={styles.controlLabel}>End Call</Text>
          </TouchableOpacity>
        </View>

        {/* Note */}
        <Text style={styles.bottomNote}>
          📹 Full video streaming requires Daily.co setup
        </Text>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  callTypeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  statusText: {
    color: '#4CAF50',
    fontSize: 14,
  },
  userContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
    borderWidth: 3,
    borderColor: '#FF9800',
  },
  defaultAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 3,
    borderColor: '#FF9800',
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  infoContainer: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 30,
  },
  infoText: {
    color: '#FF9800',
    fontSize: 14,
    marginBottom: 5,
  },
  noteText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 5,
    fontStyle: 'italic',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 25,
    paddingHorizontal: 20,
  },
  controlButton: {
    alignItems: 'center',
    padding: 15,
    borderRadius: 50,
    backgroundColor: '#4a4a4a',
    minWidth: 80,
  },
  activeControl: {
    backgroundColor: '#FF9800',
  },
  endCallButton: {
    backgroundColor: '#F44336',
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 5,
    fontWeight: '500',
  },
  bottomNote: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    marginTop: 20,
    fontStyle: 'italic',
  },
});

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Daily from '@daily-co/react-native-daily-js';

const DailyMediaView = (Daily as any).DailyMediaView || ((props: any) => null);

interface DailyCallModalProps {
  visible: boolean;
  callType: 'video' | 'audio';
  targetUser: any;
  callTimer: number;
  callCost: number;
  totalDeducted: number;
  roomUrl?: string;
  token: string;
  onEndCall: () => void;
}

const ParticipantView = ({ participant, callObject }: { participant: any; callObject: any }) => {
  const isLocal = participant?.local;

  if (!DailyMediaView || !callObject) {
    return null;
  }

  return (
    <View 
      style={[
        styles.participantVideo,
        isLocal ? styles.localVideo : styles.remoteVideo
      ]}
    >
      <DailyMediaView
        callObject={callObject}
        sessionId={participant.session_id}
        mirror={isLocal}
        zOrder={isLocal ? 1 : 0}
        objectFit="cover"
        style={styles.mediaView}
      />
      <Text style={styles.participantLabel}>
        {isLocal ? 'You' : (participant.user_name || 'Guest')}
      </Text>
    </View>
  );
};

export default function DailyCallModal({
  visible,
  callType,
  targetUser,
  callTimer,
  callCost,
  totalDeducted,
  roomUrl,
  token,
  onEndCall,
}: DailyCallModalProps) {
  const callObject = useRef<any>(null);
  const updateParticipantsRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any>({});

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!visible || !roomUrl) return;

    const initCall = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('📹 Initializing Daily.co call:', roomUrl);
        
        // Create call object
        callObject.current = Daily.createCallObject();
        
        // Listen for participant events - store handler in ref for cleanup
        updateParticipantsRef.current = () => {
          if (callObject.current) {
            setParticipants(callObject.current.participants());
          }
        };

        callObject.current.on('participant-joined', updateParticipantsRef.current);
        callObject.current.on('participant-updated', updateParticipantsRef.current);
        callObject.current.on('participant-left', updateParticipantsRef.current);
        
        // Join room
        await callObject.current.join({ url: roomUrl });
        
        console.log('✅ Successfully joined Daily.co room');
        
        // Set initial audio/video state
        if (callType === 'audio') {
          await callObject.current.setLocalVideo(false);
        }
        
        // Get initial participants
        updateParticipantsRef.current();
        
        setIsLoading(false);
      } catch (err: any) {
        console.error('❌ Failed to join Daily.co room:', err);
        setError(err.message || 'Failed to join call');
        setIsLoading(false);
        Alert.alert('Call Error', 'Failed to connect to video call. Please try again.');
      }
    };

    initCall();

    return () => {
      if (callObject.current && updateParticipantsRef.current) {
        callObject.current.off('participant-joined', updateParticipantsRef.current);
        callObject.current.off('participant-updated', updateParticipantsRef.current);
        callObject.current.off('participant-left', updateParticipantsRef.current);
        callObject.current.leave().catch(console.error);
        callObject.current.destroy().catch(console.error);
      }
    };
  }, [visible, roomUrl, callType]);

  const handleMuteToggle = async () => {
    if (!callObject.current) return;
    
    try {
      await callObject.current.setLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  };

  const handleVideoToggle = async () => {
    if (!callObject.current) return;
    
    try {
      await callObject.current.setLocalVideo(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    } catch (err) {
      console.error('Failed to toggle video:', err);
    }
  };

  const handleEndCall = async () => {
    if (callObject.current) {
      try {
        await callObject.current.leave();
        await callObject.current.destroy();
      } catch (err) {
        console.error('Error leaving call:', err);
      }
    }
    onEndCall();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleEndCall}
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

        {/* Daily.co Video Container */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF9800" />
            <Text style={styles.loadingText}>Connecting...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.videoContainer}>
            {/* Render participant videos */}
            {Object.values(participants).map((participant: any) => (
              <ParticipantView 
                key={participant.session_id} 
                participant={participant}
                callObject={callObject.current}
              />
            ))}

            {/* User Info Overlay for Audio Calls */}
            {callType === 'audio' && Object.keys(participants).length === 0 && (
              <View style={styles.audioOverlay}>
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
            )}
          </View>
        )}

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

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.activeControl]}
            onPress={handleMuteToggle}
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
              onPress={handleVideoToggle}
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
            onPress={handleEndCall}
          >
            <Ionicons name="call" size={28} color="#fff" />
            <Text style={styles.controlLabel}>End Call</Text>
          </TouchableOpacity>
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
    marginBottom: 20,
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
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  participantVideo: {
    position: 'relative',
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  localVideo: {
    width: '100%',
    height: '50%',
  },
  remoteVideo: {
    width: '100%',
    height: '50%',
  },
  mediaView: {
    width: '100%',
    height: '100%',
  },
  participantLabel: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    color: '#F44336',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  audioOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    borderWidth: 4,
    borderColor: '#FF9800',
  },
  defaultAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 4,
    borderColor: '#FF9800',
  },
  avatarInitial: {
    fontSize: 50,
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
    marginBottom: 20,
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 25,
    paddingHorizontal: 20,
    marginBottom: 20,
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
  infoContainer: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 20,
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
});

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  createAgoraRtcEngine,
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
} from 'react-native-agora';

interface AgoraCallModalProps {
  visible: boolean;
  callType: 'video' | 'audio';
  targetUser: any;
  callTimer: number;
  callCost: number;
  totalDeducted: number;
  channelName: string;
  token: string;
  onEndCall: () => void;
}

const AGORA_APP_ID = process.env.AGORA_APP_ID || '';

export default function AgoraCallModal({
  visible,
  callType,
  targetUser,
  callTimer,
  callCost,
  totalDeducted,
  channelName,
  token,
  onEndCall,
}: AgoraCallModalProps) {
  const agoraEngineRef = useRef<IRtcEngine | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio');
  const [error, setError] = useState<string | null>(null);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isJoined, setIsJoined] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        
        const cameraGranted = granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
        const audioGranted = granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED;
        
        return cameraGranted && audioGranted;
      } catch (err) {
        console.error('Permission request failed:', err);
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    if (!visible || !channelName) return;

    const initCall = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Request permissions
        const hasPermissions = await requestPermissions();
        if (!hasPermissions) {
          setError('Camera and microphone permissions are required');
          setIsLoading(false);
          return;
        }

        console.log('📹 Initializing Agora call:', channelName);
        
        // Create Agora engine
        const engine = createAgoraRtcEngine();
        agoraEngineRef.current = engine;

        // Initialize engine
        engine.initialize({
          appId: AGORA_APP_ID,
        });

        // Enable video for video calls
        if (callType === 'video') {
          engine.enableVideo();
        } else {
          engine.enableAudio();
        }

        // Set up event handlers
        engine.registerEventHandler({
          onJoinChannelSuccess: (connection, elapsed) => {
            console.log('✅ Successfully joined Agora channel');
            setIsJoined(true);
            setIsLoading(false);
          },
          onUserJoined: (connection, uid, elapsed) => {
            console.log('👤 Remote user joined:', uid);
            setRemoteUid(uid);
          },
          onUserOffline: (connection, uid, reason) => {
            console.log('👤 Remote user left:', uid);
            setRemoteUid(null);
          },
          onError: (err, msg) => {
            console.error('❌ Agora error:', err, msg);
            setError(msg || 'Call error occurred');
          },
        });

        // Join channel
        engine.joinChannel(token || '', channelName, 0, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
        });

      } catch (err: any) {
        console.error('❌ Failed to join Agora channel:', err);
        setError(err.message || 'Failed to join call');
        setIsLoading(false);
        Alert.alert('Call Error', 'Failed to connect to video call. Please try again.');
      }
    };

    initCall();

    return () => {
      if (agoraEngineRef.current) {
        agoraEngineRef.current.leaveChannel();
        agoraEngineRef.current.release();
        agoraEngineRef.current = null;
      }
    };
  }, [visible, channelName, callType]);

  const handleMuteToggle = async () => {
    if (!agoraEngineRef.current) return;
    
    try {
      await agoraEngineRef.current.muteLocalAudioStream(!isMuted);
      setIsMuted(!isMuted);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  };

  const handleVideoToggle = async () => {
    if (!agoraEngineRef.current) return;
    
    try {
      await agoraEngineRef.current.muteLocalVideoStream(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    } catch (err) {
      console.error('Failed to toggle video:', err);
    }
  };

  const handleEndCall = async () => {
    if (agoraEngineRef.current) {
      try {
        await agoraEngineRef.current.leaveChannel();
        await agoraEngineRef.current.release();
        agoraEngineRef.current = null;
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
            <Text style={styles.statusText}>
              {isJoined ? 'Connected' : 'Connecting...'}
            </Text>
          </View>
        </View>

        {/* Video/Audio Container */}
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
            {/* User Info for Audio or when no remote user */}
            {(callType === 'audio' || !remoteUid) && (
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
                {remoteUid ? (
                  <Text style={styles.connectedText}>Connected</Text>
                ) : (
                  <Text style={styles.waitingText}>Waiting for user to join...</Text>
                )}
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
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 10,
  },
  connectedText: {
    fontSize: 14,
    color: '#4CAF50',
  },
  waitingText: {
    fontSize: 14,
    color: '#aaa',
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

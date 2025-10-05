import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Daily from '@daily-co/react-native-daily-js';
import { DailyMediaView } from '@daily-co/react-native-daily-js';

interface DailyCallModalProps {
  visible: boolean;
  callType: 'video' | 'audio';
  targetUser: any;
  callTimer: number;
  callCost: number;
  totalDeducted: number;
  channelName: string;
  roomUrl?: string;
  token: string;
  onEndCall: () => void;
}

const DAILY_API_KEY = process.env.DAILY_API_KEY || '';
const DAILY_DOMAIN = process.env.DAILY_DOMAIN || '';

function CallContent({
  callType,
  targetUser,
  callTimer,
  callCost,
  totalDeducted,
  channelName,
  roomUrl,
  onEndCall,
}: Omit<DailyCallModalProps, 'visible' | 'token'>) {
  const [isLoading, setIsLoading] = useState(true);
  const [isJoined, setIsJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio');
  const [participants, setParticipants] = useState<any>({});
  const isLeavingRef = useRef(false);
  const callObjectRef = useRef<any>(null);

  useEffect(() => {
    const joinCall = async () => {
      try {
        const call = Daily.createCallObject();
        callObjectRef.current = call;

        call.on('joined-meeting', () => {
          console.log('✅ Successfully joined Daily meeting');
          setIsJoined(true);
          setIsLoading(false);
          setParticipants(call.participants());
        });

        call.on('left-meeting', () => {
          console.log('👋 Left Daily meeting');
          if (!isLeavingRef.current) {
            isLeavingRef.current = true;
            onEndCall();
          }
        });

        call.on('participant-joined', () => {
          console.log('👤 Participant joined');
          setParticipants(call.participants());
        });

        call.on('participant-updated', () => {
          setParticipants(call.participants());
        });

        call.on('participant-left', () => {
          console.log('👤 Participant left');
          setParticipants(call.participants());
        });

        call.on('error', (ev: any) => {
          console.error('❌ Daily error:', ev);
          setError(ev.errorMsg || 'Call error occurred');
          setIsLoading(false);
        });

        const joinUrl = roomUrl || (DAILY_DOMAIN 
          ? `https://${DAILY_DOMAIN}.daily.co/${channelName}`
          : `https://chatme.daily.co/${channelName}`);

        await call.join({
          url: joinUrl,
          audioSource: true,
          videoSource: callType === 'video',
        });
      } catch (err: any) {
        console.error('❌ Failed to join call:', err);
        setError(err.message || 'Failed to join call');
        setIsLoading(false);
      }
    };

    joinCall();

    return () => {
      if (callObjectRef.current && !isLeavingRef.current) {
        try {
          callObjectRef.current.destroy();
        } catch (err) {
          console.error('Error cleaning up call:', err);
        }
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMuteToggle = () => {
    if (callObjectRef.current) {
      callObjectRef.current.setLocalAudio(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const handleVideoToggle = () => {
    if (callObjectRef.current) {
      callObjectRef.current.setLocalVideo(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleEndCall = async () => {
    if (isLeavingRef.current) return;
    
    isLeavingRef.current = true;
    try {
      if (callObjectRef.current) {
        await callObjectRef.current.leave();
        callObjectRef.current.destroy();
      }
    } catch (err) {
      console.error('Error leaving call:', err);
    }
    onEndCall();
  };

  const participantsArray = Object.values(participants);
  const localParticipant = participantsArray.find((p: any) => p.local);
  const remoteParticipants = participantsArray.filter((p: any) => !p.local);

  const getVideoTrack = (participant: any) => {
    return participant?.tracks?.video?.persistentTrack || null;
  };

  const getAudioTrack = (participant: any) => {
    return participant?.tracks?.audio?.persistentTrack || null;
  };

  return (
    <LinearGradient colors={['#1a1a1a', '#2a2a2a']} style={styles.container}>
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
          {remoteParticipants.length > 0 ? (
            <View style={styles.remoteVideoContainer}>
              {remoteParticipants.map((participant: any) => (
                <DailyMediaView
                  key={participant.session_id}
                  videoTrack={getVideoTrack(participant)}
                  audioTrack={getAudioTrack(participant)}
                  mirror={false}
                  zOrder={0}
                  style={styles.videoStream}
                />
              ))}
            </View>
          ) : (
            <View style={styles.audioOverlay}>
              {targetUser?.avatar ? (
                <Image source={{ uri: targetUser.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.defaultAvatar}>
                  <Text style={styles.avatarInitial}>
                    {targetUser?.username?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
              <Text style={styles.username}>{targetUser?.username || 'User'}</Text>
              <Text style={styles.waitingText}>Waiting for user to join...</Text>
            </View>
          )}

          {callType === 'video' && !isVideoOff && localParticipant && getVideoTrack(localParticipant) && (
            <View style={styles.localVideoContainer}>
              <DailyMediaView
                videoTrack={getVideoTrack(localParticipant)}
                mirror={true}
                zOrder={1}
                style={styles.videoStream}
              />
            </View>
          )}
        </View>
      )}

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

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.activeControl]}
          onPress={handleMuteToggle}
        >
          <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={28} color="#fff" />
          <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
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

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>💰 First minute: 2,500 coins</Text>
        <Text style={styles.infoText}>💰 After 1st minute: 2,000 coins/min</Text>
        <Text style={styles.noteText}>Coins are deducted every 20 seconds</Text>
      </View>
    </LinearGradient>
  );
}

export default function DailyCallModal(props: DailyCallModalProps) {
  if (!props.visible) return null;

  if (!DAILY_API_KEY && !DAILY_DOMAIN) {
    return (
      <Modal visible={props.visible} animationType="slide" onRequestClose={props.onEndCall}>
        <LinearGradient colors={['#1a1a1a', '#2a2a2a']} style={styles.container}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
            <Text style={styles.errorText}>
              Daily.co API key or domain not configured. Please set DAILY_API_KEY or DAILY_DOMAIN in environment.
            </Text>
            <TouchableOpacity
              style={[styles.controlButton, styles.endCallButton, { marginTop: 20 }]}
              onPress={props.onEndCall}
            >
              <Text style={styles.controlLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Modal>
    );
  }

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onEndCall}>
      <CallContent {...props} />
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
  remoteVideoContainer: {
    width: '100%',
    height: '100%',
  },
  videoStream: {
    width: '100%',
    height: '100%',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 120,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF9800',
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

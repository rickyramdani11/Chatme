import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DailyIframe, {
  DailyCall,
  DailyEvent,
  DailyEventObjectParticipant,
} from '@daily-co/react-native-daily-js';

interface VideoCallModalProps {
  visible: boolean;
  roomUrl: string;
  callType: 'video' | 'audio';
  onEnd: () => void;
  onError?: (error: string) => void;
}

export default function VideoCallModal({
  visible,
  roomUrl,
  callType,
  onEnd,
  onError,
}: VideoCallModalProps) {
  const callObjectRef = useRef<DailyCall | null>(null);
  const [isJoining, setIsJoining] = useState(true);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio');

  useEffect(() => {
    if (!visible || !roomUrl) return;

    const initializeCall = async () => {
      try {
        setIsJoining(true);

        // Create Daily call object
        const callObject = DailyIframe.createCallObject({
          audioSource: true,
          videoSource: callType === 'video',
        });

        callObjectRef.current = callObject;

        // Set up event listeners
        callObject
          .on('joined-meeting', handleJoinedMeeting)
          .on('participant-joined', handleParticipantJoined)
          .on('participant-updated', handleParticipantUpdated)
          .on('participant-left', handleParticipantLeft)
          .on('error', handleError)
          .on('left-meeting', handleLeftMeeting);

        // Join the room
        await callObject.join({ url: roomUrl });
      } catch (error: any) {
        console.error('Error joining call:', error);
        setIsJoining(false);
        onError?.(error.message || 'Failed to join call');
        Alert.alert('Call Error', 'Failed to join the call. Please try again.');
      }
    };

    initializeCall();

    return () => {
      // Cleanup when modal is closed
      if (callObjectRef.current) {
        callObjectRef.current.destroy();
        callObjectRef.current = null;
      }
    };
  }, [visible, roomUrl]);

  const handleJoinedMeeting = (event?: any) => {
    console.log('Joined meeting:', event);
    setIsJoining(false);
    
    if (callObjectRef.current) {
      const participants = callObjectRef.current.participants();
      setParticipants(Object.values(participants));
    }
  };

  const handleParticipantJoined = (event?: DailyEventObjectParticipant) => {
    console.log('Participant joined:', event);
    if (callObjectRef.current) {
      const participants = callObjectRef.current.participants();
      setParticipants(Object.values(participants));
    }
  };

  const handleParticipantUpdated = (event?: DailyEventObjectParticipant) => {
    if (callObjectRef.current) {
      const participants = callObjectRef.current.participants();
      setParticipants(Object.values(participants));
    }
  };

  const handleParticipantLeft = (event?: DailyEventObjectParticipant) => {
    console.log('Participant left:', event);
    if (callObjectRef.current) {
      const participants = callObjectRef.current.participants();
      setParticipants(Object.values(participants));
      
      // If no other participants, end call
      if (Object.keys(participants).length <= 1) {
        handleEndCall();
      }
    }
  };

  const handleError = (event?: any) => {
    console.error('Call error:', event);
    onError?.(event?.errorMsg || 'An error occurred during the call');
  };

  const handleLeftMeeting = () => {
    console.log('Left meeting');
    onEnd();
  };

  const handleEndCall = async () => {
    try {
      if (callObjectRef.current) {
        await callObjectRef.current.leave();
      }
      onEnd();
    } catch (error) {
      console.error('Error ending call:', error);
      onEnd();
    }
  };

  const toggleMute = async () => {
    if (callObjectRef.current) {
      const newMutedState = !isMuted;
      await callObjectRef.current.setLocalAudio(!newMutedState);
      setIsMuted(newMutedState);
    }
  };

  const toggleVideo = async () => {
    if (callObjectRef.current && callType === 'video') {
      const newVideoState = !isVideoOff;
      await callObjectRef.current.setLocalVideo(!newVideoState);
      setIsVideoOff(newVideoState);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleEndCall}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {callType === 'video' ? 'Video Call' : 'Audio Call'}
          </Text>
          <Text style={styles.participantCount}>
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Video Container */}
        <View style={styles.videoContainer}>
          {isJoining ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF9800" />
              <Text style={styles.loadingText}>Joining call...</Text>
            </View>
          ) : (
            <View style={styles.participantView}>
              <Ionicons 
                name={callType === 'video' ? 'videocam' : 'call'} 
                size={80} 
                color="#FF9800" 
              />
              <Text style={styles.participantText}>
                {participants.length > 1 ? 'In call' : 'Waiting for others to join...'}
              </Text>
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity 
            style={[styles.controlButton, isMuted && styles.activeControl]}
            onPress={toggleMute}
          >
            <Ionicons 
              name={isMuted ? 'mic-off' : 'mic'} 
              size={28} 
              color="#fff" 
            />
          </TouchableOpacity>

          {callType === 'video' && (
            <TouchableOpacity 
              style={[styles.controlButton, isVideoOff && styles.activeControl]}
              onPress={toggleVideo}
            >
              <Ionicons 
                name={isVideoOff ? 'videocam-off' : 'videocam'} 
                size={28} 
                color="#fff" 
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.controlButton, styles.endCallButton]}
            onPress={handleEndCall}
          >
            <Ionicons name="call" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a2a',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  participantCount: {
    fontSize: 14,
    color: '#aaa',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
  },
  participantView: {
    alignItems: 'center',
  },
  participantText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a2a',
    gap: 20,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4a4a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeControl: {
    backgroundColor: '#FF9800',
  },
  endCallButton: {
    backgroundColor: '#F44336',
  },
});

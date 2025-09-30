import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';

interface IncomingCallModalProps {
  visible: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'audio';
  onAccept: () => void;
  onDecline: () => void;
}

export default function IncomingCallModal({
  visible,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      playRingtone();
      startPulseAnimation();
    } else {
      stopRingtone();
      pulseAnim.setValue(1);
    }

    return () => {
      stopRingtone();
    };
  }, [visible]);

  const playRingtone = async () => {
    try {
      // Configure audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Use system notification sound as fallback
      // In future, add custom ringtone: require('../../assets/ringtone.mp3')
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
        { 
          isLooping: true,
          volume: 0.8,
        }
      );

      soundRef.current = sound;
      await sound.playAsync();
    } catch (error) {
      console.error('Error playing ringtone:', error);
      // Vibrate as fallback
    }
  };

  const stopRingtone = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (error) {
      console.error('Error stopping ringtone:', error);
    }
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handleAccept = async () => {
    await stopRingtone();
    onAccept();
  };

  const handleDecline = async () => {
    await stopRingtone();
    onDecline();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleDecline}
    >
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.8)', 'rgba(0, 0, 0, 0.9)']}
        style={styles.container}
      >
        <View style={styles.content}>
          {/* Caller Avatar with Pulse Effect */}
          <Animated.View 
            style={[
              styles.avatarContainer,
              { transform: [{ scale: pulseAnim }] }
            ]}
          >
            {callerAvatar ? (
              <Image 
                source={{ uri: callerAvatar }} 
                style={styles.avatar} 
              />
            ) : (
              <View style={styles.defaultAvatar}>
                <Text style={styles.avatarInitial}>
                  {callerName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Call Info */}
          <View style={styles.callInfo}>
            <Text style={styles.callerName}>{callerName}</Text>
            <Text style={styles.callType}>
              Incoming {callType === 'video' ? 'Video' : 'Audio'} Call
            </Text>
            <View style={styles.ringingContainer}>
              <Ionicons name="call" size={16} color="#4CAF50" />
              <Text style={styles.ringingText}>Ringing...</Text>
            </View>
          </View>

          {/* Call Actions */}
          <View style={styles.actions}>
            {/* Decline Button */}
            <TouchableOpacity 
              style={[styles.actionButton, styles.declineButton]}
              onPress={handleDecline}
            >
              <View style={styles.buttonInner}>
                <Ionicons name="close" size={32} color="#fff" />
                <Text style={styles.actionText}>Decline</Text>
              </View>
            </TouchableOpacity>

            {/* Accept Button */}
            <TouchableOpacity 
              style={[styles.actionButton, styles.acceptButton]}
              onPress={handleAccept}
            >
              <View style={styles.buttonInner}>
                <Ionicons 
                  name={callType === 'video' ? 'videocam' : 'call'} 
                  size={32} 
                  color="#fff" 
                />
                <Text style={styles.actionText}>Accept</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  avatarContainer: {
    marginBottom: 30,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#4CAF50',
  },
  defaultAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF9800',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#4CAF50',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  callInfo: {
    alignItems: 'center',
    marginBottom: 50,
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  callType: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 12,
  },
  ringingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ringingText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 40,
  },
  actionButton: {
    alignItems: 'center',
  },
  buttonInner: {
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: '#F44336',
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface RedEnvelopeAnimationProps {
  packet: {
    id: number;
    senderName: string;
    totalAmount: number;
    totalSlots: number;
    remainingSlots: number;
    message?: string;
  };
  onClaim: (packetId: number) => void;
  onClose: () => void;
  hasUserClaimed?: boolean;
}

export default function RedEnvelopeAnimation({ 
  packet, 
  onClaim, 
  onClose,
  hasUserClaimed = false
}: RedEnvelopeAnimationProps) {
  const fallAnim = useRef(new Animated.Value(-200)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const [showResult, setShowResult] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState(0);

  useEffect(() => {
    // Envelope drops from top
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(fallAnim, {
        toValue: SCREEN_HEIGHT * 0.25,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      })
    ]).start(() => {
      // Start floating animation after landing
      startFloating();
    });
  }, []);

  const startFloating = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -15,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        })
      ])
    ).start();
  };

  const handleClaim = () => {
    if (hasUserClaimed) {
      onClose();
      return;
    }

    // Explosion animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.2,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 150,
        useNativeDriver: true,
      })
    ]).start(() => {
      onClaim(packet.id);
    });
  };

  const showClaimSuccess = (amount: number) => {
    setClaimedAmount(amount);
    setShowResult(true);

    // Auto-close after 3 seconds
    setTimeout(() => {
      onClose();
    }, 3000);
  };

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: fadeAnim,
            transform: [
              { translateY: Animated.add(fallAnim, floatAnim) },
              { scale: scaleAnim }
            ],
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleClaim}
          activeOpacity={0.9}
          disabled={hasUserClaimed}
        >
          <LinearGradient
            colors={['#ff6b6b', '#ee5a6f', '#c44569']}
            style={styles.envelope}
          >
            {/* Gold Pattern */}
            <View style={styles.goldPattern}>
              <Text style={styles.goldText}>福</Text>
            </View>

            {/* Sender Name */}
            <Text style={styles.senderText}>{packet.senderName}'s</Text>
            <Text style={styles.titleText}>Red Packet</Text>

            {/* Message */}
            {packet.message && (
              <Text style={styles.messageText}>{packet.message}</Text>
            )}

            {/* Slots Info */}
            <View style={styles.slotsContainer}>
              <Ionicons name="people" size={16} color="rgba(255,255,255,0.9)" />
              <Text style={styles.slotsText}>
                {packet.remainingSlots} / {packet.totalSlots} left
              </Text>
            </View>

            {/* Tap Indicator */}
            {!hasUserClaimed && (
              <View style={styles.tapIndicator}>
                <Ionicons name="hand-left" size={20} color="#fff" />
                <Text style={styles.tapText}>TAP TO OPEN</Text>
              </View>
            )}

            {hasUserClaimed && (
              <View style={styles.claimedBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.claimedText}>Already Claimed</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </Animated.View>

      {/* Claim Success Modal */}
      <Modal visible={showResult} transparent animationType="fade">
        <View style={styles.resultOverlay}>
          <View style={styles.resultContainer}>
            <LinearGradient
              colors={['#FFD700', '#FFA500', '#FF8C00']}
              style={styles.resultContent}
            >
              <Text style={styles.congrats}>🎉 Congratulations! 🎉</Text>
              <View style={styles.amountContainer}>
                <Text style={styles.youGot}>You Got</Text>
                <Text style={styles.amount}>{claimedAmount}</Text>
                <Text style={styles.credits}>Credits 💰</Text>
              </View>
              <Text style={styles.fromText}>From {packet.senderName}</Text>
              
              {/* Confetti effect placeholder */}
              <View style={styles.confetti}>
                <Text style={styles.confettiIcon}>🎊 ✨ 🎁 ✨ 🎊</Text>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  envelope: {
    width: SCREEN_WIDTH * 0.75,
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  goldPattern: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldText: {
    fontSize: 24,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  senderText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginBottom: 5,
  },
  titleText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  messageText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 16,
    marginBottom: 15,
    textAlign: 'center',
  },
  slotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginVertical: 10,
    gap: 6,
  },
  slotsText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
  tapIndicator: {
    marginTop: 15,
    alignItems: 'center',
    gap: 5,
  },
  tapText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  claimedBadge: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  claimedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 20,
  },
  resultOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultContainer: {
    width: SCREEN_WIDTH * 0.8,
  },
  resultContent: {
    borderRadius: 25,
    padding: 30,
    alignItems: 'center',
  },
  congrats: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  youGot: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 5,
  },
  amount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  credits: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 5,
  },
  fromText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 20,
  },
  confetti: {
    marginTop: 10,
  },
  confettiIcon: {
    fontSize: 24,
  },
});

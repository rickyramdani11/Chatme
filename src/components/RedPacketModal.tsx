import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface RedPacketModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (totalAmount: number, totalSlots: number, message: string) => void;
  userBalance: number;
}

export default function RedPacketModal({ 
  visible, 
  onClose, 
  onSend,
  userBalance 
}: RedPacketModalProps) {
  const [totalAmount, setTotalAmount] = useState('');
  const [totalSlots, setTotalSlots] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = () => {
    const amount = parseInt(totalAmount);
    const slots = parseInt(totalSlots);

    // Validation
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount!');
      return;
    }

    if (amount < 9600) {
      Alert.alert('Error', 'Minimum amount is 9600 credits!');
      return;
    }

    if (!slots || slots <= 0) {
      Alert.alert('Error', 'Please enter number of users!');
      return;
    }

    if (slots < 5) {
      Alert.alert('Error', 'Minimum 5 users required to prevent coin transfer abuse!');
      return;
    }

    if (slots > 50) {
      Alert.alert('Error', 'Maximum 50 users allowed!');
      return;
    }

    if (amount < slots) {
      Alert.alert('Error', 'Amount must be at least equal to number of users!');
      return;
    }

    if (amount > userBalance) {
      Alert.alert('Insufficient Balance', `You only have ${userBalance} credits!`);
      return;
    }

    setLoading(true);
    onSend(amount, slots, message);
    
    // Reset form
    setTimeout(() => {
      setTotalAmount('');
      setTotalSlots('');
      setMessage('');
      setLoading(false);
      onClose();
    }, 500);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#ff6b6b', '#ee5a6f', '#c44569']}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerIcon}>🧧</Text>
              <Text style={styles.headerTitle}>Send Red Packet</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Balance Display */}
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>Your Balance:</Text>
              <Text style={styles.balanceAmount}>{userBalance} 💰</Text>
            </View>

            {/* Input Fields */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Total Amount (Min: 9600 Credits)</Text>
              <TextInput
                style={styles.input}
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="Min 9600 credits"
                placeholderTextColor="rgba(255,255,255,0.5)"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Number of Users (Min: 5)</Text>
              <TextInput
                style={styles.input}
                value={totalSlots}
                onChangeText={setTotalSlots}
                placeholder="Min 5 users (e.g., 10)"
                placeholderTextColor="rgba(255,255,255,0.5)"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Message (Optional)</Text>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder="Happy New Year! 🎉"
                placeholderTextColor="rgba(255,255,255,0.5)"
                maxLength={50}
              />
            </View>

            {/* Info Text */}
            <Text style={styles.infoText}>
              💡 Min 9600 credits, Min 5 users{'\n'}
              Amount will be randomly distributed
            </Text>

            {/* Send Button */}
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#c44569" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#c44569" />
                  <Text style={styles.sendButtonText}>Send Red Packet</Text>
                </>
              )}
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: 'transparent',
  },
  modalContent: {
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  headerIcon: {
    fontSize: 32,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    padding: 5,
  },
  balanceContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    padding: 15,
    color: '#fff',
    fontSize: 16,
  },
  infoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  sendButton: {
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendButtonText: {
    color: '#c44569',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

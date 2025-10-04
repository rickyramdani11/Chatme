import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks';
import { SOCKET_URL, API_BASE_URL } from '../utils/apiConfig';

export const GlobalIncomingCallManager: React.FC = () => {
  const { user, token } = useAuth();
  const navigation = useNavigation<any>();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token || !user) return;

    // Initialize global socket connection
    const socketInstance = io(SOCKET_URL, {
      path: '/socket.io/',
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
    });

    socketInstance.on('connect', () => {
      console.log('📞 Global incoming call manager connected');
      setSocket(socketInstance);
    });

    // Listen for incoming calls globally
    socketInstance.on('incoming-call', (callData) => {
      console.log('📞 Global incoming call received:', callData);
      
      const callTypeIcon = callData.callType === 'video' ? '📹' : '📞';
      
      Alert.alert(
        `${callTypeIcon} Incoming ${callData.callType === 'video' ? 'Video' : 'Audio'} Call`,
        `${callData.callerName} is calling you...`,
        [
          {
            text: 'Decline',
            style: 'cancel',
            onPress: () => {
              socketInstance.emit('call-response', {
                callerId: callData.callerId,
                response: 'decline',
                responderName: user.username,
                roomUrl: callData.roomUrl,
                callType: callData.callType
              });
            }
          },
          {
            text: 'Accept',
            onPress: async () => {
              try {
                // First, send accept response to caller
                socketInstance.emit('call-response', {
                  callerId: callData.callerId,
                  response: 'accept',
                  responderName: user.username,
                  roomUrl: callData.roomUrl,
                  callType: callData.callType
                });
                
                console.log('📞 Sent accept response to caller');
                
                // Create private chat room
                const response = await fetch(`${API_BASE_URL}/chat/private`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    otherUserId: callData.callerId
                  })
                });

                if (response.ok) {
                  const chatData = await response.json();
                  
                  console.log('📞 Private chat created for incoming call:', chatData);
                  
                  // Navigate to private chat screen with correct params and incoming call data
                  navigation.navigate('PrivateChat', {
                    roomId: chatData.roomId,
                    roomName: callData.callerName,
                    targetUser: {
                      id: callData.callerId,
                      username: callData.callerName
                    },
                    incomingCall: callData
                  });
                } else {
                  const errorData = await response.json();
                  console.error('Failed to create private chat:', errorData);
                  Alert.alert('Error', 'Failed to create private chat');
                }
              } catch (error) {
                console.error('Error creating private chat:', error);
                Alert.alert('Error', 'Failed to create private chat');
              }
            }
          }
        ],
        { cancelable: false }
      );
    });

    socketInstance.on('disconnect', () => {
      console.log('📞 Global incoming call manager disconnected');
      setSocket(null);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [token, user]);

  // This component doesn't render anything
  return null;
};

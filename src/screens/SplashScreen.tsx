
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const messageIconAnim = useRef(new Animated.Value(0)).current;
  const giftIconAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start animations sequence
    const startAnimations = () => {
      // Main logo fade in and scale up
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();

      // Message icon animation (delayed)
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(messageIconAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.loop(
            Animated.sequence([
              Animated.timing(messageIconAnim, {
                toValue: 0.7,
                duration: 800,
                useNativeDriver: true,
              }),
              Animated.timing(messageIconAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
              }),
            ])
          ),
        ]).start();
      }, 500);

      // Gift icon animation (delayed)
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(giftIconAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.loop(
            Animated.sequence([
              Animated.timing(giftIconAnim, {
                toValue: 0.7,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(giftIconAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
              }),
            ])
          ),
        ]).start();
      }, 800);

      // Rotation animation for floating icons
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        })
      ).start();

      // Pulse animation for title
      setTimeout(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }, 1200);
    };

    startAnimations();

    // Auto finish splash screen after 3.5 seconds
    const timer = setTimeout(() => {
      onFinish();
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  // Interpolate rotation
  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Message icon floating animation
  const messageTranslateY = messageIconAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, -10],
  });

  // Gift icon floating animation
  const giftTranslateY = giftIconAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-15, 15],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Gradient Background */}
      <LinearGradient
        colors={['#FF6B35', '#F7931E', '#FFB347', '#FF8E53']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Floating Background Icons */}
        <Animated.View
          style={[
            styles.floatingIcon,
            styles.floatingIcon1,
            {
              transform: [{ rotate }],
              opacity: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.2],
              }),
            },
          ]}
        >
          <Ionicons name="chatbubble-outline" size={60} color="#fff" />
        </Animated.View>

        <Animated.View
          style={[
            styles.floatingIcon,
            styles.floatingIcon2,
            {
              transform: [{ rotate: rotate.interpolate ? rotate : '0deg' }],
              opacity: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.15],
              }),
            },
          ]}
        >
          <Ionicons name="gift-outline" size={80} color="#fff" />
        </Animated.View>

        <Animated.View
          style={[
            styles.floatingIcon,
            styles.floatingIcon3,
            {
              transform: [{ rotate }],
              opacity: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.25],
              }),
            },
          ]}
        >
          <Ionicons name="heart-outline" size={45} color="#fff" />
        </Animated.View>

        {/* Main Content */}
        <View style={styles.content}>
          {/* App Title */}
          <Animated.View
            style={[
              styles.titleContainer,
              {
                opacity: fadeAnim,
                transform: [
                  { scale: scaleAnim },
                  { scale: pulseAnim },
                ],
              },
            ]}
          >
            <Text style={styles.title}>ChatMe</Text>
            <Text style={styles.subtitle}>Connect • Share • Enjoy</Text>
          </Animated.View>

          {/* Animated Icons Row */}
          <View style={styles.iconsContainer}>
            {/* Message Icon */}
            <Animated.View
              style={[
                styles.animatedIcon,
                {
                  opacity: messageIconAnim,
                  transform: [
                    { translateY: messageTranslateY },
                    { scale: messageIconAnim },
                  ],
                },
              ]}
            >
              <View style={styles.iconBackground}>
                <Ionicons name="chatbubbles" size={40} color="#FF6B35" />
              </View>
            </Animated.View>

            {/* Gift Icon */}
            <Animated.View
              style={[
                styles.animatedIcon,
                {
                  opacity: giftIconAnim,
                  transform: [
                    { translateY: giftTranslateY },
                    { scale: giftIconAnim },
                  ],
                },
              ]}
            >
              <View style={styles.iconBackground}>
                <Ionicons name="gift" size={40} color="#FF6B35" />
              </View>
            </Animated.View>
          </View>

          {/* Loading Text */}
          <Animated.View
            style={[
              styles.loadingContainer,
              {
                opacity: fadeAnim,
              },
            ]}
          >
            <Text style={styles.loadingText}>Loading...</Text>
            <View style={styles.dotsContainer}>
              <Animated.View
                style={[
                  styles.dot,
                  {
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.1],
                      outputRange: [0.3, 1],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.dot,
                  {
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.1],
                      outputRange: [0.5, 1],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.dot,
                  {
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.1],
                      outputRange: [0.7, 1],
                    }),
                  },
                ]}
              />
            </View>
          </Animated.View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingIcon: {
    position: 'absolute',
  },
  floatingIcon1: {
    top: height * 0.15,
    left: width * 0.1,
  },
  floatingIcon2: {
    top: height * 0.25,
    right: width * 0.15,
  },
  floatingIcon3: {
    bottom: height * 0.2,
    left: width * 0.2,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    marginTop: 8,
    opacity: 0.9,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  iconsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: width * 0.6,
    marginBottom: 60,
  },
  animatedIcon: {
    alignItems: 'center',
  },
  iconBackground: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginHorizontal: 4,
  },
});

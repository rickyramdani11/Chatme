
import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Dimensions, Image, Animated } from "react-native";
import { Video } from "expo-av";
import LottieView from 'lottie-react-native';

const { height, width } = Dimensions.get("window");

interface GiftVideoProps {
  visible: boolean;
  source: any;
  onEnd?: () => void;
  type?: 'video' | 'image' | 'png' | 'gif' | 'json' | 'lottie';
  giftData?: any;
  fullScreen?: boolean;
}

export default function GiftVideo({ visible, source, onEnd, type = 'video', giftData, fullScreen = false }: GiftVideoProps) {
  const [show, setShow] = useState(visible);
  const scaleAnim = useState(new Animated.Value(0.5))[0];
  const opacityAnim = useState(new Animated.Value(0))[0];
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (visible) {
      setShow(true);
      
      // Handle Lottie JSON animation
      if (type === 'json' || type === 'lottie') {
        // Lottie will autoplay by default
        // Auto close after animation duration (4 seconds default)
        const timer = setTimeout(() => {
          setShow(false);
          onEnd && onEnd();
        }, 4000);
        return () => clearTimeout(timer);
      }
      
      // Start PNG/GIF gift animation
      if (type === 'png' || type === 'image' || type === 'gif') {
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 80,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]).start();

        // Auto close PNG/GIF after 3-5 seconds (longer for GIF)
        const duration = type === 'gif' ? 5000 : 3000;
        const timer = setTimeout(() => {
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1.2,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setShow(false);
            onEnd && onEnd();
          });
        }, duration);

        return () => clearTimeout(timer);
      }
    }
  }, [visible, type, scaleAnim, opacityAnim, onEnd]);

  if (!show) return null;

  // Render Lottie JSON animation
  if (type === 'json' || type === 'lottie') {
    return (
      <View style={[fullScreen ? styles.fullScreenContainer : styles.container]} pointerEvents="none">
        <LottieView
          ref={lottieRef}
          source={source}
          autoPlay
          loop={false}
          style={[
            fullScreen ? styles.fullScreenLottie : styles.lottieMedium,
            giftData?.price >= 5000 ? styles.lottieLarge :
            giftData?.price >= 1000 ? styles.lottieMedium :
            styles.lottieStandard
          ]}
          onAnimationFinish={() => {
            setShow(false);
            onEnd && onEnd();
          }}
        />
      </View>
    );
  }

  // Render PNG/GIF gift
  if (type === 'png' || type === 'image' || type === 'gif') {
    return (
      <View style={[fullScreen ? styles.fullScreenContainer : styles.container]} pointerEvents="none">
        <Animated.View
          style={[
            styles.pngContainer,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <Image
            source={source}
            style={[
              styles.pngGift,
              // Dynamic sizing based on gift price/type and full screen mode
              fullScreen ? styles.fullScreenGift :
              giftData?.price >= 5000 ? styles.largePngGift :
              giftData?.price >= 1000 ? styles.mediumPngGift :
              styles.standardPngGift
            ]}
            resizeMode="contain"
            cache="force-cache"
          />
        </Animated.View>
      </View>
    );
  }

  // Render MP4 video gift - FULL SCREEN with SEMI-TRANSPARENT
  return (
    <View style={[fullScreen ? styles.fullScreenContainer : styles.container]} pointerEvents="none">
      <Video
        source={source}
        style={[
          fullScreen ? styles.fullScreenVideo : styles.video,
          { opacity: 0.5 } // Semi-transparent (50%)
        ]}
        resizeMode="contain"
        shouldPlay
        isLooping={false}
        isMuted={false}
        volume={0.8}
        onPlaybackStatusUpdate={(status) => {
          if (status.didJustFinish) {
            setShow(false);
            onEnd && onEnd();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    height: "50%", // hanya setengah layar bawah
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    zIndex: 9999,
  },
  fullScreenContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%", // full screen
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)", // subtle overlay
    zIndex: 9999,
  },
  video: {
    width: width * 0.8,
    height: height * 0.5, // tinggi maksimal setengah layar
  },
  fullScreenVideo: {
    width: width,
    height: height, // full screen video
  },
  pngContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  // Standard PNG gift (30x30 base, scaled to 200dp - INCREASED)
  standardPngGift: {
    width: 200,
    height: 200,
  },
  // Medium PNG gift (512x512 source, scaled to 280dp - INCREASED)
  mediumPngGift: {
    width: 280,
    height: 280,
  },
  // Large PNG gift (720x720+ source, scaled to 350dp - INCREASED)
  largePngGift: {
    width: 350,
    height: 350,
  },
  // Full screen gift for high-value gifts
  fullScreenGift: {
    width: width * 0.8,
    height: height * 0.6,
    maxWidth: 400,
    maxHeight: 400,
  },
  // Lottie animation styles
  lottieStandard: {
    width: 250,
    height: 250,
  },
  lottieMedium: {
    width: 320,
    height: 320,
  },
  lottieLarge: {
    width: 400,
    height: 400,
  },
  fullScreenLottie: {
    width: width * 0.85,
    height: height * 0.65,
  },
  pngGift: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
});


import React, { useEffect, useState } from "react";
import { View, StyleSheet, Dimensions, Image, Animated } from "react-native";
import { Video } from "expo-av";

const { height, width } = Dimensions.get("window");

interface GiftVideoProps {
  visible: boolean;
  source: any;
  onEnd?: () => void;
  type?: 'video' | 'image' | 'png';
  giftData?: any;
}

export default function GiftVideo({ visible, source, onEnd, type = 'video', giftData }: GiftVideoProps) {
  const [show, setShow] = useState(visible);
  const scaleAnim = useState(new Animated.Value(0.5))[0];
  const opacityAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) {
      setShow(true);
      // Start PNG gift animation
      if (type === 'png' || type === 'image') {
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

        // Auto close PNG after 3 seconds
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
        }, 3000);

        return () => clearTimeout(timer);
      }
    }
  }, [visible, type, scaleAnim, opacityAnim, onEnd]);

  if (!show) return null;

  // Render PNG gift
  if (type === 'png' || type === 'image') {
    return (
      <View style={styles.container} pointerEvents="none">
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
              // Dynamic sizing based on gift price/type
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

  // Render MP4 video gift
  return (
    <View style={styles.container} pointerEvents="none">
      <Video
        source={source}
        style={styles.video}
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
  video: {
    width: width * 0.8,
    height: height * 0.5, // tinggi maksimal setengah layar
  },
  pngContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  // Standard PNG gift (30x30 base, scaled to 120-150dp)
  standardPngGift: {
    width: 120,
    height: 120,
  },
  // Medium PNG gift (512x512 source, scaled to 180dp)
  mediumPngGift: {
    width: 180,
    height: 180,
  },
  // Large PNG gift (720x720+ source, scaled to 250dp)
  largePngGift: {
    width: 250,
    height: 250,
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

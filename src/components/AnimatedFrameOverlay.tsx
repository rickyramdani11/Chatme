import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

interface AnimatedFrameOverlayProps {
  frameImage?: string | null;
  animationUrl?: string | null;
  size?: number;
  style?: any;
}

export default function AnimatedFrameOverlay({ 
  frameImage, 
  animationUrl, 
  size = 120,
  style 
}: AnimatedFrameOverlayProps) {
  
  if (!frameImage && !animationUrl) {
    return null;
  }

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {animationUrl ? (
        <LottieView
          source={{ uri: animationUrl }}
          autoPlay
          loop
          style={{
            width: size,
            height: size,
          }}
          resizeMode="cover"
        />
      ) : frameImage ? (
        <Image
          source={{ uri: frameImage }}
          style={{
            width: size,
            height: size,
          }}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
    pointerEvents: 'none',
  },
});

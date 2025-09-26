
import React, { useEffect, useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Video } from "expo-av";

const { height, width } = Dimensions.get("window");

interface GiftVideoProps {
  visible: boolean;
  source: any;
  onEnd?: () => void;
}

export default function GiftVideo({ visible, source, onEnd }: GiftVideoProps) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShow(true);
    }
  }, [visible]);

  if (!show) return null;

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
});

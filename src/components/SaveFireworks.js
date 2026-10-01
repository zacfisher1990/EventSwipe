import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

// A short fireworks celebration shown over the screen when an event is saved.
// Purely decorative: never intercepts touches, and is skipped when the device
// has Reduce Motion turned on.

const COLORS = ['#4ECDC4', '#FF6B6B', '#FFD93D', '#FF9F43', '#A8E6CF', '#ffffff'];
const PARTICLES_PER_BURST = 16;
const BURST_DURATION = 900;
// Where each burst goes off, as a fraction of the screen, and when (ms)
const BURSTS = [
  { x: 0.72, y: 0.32, delay: 0, radius: 130 },
  { x: 0.30, y: 0.24, delay: 140, radius: 110 },
  { x: 0.55, y: 0.50, delay: 280, radius: 120 },
];

function Burst({ x, y, radius, delay, onDone }) {
  const progress = useRef(new Animated.Value(0)).current;

  // Fixed per burst so particles don't jump between renders
  const particles = useRef(
    Array.from({ length: PARTICLES_PER_BURST }, (_, i) => {
      const angle = (i / PARTICLES_PER_BURST) * Math.PI * 2 + Math.random() * 0.4;
      const distance = radius * (0.6 + Math.random() * 0.4);
      return {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        color: COLORS[i % COLORS.length],
        size: 9 + Math.round(Math.random() * 5),
      };
    })
  ).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: BURST_DURATION,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(onDone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const opacity = progress.interpolate({ inputRange: [0, 0.05, 0.6, 1], outputRange: [0, 1, 1, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1, 0.5] });

  return (
    <View style={[styles.origin, { left: x, top: y }]}>
      {/* Flash at the centre of the burst */}
      <Animated.View
        style={[
          styles.flash,
          {
            opacity: progress.interpolate({ inputRange: [0, 0.05, 0.4], outputRange: [0, 0.7, 0], extrapolate: 'clamp' }),
            transform: [{ scale: progress.interpolate({ inputRange: [0, 0.4], outputRange: [0.2, 2.2], extrapolate: 'clamp' }) }],
          },
        ]}
      />
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            backgroundColor: p.color,
            opacity,
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              // Sparks drift downward as they fade, like falling embers
              { translateY: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy * 0.85, p.dy + 28] }) },
              { scale },
            ],
          }}
        />
      ))}
    </View>
  );
}

const SaveFireworks = forwardRef(function SaveFireworks(_, ref) {
  const [shows, setShows] = useState([]); // one entry per fire() still animating
  const size = useRef({ width: 0, height: 0 });
  const reduceMotion = useRef(false);
  const nextId = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { reduceMotion.current = on; }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => { reduceMotion.current = on; });
    return () => sub?.remove?.();
  }, []);

  const fire = useCallback(() => {
    if (reduceMotion.current || !size.current.width) return;
    const id = nextId.current++;
    setShows((prev) => [...prev, id]);
  }, []);

  useImperativeHandle(ref, () => ({ fire }), [fire]);

  const lastBurst = BURSTS.length - 1;

  return (
    <View
      style={styles.overlay}
      pointerEvents="none"
      onLayout={(e) => { size.current = e.nativeEvent.layout; }}
    >
      {shows.map((id) =>
        BURSTS.map((b, i) => (
          <Burst
            key={`${id}-${i}`}
            x={b.x * size.current.width}
            y={b.y * size.current.height}
            radius={b.radius}
            delay={b.delay}
            // The last burst finishing ends this show
            onDone={i === lastBurst ? () => setShows((prev) => prev.filter((s) => s !== id)) : undefined}
          />
        ))
      )}
    </View>
  );
});

export default SaveFireworks;

const styles = StyleSheet.create({
  // Explicit stacking: the swiper's cards have zIndex (and elevation on
  // Android), and their plain wrapper views get flattened away, so without
  // this the next card is drawn over the fireworks.
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  origin: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  flash: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    marginLeft: -28,
    marginTop: -28,
    backgroundColor: '#fff',
  },
});

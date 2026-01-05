import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  PanResponder,
  Dimensions,
  Text,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const SWIPE_OUT_DURATION = 200;

/**
 * CardSwiper - A polished swiper using only React Native's built-in Animated API
 * No react-native-reanimated or react-native-gesture-handler required
 */
export default function CardSwiper({
  cards = [],
  renderCard,
  onSwipedLeft,
  onSwipedRight,
  onSwipedAll,
  onCardTap,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const position = useRef(new Animated.ValueXY()).current;
  const swipeInProgress = useRef(false);
  const tapStart = useRef({ x: 0, y: 0, time: 0 });

  // Reset position when currentIndex changes
  useEffect(() => {
    position.setValue({ x: 0, y: 0 });
  }, [currentIndex]);

  const resetPosition = useCallback(() => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 5,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [position]);

  const swipeOffScreen = useCallback((direction) => {
    if (swipeInProgress.current) return;
    swipeInProgress.current = true;

    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: true,
    }).start(() => {
      const item = cards[currentIndex];
      const index = currentIndex;
      
      // Update index FIRST (this triggers useEffect to reset position)
      setCurrentIndex(prev => {
        const next = prev + 1;
        if (next >= cards.length) {
          // Delay the onSwipedAll callback slightly
          setTimeout(() => onSwipedAll?.(), 50);
        }
        return next;
      });

      // Call the swipe callback
      if (direction === 'left') {
        onSwipedLeft?.(index, item);
      } else {
        onSwipedRight?.(index, item);
      }

      // Small delay before allowing next swipe
      setTimeout(() => {
        swipeInProgress.current = false;
      }, 50);
    });
  }, [currentIndex, cards, onSwipedLeft, onSwipedRight, onSwipedAll, position]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5;
      },
      onPanResponderGrant: (evt) => {
        tapStart.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
          time: Date.now(),
        };
      },
      onPanResponderMove: (_, gesture) => {
        if (!swipeInProgress.current) {
          position.setValue({ x: gesture.dx, y: gesture.dy * 0.5 });
        }
      },
      onPanResponderRelease: (evt, gesture) => {
        if (swipeInProgress.current) return;

        const dx = evt.nativeEvent.pageX - tapStart.current.x;
        const dy = evt.nativeEvent.pageY - tapStart.current.y;
        const duration = Date.now() - tapStart.current.time;
        
        // Check if it was a tap
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && duration < 200) {
          onCardTap?.(cards[currentIndex]);
          resetPosition();
          return;
        }

        // Check for swipe
        if (gesture.dx > SWIPE_THRESHOLD || gesture.vx > 0.5) {
          swipeOffScreen('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD || gesture.vx < -0.5) {
          swipeOffScreen('left');
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  // Rotation based on swipe position
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });

  // Opacity for NOPE label
  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH * 0.3, -SCREEN_WIDTH * 0.1, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  // Opacity for LIKE label
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_WIDTH * 0.1, SCREEN_WIDTH * 0.3],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  // Scale for the next card
  const nextCardScale = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [1, 0.95, 1],
    extrapolate: 'clamp',
  });

  // Translate Y for next card
  const nextCardTranslateY = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [0, 10, 0],
    extrapolate: 'clamp',
  });

  // Third card animations
  const thirdCardScale = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [0.95, 0.9, 0.95],
    extrapolate: 'clamp',
  });

  const thirdCardTranslateY = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [10, 20, 10],
    extrapolate: 'clamp',
  });

  const renderCards = () => {
    if (currentIndex >= cards.length) {
      return null;
    }

    const cardElements = [];

    // Render up to 3 cards (in reverse order so first is on top)
    for (let i = Math.min(2, cards.length - currentIndex - 1); i >= 0; i--) {
      const actualIndex = currentIndex + i;
      const item = cards[actualIndex];
      
      if (!item) continue;

      // Third card (bottom of stack)
      if (i === 2) {
        cardElements.push(
          <Animated.View
            key={`card-${actualIndex}-${item.id || actualIndex}`}
            style={[
              styles.cardContainer,
              {
                transform: [
                  { scale: thirdCardScale },
                  { translateY: thirdCardTranslateY },
                ],
                zIndex: 1,
              },
            ]}
          >
            {renderCard(item, actualIndex)}
          </Animated.View>
        );
      }
      // Second card (middle)
      else if (i === 1) {
        cardElements.push(
          <Animated.View
            key={`card-${actualIndex}-${item.id || actualIndex}`}
            style={[
              styles.cardContainer,
              {
                transform: [
                  { scale: nextCardScale },
                  { translateY: nextCardTranslateY },
                ],
                zIndex: 2,
              },
            ]}
          >
            {renderCard(item, actualIndex)}
          </Animated.View>
        );
      }
      // Top card (draggable)
      else if (i === 0) {
        cardElements.push(
          <Animated.View
            key={`card-${actualIndex}-${item.id || actualIndex}`}
            style={[
              styles.cardContainer,
              {
                transform: [
                  { translateX: position.x },
                  { translateY: position.y },
                  { rotate },
                ],
                zIndex: 3,
              },
            ]}
            {...panResponder.panHandlers}
          >
            {renderCard(item, actualIndex)}
            
            {/* NOPE overlay */}
            <Animated.View style={[styles.overlay, styles.overlayLeft, { opacity: nopeOpacity }]}>
              <View style={[styles.labelBox, styles.nopeBox]}>
                <Text style={styles.labelText}>NOPE</Text>
              </View>
            </Animated.View>
            
            {/* SAVE overlay */}
            <Animated.View style={[styles.overlay, styles.overlayRight, { opacity: likeOpacity }]}>
              <View style={[styles.labelBox, styles.likeBox]}>
                <Text style={styles.labelText}>SAVE</Text>
              </View>
            </Animated.View>
          </Animated.View>
        );
      }
    }

    return cardElements;
  };

  return <View style={styles.container}>{renderCards()}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    padding: 16,
  },
  overlay: {
    position: 'absolute',
    top: 50,
    zIndex: 1000,
  },
  overlayLeft: {
    right: 30,
  },
  overlayRight: {
    left: 30,
  },
  labelBox: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 3,
  },
  nopeBox: {
    backgroundColor: 'rgba(255, 107, 107, 0.9)',
    borderColor: '#FF6B6B',
  },
  likeBox: {
    backgroundColor: 'rgba(78, 205, 196, 0.9)',
    borderColor: '#4ECDC4',
  },
  labelText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
});
import React, { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  PanResponder,
  Dimensions,
  Text,
  TouchableWithoutFeedback,
} from 'react-native';
import i18n from '../i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const SWIPE_OUT_DURATION = 200;

const CardSwiper = forwardRef(function CardSwiper({
  cards = [],
  renderCard,
  onSwipedLeft,
  onSwipedRight,
  onSwipedAll,
  onCardTap,
}, ref) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const position = useRef(new Animated.ValueXY()).current;
  const swipeInProgress = useRef(false);

  const currentIndexRef = useRef(currentIndex);
  const cardsRef = useRef(cards);
  const onCardTapRef = useRef(onCardTap);
  
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  
  useEffect(() => {
    onCardTapRef.current = onCardTap;
  }, [onCardTap]);

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
      const item = cardsRef.current[currentIndexRef.current];
      const index = currentIndexRef.current;
      
      // Reset position BEFORE updating index — this ensures when React
      // re-renders with the new index, position is already at 0 so the
      // new top card doesn't flash at the old swiped-off position
      position.setValue({ x: 0, y: 0 });

      setCurrentIndex(prev => {
        const next = prev + 1;
        if (next >= cardsRef.current.length) {
          setTimeout(() => onSwipedAll?.(), 50);
        }
        return next;
      });

      if (direction === 'left') {
        onSwipedLeft?.(index, item);
      } else {
        onSwipedRight?.(index, item);
      }

      setTimeout(() => {
        swipeInProgress.current = false;
      }, 50);
    });
  }, [onSwipedLeft, onSwipedRight, onSwipedAll, position]);

  const swipeOffScreenRef = useRef(swipeOffScreen);
  const resetPositionRef = useRef(resetPosition);
  
  useEffect(() => {
    swipeOffScreenRef.current = swipeOffScreen;
  }, [swipeOffScreen]);
  
  useEffect(() => {
    resetPositionRef.current = resetPosition;
  }, [resetPosition]);

  useImperativeHandle(ref, () => ({
    swipeLeft: () => swipeOffScreenRef.current('left'),
    swipeRight: () => swipeOffScreenRef.current('right'),
  }));

  const panResponder = useRef(
    PanResponder.create({
      // Don't claim touch on start — let child buttons (tickets, etc.) receive taps
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        // Only claim when user is clearly dragging
        return Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8;
      },
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gesture) => {
        if (!swipeInProgress.current) {
          position.setValue({ x: gesture.dx, y: gesture.dy * 0.5 });
        }
      },
      onPanResponderRelease: (evt, gesture) => {
        if (swipeInProgress.current) return;

        if (gesture.dx > SWIPE_THRESHOLD || gesture.vx > 0.5) {
          swipeOffScreenRef.current('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD || gesture.vx < -0.5) {
          swipeOffScreenRef.current('left');
        } else {
          resetPositionRef.current();
        }
      },
    })
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH * 0.3, -SCREEN_WIDTH * 0.1, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_WIDTH * 0.1, SCREEN_WIDTH * 0.3],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  const renderCards = () => {
    if (currentIndex >= cards.length) {
      return null;
    }

    const cardElements = [];

    for (let i = Math.min(1, cards.length - currentIndex - 1); i >= 0; i--) {
      const actualIndex = currentIndex + i;
      const item = cards[actualIndex];
      
      if (!item) continue;

      const isTopCard = i === 0;

      cardElements.push(
        <Animated.View
          key={`card-${actualIndex}-${item.id || actualIndex}`}
          style={[
            styles.cardContainer,
            isTopCard
              ? {
                  transform: [
                    { translateX: position.x },
                    { translateY: position.y },
                    { rotate },
                  ],
                  zIndex: 3,
                }
              : {
                  zIndex: 2,
                },
          ]}
          {...(isTopCard ? panResponder.panHandlers : {})}
        >
          <TouchableWithoutFeedback
            onPress={isTopCard ? () => {
              const currentCard = cardsRef.current[currentIndexRef.current];
              onCardTapRef.current?.(currentCard);
            } : undefined}
          >
            <View style={styles.cardTouchable}>
              {renderCard(item, actualIndex)}
            </View>
          </TouchableWithoutFeedback>

          <Animated.View pointerEvents="none" style={[styles.overlay, styles.overlayLeft, { opacity: isTopCard ? nopeOpacity : 0 }]}>
            <View style={[styles.labelBox, styles.nopeBox]}>
              <Text style={styles.labelText}>{i18n.t('swipe.nope')}</Text>
            </View>
          </Animated.View>

          <Animated.View pointerEvents="none" style={[styles.overlay, styles.overlayRight, { opacity: isTopCard ? likeOpacity : 0 }]}>
            <View style={[styles.labelBox, styles.likeBox]}>
              <Text style={styles.labelText}>{i18n.t('swipe.save')}</Text>
            </View>
          </Animated.View>
        </Animated.View>
      );
    }

    return cardElements;
  };

  return <View style={styles.container}>{renderCards()}</View>;
});

export default CardSwiper;

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
  cardTouchable: {
    flex: 1,
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
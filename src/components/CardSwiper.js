import React, { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  PanResponder,
  Dimensions,
  Text,
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
  const [isDragging, setIsDragging] = useState(false);
  const position = useRef(new Animated.ValueXY()).current;
  const swipeInProgress = useRef(false);
  const tapStart = useRef({ x: 0, y: 0, time: 0 });

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
      const item = cardsRef.current[currentIndexRef.current];
      const index = currentIndexRef.current;
      
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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5;
      },
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
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
        setIsDragging(false);
        if (swipeInProgress.current) return;

        const dx = evt.nativeEvent.pageX - tapStart.current.x;
        const dy = evt.nativeEvent.pageY - tapStart.current.y;
        const duration = Date.now() - tapStart.current.time;
        
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && duration < 200) {
          const currentCard = cardsRef.current[currentIndexRef.current];
          onCardTapRef.current?.(currentCard);
          resetPositionRef.current();
          return;
        }

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

  const nextCardScale = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [1, 0.95, 1],
    extrapolate: 'clamp',
  });

  const nextCardTranslateY = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [0, 10, 0],
    extrapolate: 'clamp',
  });

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

    for (let i = Math.min(2, cards.length - currentIndex - 1); i >= 0; i--) {
      const actualIndex = currentIndex + i;
      const item = cards[actualIndex];
      
      if (!item) continue;

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
            
            {isDragging && (
              <Animated.View style={[styles.overlay, styles.overlayLeft, { opacity: nopeOpacity }]}>
                <View style={[styles.labelBox, styles.nopeBox]}>
                  <Text style={styles.labelText}>{i18n.t('swipe.nope')}</Text>
                </View>
              </Animated.View>
            )}
            
            {isDragging && (
              <Animated.View style={[styles.overlay, styles.overlayRight, { opacity: likeOpacity }]}>
                <View style={[styles.labelBox, styles.likeBox]}>
                  <Text style={styles.labelText}>{i18n.t('swipe.save')}</Text>
                </View>
              </Animated.View>
            )}
          </Animated.View>
        );
      }
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
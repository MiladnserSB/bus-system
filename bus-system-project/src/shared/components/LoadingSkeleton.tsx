import React, { useEffect, useState } from 'react';
import { Animated, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radii, Spacing } from '../theme';

interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = 18,
  borderRadius = Radii.sm,
  style,
}) => {
  const [pulse] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.box,
        { width, height, borderRadius, opacity: pulse },
        style,
      ]}
    />
  );
};

export const TripListSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <View style={styles.stack}>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={styles.card}>
          <View style={styles.rowBetween}>
            <SkeletonBox width={88} height={24} borderRadius={Radii.full} />
            <SkeletonBox width={110} height={22} />
          </View>
          <SkeletonBox width="70%" height={18} style={styles.mtMd} />
          <View style={[styles.rowBetween, styles.mtMd]}>
            <SkeletonBox width={120} height={44} borderRadius={Radii.md} />
            <SkeletonBox width={90} height={22} />
          </View>
        </View>
      ))}
    </View>
  );
};

export const SeatMapSkeleton: React.FC = () => {
  return (
    <View style={styles.stack}>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <SkeletonBox width={70} height={18} />
          <SkeletonBox width={70} height={18} />
          <SkeletonBox width={70} height={18} />
          <SkeletonBox width={70} height={18} />
        </View>
      </View>
      <View style={styles.card}>
        {Array.from({ length: 7 }).map((_, rowIdx) => (
          <View key={rowIdx} style={[styles.rowBetween, styles.mbSm]}>
            <View style={styles.seatPair}>
              <SkeletonBox width={44} height={48} borderRadius={Radii.sm} />
              <SkeletonBox width={44} height={48} borderRadius={Radii.sm} />
            </View>
            <SkeletonBox width={24} height={16} />
            <View style={styles.seatPair}>
              <SkeletonBox width={44} height={48} borderRadius={Radii.sm} />
              <SkeletonBox width={44} height={48} borderRadius={Radii.sm} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

export const TicketSkeleton: React.FC = () => {
  return (
    <View style={styles.card}>
      <View style={styles.centered}>
        <SkeletonBox width={140} height={20} />
        <SkeletonBox width={190} height={28} style={styles.mtSm} />
        <SkeletonBox width={200} height={200} borderRadius={Radii.lg} style={styles.mtLg} />
      </View>
      <SkeletonBox width="100%" height={16} style={styles.mtLg} />
      <SkeletonBox width="85%" height={16} style={styles.mtSm} />
      <SkeletonBox width="65%" height={16} style={styles.mtSm} />
    </View>
  );
};

export const CardListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <View style={styles.stack}>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={styles.card}>
          <SkeletonBox width="50%" height={18} />
          <SkeletonBox width="90%" height={14} style={styles.mtSm} />
          <SkeletonBox width="40%" height={14} style={styles.mtSm} />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#E2E8F0',
  },
  stack: {
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  seatPair: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  centered: {
    alignItems: 'center',
  },
  mtSm: { marginTop: Spacing.xs },
  mtMd: { marginTop: Spacing.md },
  mtLg: { marginTop: Spacing.lg },
  mbSm: { marginBottom: Spacing.sm },
});

import React from 'react';
import { I18nManager, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupSeatsIntoRows } from '../constants/helpers';
import { ArStrings } from '../i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '../theme';
import { SeatDto } from '../types/api.types';

interface SeatMapGridProps {
  seats: SeatDto[];
  selectedSeatNumbers: string[];
  busTypeName: string;
  layout: string;
  disabled?: boolean;
  onToggleSeat: (seat: SeatDto) => void;
}

export const SeatMapGrid: React.FC<SeatMapGridProps> = ({
  seats,
  selectedSeatNumbers,
  busTypeName,
  layout,
  disabled = false,
  onToggleSeat,
}) => {
  const rows = React.useMemo(() => groupSeatsIntoRows(seats), [seats]);
  const selectedSet = React.useMemo(
    () => new Set(selectedSeatNumbers),
    [selectedSeatNumbers],
  );

  const renderSeatButton = (seat: SeatDto) => {
    const isSelected = selectedSet.has(seat.seatNumber) || seat.status === 'HELD_BY_ME';
    const isBooked = seat.status === 'BOOKED';
    const isHeldOther = seat.status === 'HELD' && !selectedSet.has(seat.seatNumber);
    const isExtra = seat.isExtra || seat.side === 'MIDDLE';
    const isUnavailable = isBooked || isHeldOther || disabled;

    let bg: string = isExtra ? Colors.seatExtraBg : Colors.seatAvailable;
    let border: string = isExtra ? Colors.seatExtraBorder : Colors.seatAvailableBorder;
    let textColor: string = Colors.seatAvailableText;
    let statusIcon: React.ReactNode = null;
    let stateLabel: string = ArStrings.seats.legendAvailable;

    if (isSelected) {
      bg = Colors.seatSelected;
      border = Colors.seatSelectedBorder;
      textColor = Colors.seatSelectedText;
      statusIcon = <Text style={[styles.statusSymbol, { color: textColor }]}>✓</Text>;
      stateLabel = ArStrings.seats.legendSelected;
    } else if (isBooked) {
      bg = Colors.seatBooked;
      border = Colors.seatBookedBorder;
      textColor = Colors.seatBookedText;
      statusIcon = <Text style={[styles.statusSymbol, { color: textColor }]}>×</Text>;
      stateLabel = ArStrings.seats.legendBooked;
    } else if (isHeldOther) {
      bg = Colors.seatHeld;
      border = Colors.seatHeldBorder;
      textColor = Colors.seatHeldText;
      statusIcon = <Ionicons name="time-outline" size={12} color={textColor} />;
      stateLabel = ArStrings.seats.legendHeld;
    }

    return (
      <TouchableOpacity
        key={seat.seatNumber}
        onPress={() => onToggleSeat(seat)}
        disabled={isUnavailable && !isSelected}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled: isUnavailable && !isSelected }}
        accessibilityLabel={`مقعد ${seat.seatNumber} ${stateLabel}${isExtra ? ` (${ArStrings.seats.extraMiddleBadge})` : ''}`}
        style={[
          styles.seatTile,
          { backgroundColor: bg, borderColor: border },
          isExtra ? styles.extraSeatTile : null,
        ]}
      >
        <View style={styles.seatTopRow}>
          <Text style={[styles.seatCode, { color: textColor }]}>{seat.seatNumber}</Text>
          {statusIcon}
        </View>
        {isExtra ? (
          <Text style={[styles.extraTag, { color: isSelected ? Colors.accentLight : Colors.warning }]}>
            إضافي
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Accessible Status Legend (Color + Icon + Text) */}
      <View style={styles.legendCard}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.seatAvailable, borderColor: Colors.seatAvailableBorder }]} />
          <Text style={styles.legendText}>{ArStrings.seats.legendAvailable}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.seatSelected, borderColor: Colors.seatSelectedBorder }]}>
            <Text style={styles.legendCheck}>✓</Text>
          </View>
          <Text style={styles.legendText}>{ArStrings.seats.legendSelected}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.seatHeld, borderColor: Colors.seatHeldBorder }]}>
            <Ionicons name="time-outline" size={11} color={Colors.seatHeldText} />
          </View>
          <Text style={styles.legendText}>{ArStrings.seats.legendHeld}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.seatBooked, borderColor: Colors.seatBookedBorder }]}>
            <Text style={[styles.legendCross, { color: Colors.seatBookedText }]}>×</Text>
          </View>
          <Text style={styles.legendText}>{ArStrings.seats.legendBooked}</Text>
        </View>
      </View>

      {/* Bus Body Container */}
      <View style={styles.busFrame}>
        <View style={styles.cockpitBar}>
          <View style={styles.layoutBadge}>
            <Text style={styles.layoutBadgeText}>
              {busTypeName} · {layout}
            </Text>
          </View>
          <View style={styles.driverGroup}>
            <Text style={styles.cockpitText}>{ArStrings.seats.frontOfBus}</Text>
            <View style={styles.steeringBadge}>
              <Ionicons name="compass-outline" size={18} color={Colors.primary} />
            </View>
          </View>
        </View>

        {/* Rows rendered in fixed physical cabin orientation (Left | Aisle/Middle | Right) */}
        <View style={styles.cabinGrid}>
          {rows.map((row) => (
            <View key={row.rowNumber} style={styles.rowContainer}>
              <View style={styles.sideGroup}>
                {row.leftSeats.map(renderSeatButton)}
              </View>

              <View style={styles.aisleSlot}>
                {row.middleSeat ? (
                  renderSeatButton(row.middleSeat)
                ) : (
                  <Text style={styles.rowNumberLabel}>{row.rowNumber}</Text>
                )}
              </View>

              <View style={styles.sideGroup}>
                {row.rightSeats.map(renderSeatButton)}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.backBar}>
          <Text style={styles.backBarText}>{ArStrings.seats.backOfBus}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.md,
  },
  legendCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  legendSwatch: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendCheck: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textLight,
  },
  legendCross: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
  legendText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  busFrame: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    padding: Spacing.md,
  },
  cockpitBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  layoutBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.full,
  },
  layoutBadgeText: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.primary,
  },
  driverGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cockpitText: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  steeringBadge: {
    width: 34,
    height: 34,
    borderRadius: Radii.full,
    backgroundColor: Colors.bgPage,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cabinGrid: {
    gap: Spacing.sm,
  },
  rowContainer: {
    flexDirection: Platform.OS === 'web' || I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  sideGroup: {
    flex: 1,
    flexDirection: Platform.OS === 'web' || I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  aisleSlot: {
    minWidth: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowNumberLabel: {
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  seatTile: {
    minWidth: TouchTargets.minSize,
    minHeight: 46,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: Radii.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraSeatTile: {
    borderStyle: 'dashed',
  },
  seatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seatCode: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.sm,
    fontVariant: ['tabular-nums'],
  },
  statusSymbol: {
    fontSize: 12,
    fontWeight: '900',
  },
  extraTag: {
    fontFamily: FontFamilies.bold,
    fontSize: 9,
    lineHeight: 11,
  },
  backBar: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  backBarText: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
});

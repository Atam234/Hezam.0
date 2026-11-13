import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { colors } from '../theme';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Called once when the finger lifts, for saving. */
  onCommit?: (value: number) => void;
  accessibilityLabel?: string;
}

const THUMB = 26;

/** A volume-style slider built from plain views, so it needs no native dependency. */
export function Slider({ value, min, max, step, onChange, onCommit, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const latest = useRef(value);
  latest.current = value;

  const usable = Math.max(1, width - THUMB);
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min)));

  const valueAt = (e: GestureResponderEvent) => {
    // Children ignore touches, so locationX is always measured from the track itself.
    const f = Math.min(1, Math.max(0, (e.nativeEvent.locationX - THUMB / 2) / usable));
    const raw = min + f * (max - min);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };
  const move = (e: GestureResponderEvent) => {
    const next = valueAt(e);
    if (next !== latest.current) onChange(next);
    latest.current = next;
  };

  return (
    <View
      style={styles.hit}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={move}
      onResponderMove={move}
      onResponderRelease={() => onCommit?.(latest.current)}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const next = Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step)));
        onChange(next);
        onCommit?.(next);
      }}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: THUMB / 2 + fraction * usable }]} />
      </View>
      <View style={[styles.thumb, { left: fraction * usable }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    top: (44 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});

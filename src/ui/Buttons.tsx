import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';


export type IconName = ComponentProps<typeof Ionicons>['name'];

/** The app's accent: the same cyan-to-violet-to-pink light as the icon's ring. */
export const ACCENT_GRADIENT = ['#38BDF8', '#6D6BFF', '#C055F5'] as const;
const GLASS_GRADIENT = ['#2A2C36', '#16171D', '#0C0D11'] as const;
const GLOSS = ['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] as const;
const GLOW = '#7C6BFF';

type Variant = 'accent' | 'glass';

interface SurfaceProps {
  variant: Variant;
  radius: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * A raised, glossy surface: a gradient body, a bright top edge like light on glass,
 * a thin rim, and a soft coloured shadow underneath.
 */
function Surface({ variant, radius, disabled, style, children }: SurfaceProps) {
  const accent = variant === 'accent';
  return (
    <View
      style={[
        styles.shadow,
        { borderRadius: radius, shadowColor: accent ? GLOW : '#000' },
        accent ? styles.shadowAccent : styles.shadowGlass,
        disabled && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={accent ? ACCENT_GRADIENT : GLASS_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.body, { borderRadius: radius }, accent ? styles.rimAccent : styles.rimGlass]}
      >
        <LinearGradient
          colors={GLOSS}
          locations={[0, 0.55, 1]}
          style={[styles.gloss, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
          pointerEvents="none"
        />
        {children}
      </LinearGradient>
    </View>
  );
}

interface PressProps {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  hitSlop?: number;
}

/** Round button holding one icon: send, mic, menu, settings. */
export function IconButton(
  props: PressProps & { icon: IconName; variant?: Variant; size?: number; iconSize?: number },
) {
  const { icon, variant = 'glass', size = 38, iconSize = Math.round(size * 0.5) } = props;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={props.hitSlop ?? 6}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Surface variant={variant} radius={size / 2} disabled={props.disabled}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={iconSize} color="#FFFFFF" />
        </View>
      </Surface>
    </Pressable>
  );
}

/** Pill button with a label and an optional leading icon. */
export function PillButton(
  props: PressProps & { label: string; icon?: IconName; variant?: Variant; small?: boolean },
) {
  const { variant = 'accent', small } = props;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={props.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Surface variant={variant} radius={999} disabled={props.disabled}>
        <View style={[styles.pill, small && styles.pillSmall]}>
          {props.icon ? <Ionicons name={props.icon} size={small ? 15 : 17} color="#FFFFFF" /> : null}
          <Text style={[styles.pillText, small && styles.pillTextSmall]}>{props.label}</Text>
        </View>
      </Surface>
    </Pressable>
  );
}

/** A large tappable card in the accent gradient, for the main call to action. */
export function AccentCard(props: PressProps & { children: ReactNode }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && styles.pressedCard}
    >
      <Surface variant="accent" radius={20}>
        <View style={styles.card}>{props.children}</View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: { shadowOffset: { width: 0, height: 4 } },
  shadowAccent: { shadowOpacity: 0.55, shadowRadius: 10, elevation: 8 },
  shadowGlass: { shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  body: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  rimAccent: { borderColor: 'rgba(255,255,255,0.45)' },
  rimGlass: { borderColor: 'rgba(255,255,255,0.16)' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
  disabled: { opacity: 0.35 },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  pressedCard: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 11 },
  pillSmall: { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  pillText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  pillTextSmall: { fontSize: 13 },
  card: { padding: 18, gap: 4 },
});


import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ReplyLanguageSetting } from '../router/language';
import {
  CONTEXT_OPTIONS,
  DEFAULT_SETTINGS,
  effectiveMaxTokens,
  MAX_TOKEN_OPTIONS,
  type Settings,
} from '../storage/settings';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  /** False when no installed model can translate. */
  translatorAvailable: boolean;
}

const LANGUAGES: { value: ReplyLanguageSetting; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'en', label: 'English' },
];

function Segmented<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <Pressable
            key={String(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => props.onSelect(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsSheet({ visible, onClose, settings, onChange, translatorAvailable }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const capped = effectiveMaxTokens(settings) < settings.maxTokens;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.section}>Language</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Reply language</Text>
            <Text style={styles.help}>
              Auto answers in the language you write in: ask in Tagalog and the reply is Tagalog, whichever
              model answers.
            </Text>
            <Segmented options={LANGUAGES} value={settings.replyLanguage} onSelect={(v) => set({ replyLanguage: v })} />

            <View style={styles.divider} />
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.label}>Translator</Text>
                <Text style={styles.help}>
                  If a model still answers in the wrong language, translate its answer before showing it.
                </Text>
              </View>
              <Switch
                value={settings.autoTranslate}
                onValueChange={(v) => set({ autoTranslate: v })}
                trackColor={{ true: '#34D399', false: colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>
            {settings.autoTranslate && !translatorAvailable && (
              <Text style={styles.warn}>
                No translator model installed yet. Download Gemma 2 2B, Llama 3.2 3B, or Qwen2.5 1.5B in Models.
              </Text>
            )}
          </View>

          <Text style={styles.section}>Tokens</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Max reply tokens</Text>
            <Text style={styles.help}>
              How long an answer can be. Higher allows longer answers but takes more time. About 4 tokens is
              3 words.
            </Text>
            <Segmented
              options={MAX_TOKEN_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
              value={settings.maxTokens}
              onSelect={(v) => set({ maxTokens: v })}
            />
            {capped && (
              <Text style={styles.warn}>
                Limited to {effectiveMaxTokens(settings)} by the context size below. Raise the context to use
                more.
              </Text>
            )}

            <View style={styles.divider} />
            <Text style={styles.label}>Context size (tokens)</Text>
            <Text style={styles.help}>
              How much of the conversation the model remembers. Larger needs more RAM and reloads the model.
            </Text>
            <Segmented
              options={CONTEXT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
              value={settings.contextTokens}
              onSelect={(v) => set({ contextTokens: v })}
            />
          </View>

          <Pressable style={styles.reset} onPress={() => onChange(DEFAULT_SETTINGS)} accessibilityRole="button">
            <Text style={styles.resetText}>Reset to defaults</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  close: { color: colors.text, fontSize: 16, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  section: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginTop: 10, paddingHorizontal: 4 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  help: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  warn: { color: '#FBBF24', fontSize: 13, lineHeight: 19 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 6 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textDim, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  segmentTextActive: { color: colors.onAccent },
  reset: { alignItems: 'center', paddingVertical: 14 },
  resetText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
});

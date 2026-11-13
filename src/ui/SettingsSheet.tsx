import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import appConfig from '../../app.json';
import type { Lang, ReplyLanguageSetting } from '../router/language';
import {
  CONTEXT_OPTIONS,
  DEFAULT_SETTINGS,
  effectiveMaxTokens,
  MAX_TOKENS_MAX,
  MAX_TOKENS_MIN,
  MAX_TOKENS_STEP,
  type Settings,
} from '../storage/settings';
import { colors } from '../theme';
import { Slider } from './Slider';

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  /** False when no installed model can translate. */
  translatorAvailable: boolean;
  /** State of the Google ML Kit Tagalog/English language packs. */
  googlePack: 'unavailable' | 'missing' | 'ready';
  packBusy: boolean;
  onDownloadPack: () => void;
}

const LANGUAGES: { value: ReplyLanguageSetting; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'en', label: 'English' },
];

const VOICE_LANGUAGES: { value: Lang; label: string }[] = [
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

export function SettingsSheet(props: Props) {
  const { visible, onClose, settings, onChange, translatorAvailable, googlePack, packBusy } = props;
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
                  Google Translate (on-device) sits between you and the AI models: your Tagalog question is
                  translated to English for the model, and its answer is translated back to Tagalog.
                </Text>
              </View>
              <Switch
                value={settings.autoTranslate}
                onValueChange={(v) => set({ autoTranslate: v })}
                trackColor={{ true: '#34D399', false: colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>
            {settings.autoTranslate && googlePack === 'ready' && (
              <Text style={styles.ok}>✓ Tagalog language pack installed. Translation works offline.</Text>
            )}
            {settings.autoTranslate && googlePack === 'missing' && (
              <View style={styles.packRow}>
                <Text style={[styles.warn, styles.packText]}>
                  Tagalog language pack not downloaded yet (about 30 MB, needs internet once).
                </Text>
                <Pressable
                  style={[styles.packButton, packBusy && styles.packButtonBusy]}
                  disabled={packBusy}
                  onPress={props.onDownloadPack}
                  accessibilityRole="button"
                >
                  <Text style={styles.packButtonText}>{packBusy ? 'Downloading…' : 'Download'}</Text>
                </Pressable>
              </View>
            )}
            {settings.autoTranslate && googlePack === 'unavailable' && !translatorAvailable && (
              <Text style={styles.warn}>
                Google translation is not available on this device and no translator model is installed.
                Download Gemma 2 2B, Llama 3.2 3B, or Qwen2.5 1.5B in Models.
              </Text>
            )}
          </View>

          <Text style={styles.section}>Voice</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Voice language</Text>
            <Text style={styles.help}>
              The language the microphone listens for in Voice mode. Answers are read aloud in the language
              of the reply.
            </Text>
            <Segmented
              options={VOICE_LANGUAGES}
              value={settings.voiceLanguage}
              onSelect={(v) => set({ voiceLanguage: v })}
            />
          </View>

          <Text style={styles.section}>Tokens</Text>
          <View style={styles.card}>
            <View style={styles.sliderHead}>
              <Text style={styles.label}>Max output tokens</Text>
              <Text style={styles.sliderValue}>{settings.maxTokens}</Text>
            </View>
            <Text style={styles.help}>
              Slide to set how long an answer can be. Higher allows longer answers but takes more time.
              About 4 tokens is 3 words.
            </Text>
            <Slider
              value={settings.maxTokens}
              min={MAX_TOKENS_MIN}
              max={MAX_TOKENS_MAX}
              step={MAX_TOKENS_STEP}
              onChange={(v) => set({ maxTokens: v })}
              accessibilityLabel="Max output tokens"
            />
            <View style={styles.sliderEnds}>
              <Text style={styles.sliderEnd}>{MAX_TOKENS_MIN}</Text>
              <Text style={styles.sliderEnd}>{MAX_TOKENS_MAX}</Text>
            </View>
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
          <Text style={styles.version}>Hezam.0 v{appConfig.expo.version}</Text>
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
  ok: { color: '#34D399', fontSize: 13, lineHeight: 19 },
  packRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  packText: { flex: 1 },
  packButton: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  packButtonBusy: { opacity: 0.5 },
  packButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderValue: { color: colors.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sliderEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  sliderEnd: { color: colors.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
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
  version: { color: colors.textFaint, fontSize: 12, textAlign: 'center' },
  resetText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
});

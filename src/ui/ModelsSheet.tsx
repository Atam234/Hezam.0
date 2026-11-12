import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatSize, MODELS, SPECIALISTS, type ModelInfo } from '../models/catalog';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  installed: ReadonlySet<string>;
  /** modelId -> download progress 0..1 */
  progress: Record<string, number>;
  loadedId: string | null;
  freeBytes: number;
  busy: boolean;
  onDownload: (m: ModelInfo) => void;
  onCancel: (m: ModelInfo) => void;
  onDelete: (m: ModelInfo) => void;
}

export function ModelsSheet(props: Props) {
  const { visible, onClose, installed, progress, loadedId, freeBytes, busy } = props;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Mga AI Model</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Tapos</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.intro}>
            I-download ang mga specialist na gusto mo. Kapag na-download na, offline na silang tatakbo sa
            phone mo at si Hezam.0 na ang pipili kung sino ang sasagot sa bawat tanong.
            {freeBytes > 0 ? `\n\nBakanteng storage: ${formatSize(freeBytes)}` : ''}
          </Text>

          {MODELS.map((m) => {
            const spec = SPECIALISTS[m.roles[0]];
            const isInstalled = installed.has(m.id);
            const p = progress[m.id];
            const downloading = p !== undefined;
            const tooBig = freeBytes > 0 && m.sizeBytes > freeBytes;
            return (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.badge, { borderColor: spec.color }]}>
                    <Text style={[styles.badgeText, { color: spec.color }]}>
                      {spec.glyph} {spec.name}
                    </Text>
                  </View>
                  {loadedId === m.id && <Text style={styles.loaded}>● nasa memory</Text>}
                </View>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.meta}>
                  {m.author} · {formatSize(m.sizeBytes)} · {m.minRamGb} GB+ RAM · {m.license}
                </Text>
                <Text style={styles.note}>{m.note}</Text>
                <Text style={styles.repo} numberOfLines={1}>
                  huggingface.co/{m.repo}
                </Text>

                {downloading ? (
                  <View style={styles.progressRow}>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.round(p * 100)}%` }]} />
                    </View>
                    <Text style={styles.percent}>{Math.round(p * 100)}%</Text>
                    <Pressable onPress={() => props.onCancel(m)} hitSlop={10} accessibilityRole="button">
                      <Text style={styles.danger}>Itigil</Text>
                    </Pressable>
                  </View>
                ) : isInstalled ? (
                  <View style={styles.actions}>
                    <Text style={styles.installed}>✓ Naka-install</Text>
                    <Pressable
                      onPress={() => props.onDelete(m)}
                      disabled={busy}
                      hitSlop={10}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.danger, busy && styles.disabled]}>Burahin</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.button, tooBig && styles.buttonDisabled]}
                      disabled={tooBig}
                      onPress={() => props.onDownload(m)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.buttonText}>I-download</Text>
                    </Pressable>
                    {tooBig && <Text style={styles.warn}>Kulang ang storage</Text>}
                  </View>
                )}
              </View>
            );
          })}
          <Text style={styles.footnote}>
            Ang mga model ay open-weight na GGUF mula sa Hugging Face at pinapatakbo ng llama.cpp (llama.rn).
            Internet ang kailangan sa pag-download lang; ang chat ay hindi umaalis sa phone mo. Panatilihing
            bukas ang app habang nagda-download.
          </Text>
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
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  intro: { color: colors.textDim, fontSize: 14, lineHeight: 21, paddingHorizontal: 4, marginBottom: 4 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  loaded: { color: '#34D399', fontSize: 12 },
  name: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 4 },
  meta: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  note: { color: colors.text, fontSize: 14, lineHeight: 20 },
  repo: { color: colors.textFaint, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  button: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
  installed: { color: '#34D399', fontSize: 14, fontWeight: '600' },
  danger: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.35 },
  warn: { color: colors.danger, fontSize: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
  percent: { color: colors.textDim, fontSize: 13, minWidth: 38, textAlign: 'right', fontVariant: ['tabular-nums'] },
  footnote: { color: colors.textFaint, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 8 },
});

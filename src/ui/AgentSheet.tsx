import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEFAULT_AGENT_CONFIG,
  loadAgentConfig,
  loadApiKey,
  PRESETS,
  saveAgentConfig,
  saveApiKey,
  type AgentConfig,
} from '../agent/config';
import { runAgent, type AgentStep } from '../agent/core';
import * as files from '../agent/files';
import { callApi, callLocal } from '../agent/llm';
import { buildTools, openAccessibilitySettings, phoneControlEnabled, phoneSupported } from '../agent/tools';
import { colors, mono } from '../theme';
import { PillButton } from './Buttons';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** True while the chat is generating; the local model cannot do both at once. */
  chatBusy: boolean;
  /** Loads a local model for the agent and resolves with its name. */
  prepareLocal: () => Promise<string>;
}

const KEEP_AWAKE = 'hezam-agent';

export function AgentSheet({ visible, onClose, chatBusy, prepareLocal }: Props) {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [apiKey, setApiKey] = useState('');
  const [folder, setFolder] = useState<{ uri: string; name: string } | null>(null);
  const [control, setControl] = useState(false);

  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [final, setFinal] = useState('');
  const [error, setError] = useState('');
  const cancel = useRef(false);

  const refreshAccess = useCallback(async () => {
    setFolder(await files.grantedFolder().catch(() => null));
    setControl(await phoneControlEnabled());
  }, []);

  useEffect(() => {
    loadAgentConfig().then(setConfig);
    loadApiKey().then(setApiKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    refreshAccess();
    // The user leaves the app to turn on phone control; check again when they come back.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshAccess();
    });
    return () => sub.remove();
  }, [refreshAccess, visible]);

  const update = (patch: Partial<AgentConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveAgentConfig(next).catch(() => {});
  };

  const run = async () => {
    const goal = task.trim();
    if (!goal || running) return;
    setError('');
    setFinal('');
    setSteps([]);
    cancel.current = false;
    setRunning(true);
    activateKeepAwakeAsync(KEEP_AWAKE).catch(() => {});
    try {
      const local = config.brain === 'local';
      if (local) {
        if (chatBusy) throw new Error('Wait for the chat answer to finish first.');
        setStatus('Loading the local model…');
        setStatus(`Working with ${await prepareLocal()}…`);
      } else {
        if (!apiKey.trim()) throw new Error('Enter your API key first.');
        setStatus(`Working with ${config.model}…`);
      }
      const phoneControl = await phoneControlEnabled();
      const tools = buildTools({
        files: (await files.grantedFolder()) !== null,
        fileChanges: config.allowFileChanges,
        phoneControl,
      });
      if (tools.length === 0) throw new Error('Give the agent access first: share a folder or turn on phone control.');

      const result = await runAgent({
        task: goal,
        tools,
        llm: local ? callLocal : (messages) => callApi(config, apiKey.trim(), messages),
        onStep: (step) => setSteps((prev) => [...prev, step]),
        cancelled: () => cancel.current,
        // A small local model has a short context: keep its prompt tight.
        maxSteps: local ? 8 : 15,
        maxResultChars: local ? 1500 : 3000,
        keepExchanges: local ? 2 : 6,
      });
      setFinal(result.final);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      deactivateKeepAwake(KEEP_AWAKE).catch(() => {});
      setStatus('');
      setRunning(false);
    }
  };

  const local = config.brain === 'local';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Agent</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>
              Give the agent a task and it works through it step by step: reading and writing files in a folder
              you share, opening apps, and tapping and typing on screen.
            </Text>

            <Text style={styles.section}>Brain</Text>
            <View style={styles.card}>
              <View style={styles.segmented}>
                {(['api', 'local'] as const).map((b) => (
                  <Pressable
                    key={b}
                    style={[styles.segment, config.brain === b && styles.segmentActive]}
                    onPress={() => update({ brain: b })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: config.brain === b }}
                  >
                    <Text style={[styles.segmentText, config.brain === b && styles.segmentTextActive]}>
                      {b === 'api' ? 'AI API' : 'Local model'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {local ? (
                <Text style={styles.help}>
                  Runs on your installed model, fully offline. Small models often pick the wrong step, so this
                  suits simple file tasks; use an API for controlling apps.
                </Text>
              ) : (
                <>
                  <View style={styles.presets}>
                    {PRESETS.map((p) => {
                      const active = config.baseUrl === p.baseUrl;
                      return (
                        <Pressable
                          key={p.name}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => update({ baseUrl: p.baseUrl, model: p.model })}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.label}>API address</Text>
                  <TextInput
                    style={styles.input}
                    value={config.baseUrl}
                    onChangeText={(v) => update({ baseUrl: v })}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://…/v1"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="API address"
                  />
                  <Text style={styles.label}>Model</Text>
                  <TextInput
                    style={styles.input}
                    value={config.model}
                    onChangeText={(v) => update({ model: v })}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="Model"
                  />
                  <Text style={styles.label}>API key</Text>
                  <TextInput
                    style={styles.input}
                    value={apiKey}
                    onChangeText={(v) => {
                      setApiKey(v);
                      saveApiKey(v.trim()).catch(() => {});
                    }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Paste your key"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="API key"
                  />
                  <Text style={styles.help}>
                    Your key is stored in the phone's secure keystore. With an API, your task, the files the
                    agent reads and the on-screen text it sees are sent to that provider.
                  </Text>
                </>
              )}
            </View>

            <Text style={styles.section}>Access</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.label}>Files</Text>
                  <Text style={folder ? styles.ok : styles.help}>
                    {folder ? `✓ ${folder.name}` : 'No folder shared. The agent sees only the folder you pick.'}
                  </Text>
                </View>
                <PillButton
                  small
                  variant={folder ? 'glass' : 'accent'}
                  icon="folder-open"
                  label={folder ? 'Change' : 'Choose'}
                  onPress={async () => {
                    const picked = await files.chooseFolder().catch(() => null);
                    if (picked) setFolder(picked);
                  }}
                />
              </View>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.label}>Let it change files</Text>
                  <Text style={styles.help}>
                    Create and edit files in that folder. Overwriting or deleting always asks you first.
                  </Text>
                </View>
                <Switch
                  value={config.allowFileChanges}
                  onValueChange={(v) => update({ allowFileChanges: v })}
                  trackColor={{ true: '#34D399', false: colors.border }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.label}>Phone control</Text>
                  <Text style={control ? styles.ok : styles.help}>
                    {!phoneSupported
                      ? 'Only available in the Android app.'
                      : control
                        ? '✓ On. The agent can read the screen, tap, type and scroll.'
                        : 'Off. Turn on "Hezam.0 phone control" in Accessibility settings.'}
                  </Text>
                </View>
                {phoneSupported && (
                  <PillButton
                    small
                    variant={control ? 'glass' : 'accent'}
                    icon="settings-sharp"
                    label={control ? 'Settings' : 'Turn on'}
                    onPress={() => openAccessibilitySettings().catch(() => {})}
                  />
                )}
              </View>
              {phoneSupported && !control && (
                <Text style={styles.help}>
                  If Android says the setting is restricted: open the phone's Settings → Apps → Hezam.0 → ⋮ →
                  "Allow restricted settings", then try again.
                </Text>
              )}
            </View>

            <Text style={styles.section}>Task</Text>
            <View style={styles.card}>
              <TextInput
                style={[styles.input, styles.task]}
                value={task}
                onChangeText={setTask}
                multiline
                editable={!running}
                placeholder='e.g. "Summarize notes.txt and save it as summary.txt"'
                placeholderTextColor={colors.textFaint}
                accessibilityLabel="Task"
              />
              <View style={styles.actions}>
                {running ? (
                  <PillButton
                    variant="glass"
                    icon="stop"
                    label="Stop"
                    onPress={() => {
                      cancel.current = true;
                      setStatus('Stopping after this step…');
                    }}
                  />
                ) : (
                  <PillButton icon="flash" label="Run task" disabled={!task.trim()} onPress={run} />
                )}
                {status ? <Text style={styles.status}>{status}</Text> : null}
              </View>
              <Text style={styles.help}>
                The agent never pays, messages, calls or deletes unless your task says so. Watch what it does and
                press Stop if it goes wrong.
              </Text>
            </View>

            {steps.map((s, i) => (
              <View key={i} style={styles.step}>
                <Text style={styles.stepHead}>
                  <Text style={s.failed ? styles.stepFailed : styles.stepOk}>{s.failed ? '✕' : '✓'}</Text> Step {i + 1}:{' '}
                  {s.tool}
                </Text>
                {s.thought ? <Text style={styles.stepThought}>{s.thought}</Text> : null}
                <Text style={styles.stepArgs} numberOfLines={3}>
                  {JSON.stringify(s.args)}
                </Text>
                <Text style={styles.stepResult} numberOfLines={6}>
                  {s.result}
                </Text>
              </View>
            ))}
            {final ? (
              <View style={[styles.card, styles.finalCard]}>
                <Text style={styles.label}>Result</Text>
                <Text style={styles.final} selectable>
                  {final}
                </Text>
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  close: { color: colors.text, fontSize: 16, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  intro: { color: colors.textDim, fontSize: 14, lineHeight: 21, paddingHorizontal: 4 },
  section: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginTop: 10, paddingHorizontal: 4 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  help: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  ok: { color: '#34D399', fontSize: 13, lineHeight: 19 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceHigh, borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segmentActive: { backgroundColor: '#6D6BFF' },
  segmentText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: '#FFFFFF' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { borderColor: '#6D6BFF', backgroundColor: colors.surfaceHigh },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.text },
  input: {
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  task: { minHeight: 84, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { color: colors.textDim, fontSize: 13, flex: 1 },
  step: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  stepHead: { color: colors.text, fontSize: 14, fontWeight: '600' },
  stepOk: { color: '#34D399' },
  stepFailed: { color: colors.danger },
  stepThought: { color: colors.textDim, fontSize: 13, fontStyle: 'italic' },
  stepArgs: { color: colors.textDim, fontSize: 12, fontFamily: mono },
  stepResult: { color: colors.textFaint, fontSize: 12, fontFamily: mono },
  finalCard: { borderColor: '#6D6BFF' },
  final: { color: colors.text, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
});

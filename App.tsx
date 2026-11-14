import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import * as engine from './src/engine/engine';
import { splitThinking, type ChatTurn } from './src/engine/types';
import {
  getModel,
  MODELS,
  setCustomModels,
  pickTranslator,
  SPECIALIST_ORDER,
  SPECIALISTS,
  type ModelInfo,
} from './src/models/catalog';
import {
  detectLanguage,
  LANGUAGE_NAME,
  languageInstruction,
  languageReminder,
  needsTranslation,
  targetLanguage,
  translationPrompt,
  type Lang,
} from './src/router/language';
import { classify, pickModel, type SpecialistId } from './src/router/router';
import {
  loadConversations,
  newId,
  saveConversations,
  titleFrom,
  type Conversation,
  type Message,
} from './src/storage/chats';
import { loadCustomModels, saveCustomModels, toModelInfo, type CustomModel } from './src/storage/customModels';
import * as downloads from './src/storage/downloads';
import {
  DEFAULT_SETTINGS,
  effectiveMaxTokens,
  historyCharBudget,
  loadSettings,
  saveSettings,
  type Settings,
} from './src/storage/settings';
import { colors } from './src/theme';
import * as google from './src/translate/google';
import { AgentSheet } from './src/ui/AgentSheet';
import { AccentCard, IconButton, PillButton } from './src/ui/Buttons';
import { HistorySheet } from './src/ui/HistorySheet';
import { MessageView } from './src/ui/MessageView';
import { ModelsSheet } from './src/ui/ModelsSheet';
import { SettingsSheet } from './src/ui/SettingsSheet';
import { VoiceSheet, type VoiceAnswer } from './src/ui/VoiceSheet';

type Mode = 'auto' | SpecialistId;

interface SendOptions {
  /** Voice mode: keep answers short and plain, and report the answer as it streams. */
  voice?: boolean;
  onPartial?: (answer: string, lang: Lang) => void;
}

const VOICE_MAX_TOKENS = 384;
const VOICE_HINT =
  ' This is a spoken conversation: answer briefly in plain sentences, without Markdown, lists, or code unless asked.';

const KEEP_AWAKE_TAG = 'hezam-download';

const SUGGESTIONS: { specialist: SpecialistId; text: string }[] = [
  { specialist: 'code', text: 'Write a Python script that renames many files at once' },
  { specialist: 'writing', text: 'Write a thank-you letter to my teacher' },
  { specialist: 'creative', text: 'Brainstorm logo ideas for a coffee shop' },
  { specialist: 'reasoning', text: 'What is 15 percent of 2,500? Show the steps' },
];

function buildTurns(systemPrompt: string, history: Message[], charBudget: number, reminder: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.error) continue;
    // Prefer the English side of translated messages so the model sees one consistent language.
    const content =
      m.role === 'assistant' ? (m.original ?? splitThinking(m.content).answer) : (m.modelText ?? m.content);
    if (!content) continue;
    // Always keep the newest message; drop older ones once the budget is spent.
    if (turns.length > 0 && used + content.length > charBudget) break;
    used += content.length;
    turns.unshift({ role: m.role, content });
  }
  const last = turns[turns.length - 1];
  if (last?.role === 'user') last.content = `${last.content}\n\n${reminder}`;
  return [{ role: 'system', content: systemPrompt }, ...turns];
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Chat />
    </SafeAreaProvider>
  );
}

function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatId, setChatId] = useState(newId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('auto');

  const [installed, setInstalled] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [freeBytes, setFreeBytes] = useState(0);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [showModels, setShowModels] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [googlePack, setGooglePack] = useState<google.PackState>('unavailable');
  const [packBusy, setPackBusy] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [custom, setCustom] = useState<CustomModel[]>([]);
  const [importing, setImporting] = useState(false);

  const models = useMemo(() => {
    const imported = custom.map(toModelInfo);
    setCustomModels(imported); // keep lookups by id in step with what is rendered
    return [...imported, ...MODELS];
  }, [custom]);

  const listRef = useRef<FlatList<Message>>(null);
  const followRef = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const refreshStorage = useCallback(async () => {
    setInstalled(new Set(await downloads.listInstalled()));
    setFreeBytes(await downloads.freeSpaceBytes().catch(() => 0));
  }, []);

  useEffect(() => {
    loadConversations().then(setConversations);
    loadSettings().then(setSettings);
    google.packState().then(setGooglePack);
    // Imported models must be registered before the installed-files scan can find them.
    loadCustomModels().then((list) => {
      setCustomModels(list.map(toModelInfo));
      setCustom(list);
      refreshStorage();
    });
    return () => {
      engine.unload().catch(() => {});
    };
  }, [refreshStorage]);

  const persist = useCallback((id: string, msgs: Message[]) => {
    const firstUser = msgs.find((m) => m.role === 'user');
    const others = conversationsRef.current.filter((c) => c.id !== id);
    const next: Conversation[] = [
      { id, title: titleFrom(firstUser?.content ?? ''), updatedAt: Date.now(), messages: msgs },
      ...others,
    ];
    setConversations(next);
    saveConversations(next).catch(() => {});
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (raw: string, opts: SendOptions = {}): Promise<Message | null> => {
      const text = raw.trim();
      if (!text || generating) return null;
      if (installed.size === 0) {
        if (!opts.voice) setShowModels(true);
        return null;
      }

      const history = messagesRef.current;
      const previous = [...history].reverse().find((m) => m.role === 'assistant')?.specialist;
      const manual = mode !== 'auto';
      const decision = manual ? null : classify(text, previous);
      const specialistId: SpecialistId = manual ? mode : decision!.specialist;
      const pick = pickModel(specialistId, models, installed);
      if (!pick) {
        if (!opts.voice) setShowModels(true);
        return null;
      }
      const specialist = SPECIALISTS[specialistId];

      // Reply in the user's language: detect it from this message, or from earlier in the chat.
      const earlier = [...history]
        .reverse()
        .map((m) => (m.role === 'user' ? detectLanguage(m.content) : 'unknown'))
        .find((l): l is Lang => l !== 'unknown');
      const target = targetLanguage(text, settings.replyLanguage, earlier);
      const maxTokens = opts.voice
        ? Math.min(effectiveMaxTokens(settings), VOICE_MAX_TOKENS)
        : effectiveMaxTokens(settings);
      const ctx = settings.contextTokens;

      const load = async (m: ModelInfo) => {
        if (engine.isLoaded(m.id, ctx)) return;
        setStatus(`Loading ${m.name}…`);
        await engine.ensureLoaded(m.id, downloads.modelPath(m), ctx, (p) =>
          setStatus(`Loading ${m.name}… ${Math.round(p * 100)}%`),
        );
        setLoadedId(m.id);
      };

      const userMessage: Message = { id: newId(), role: 'user', content: text };
      const reply: Message = {
        id: newId(),
        role: 'assistant',
        content: '',
        specialist: specialistId,
        modelId: pick.model.id,
        matched: decision?.matched,
        fallback: pick.fallback,
        manual,
      };
      const base = [...history, userMessage];
      setMessages([...base, reply]);
      setInput('');
      setGenerating(true);
      followRef.current = true;

      let final: Message = reply;
      let sent = base;
      // Translator bridge: Google ML Kit sits between the user and the model. A Tagalog question is
      // turned into English for the model, and the English answer is turned back into Tagalog.
      let bridge = false;
      try {
        if (settings.autoTranslate && google.available && target === 'tl') {
          try {
            if ((await google.packState()) !== 'ready') {
              setStatus('Downloading Tagalog language pack (one time)…');
              await google.ensurePacks();
              setGooglePack('ready');
            }
            setStatus('Translating your question…');
            const english = detectLanguage(text) === 'en' ? text : await google.translate(text, 'tl', 'en');
            sent = [...history, { ...userMessage, modelText: english }];
            bridge = true;
          } catch {
            // No language pack and no internet, or ML Kit failed: fall back to asking the model directly.
            bridge = false;
          }
        }
        const modelLanguage: Lang = bridge ? 'en' : target;

        await load(pick.model);
        setStatus('Answering…');

        let lastPaint = 0;
        const paint = (full: string) => {
          // Repainting on every token is wasteful; ~12 updates a second reads as smooth.
          const now = Date.now();
          if (now - lastPaint < 80) return;
          lastPaint = now;
          patchMessage(reply.id, { content: full });
        };
        const result = await engine.generate(
          buildTurns(
            `${specialist.systemPrompt} ${languageInstruction(modelLanguage)}${opts.voice ? VOICE_HINT : ''}`,
            sent,
            historyCharBudget(settings),
            languageReminder(modelLanguage),
          ),
          { temperature: specialist.temperature, maxTokens },
          (full) => {
            paint(full);
            // With the translator bridge the answer is still English here, so it is not spoken yet.
            if (!bridge) opts.onPartial?.(splitThinking(full).answer, target);
          },
        );
        final = { ...reply, content: result.text.trim(), tokensPerSecond: result.tokensPerSecond, lang: target };
        if (!splitThinking(final.content).answer) {
          final = { ...final, error: true, content: 'The model returned no answer. Please try again.' };
        } else if (bridge) {
          const answer = splitThinking(final.content).answer;
          try {
            setStatus('Translating to Tagalog…');
            const translated = await google.translate(answer, 'en', 'tl');
            final = { ...final, content: translated, original: answer, translatedTo: 'tl', translatorId: 'google' };
          } catch {
            // Keep the English answer rather than lose it.
          }
        } else if (settings.autoTranslate) {
          // Translator: some specialists drift into the wrong language. Fix the answer before showing it.
          const answer = splitThinking(final.content).answer;
          const translator = needsTranslation(answer, target) ? pickTranslator(pick.model.id, installed) : null;
          if (translator) {
            try {
              await load(translator);
              setStatus(`Translating to ${LANGUAGE_NAME[target]}…`);
              const translated = await engine.generate(
                [
                  { role: 'system', content: translationPrompt(target) },
                  { role: 'user', content: answer },
                ],
                { temperature: 0.2, maxTokens: Math.max(maxTokens, 512) },
                paint,
              );
              const out = splitThinking(translated.text.trim()).answer;
              if (out) {
                final = { ...final, content: out, original: answer, translatedTo: target, translatorId: translator.id };
              }
            } catch {
              // Translation is best-effort: keep the untranslated answer rather than lose it.
              setLoadedId(engine.loadedModelId());
            }
          }
        }
      } catch (e) {
        setLoadedId(engine.loadedModelId());
        final = {
          ...reply,
          error: true,
          content: `${pick.model.name} could not answer: ${errorText(e)}\n\nIf the phone is low on RAM, try a smaller model.`,
        };
      } finally {
        const done = [...sent, final];
        setMessages(done);
        setStatus('');
        setGenerating(false);
        persist(chatId, done);
      }
      return final;
    },
    [chatId, generating, installed, mode, models, patchMessage, persist, settings],
  );

  const changeSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next).catch(() => {});
  }, []);

  const downloadPack = useCallback(async () => {
    setPackBusy(true);
    try {
      await google.ensurePacks();
    } catch (e) {
      Alert.alert('Download failed', `Tagalog language pack: ${errorText(e)}`);
    } finally {
      setGooglePack(await google.packState());
      setPackBusy(false);
    }
  }, []);

  const translatorAvailable = useMemo(() => pickTranslator('', installed) !== null, [installed]);

  const newChat = useCallback(() => {
    if (generating) return;
    setChatId(newId());
    setMessages([]);
  }, [generating]);

  const openChat = useCallback(
    (id: string) => {
      if (generating) return;
      const c = conversationsRef.current.find((x) => x.id === id);
      if (!c) return;
      setChatId(c.id);
      setMessages(c.messages);
      setShowHistory(false);
    },
    [generating],
  );

  const deleteChat = useCallback(
    (id: string) => {
      const next = conversationsRef.current.filter((c) => c.id !== id);
      setConversations(next);
      saveConversations(next).catch(() => {});
      if (id === chatId && !generating) {
        setChatId(newId());
        setMessages([]);
      }
    },
    [chatId, generating],
  );

  const download = useCallback(
    async (m: ModelInfo) => {
      setProgress((p) => ({ ...p, [m.id]: 0 }));
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      try {
        await downloads.downloadModel(m, (f) => setProgress((p) => (m.id in p ? { ...p, [m.id]: f } : p)));
      } catch (e) {
        Alert.alert('Download failed', `${m.name}: ${errorText(e)}`);
      } finally {
        setProgress((p) => {
          const { [m.id]: _done, ...rest } = p;
          if (Object.keys(rest).length === 0) deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
          return rest;
        });
        refreshStorage();
      }
    },
    [refreshStorage],
  );

  const removeModel = useCallback(
    async (m: ModelInfo) => {
      if (engine.loadedModelId() === m.id) {
        await engine.unload();
        setLoadedId(null);
      }
      await downloads.deleteModel(m);
      if (m.custom) {
        setCustom((prev) => {
          const next = prev.filter((c) => c.id !== m.id);
          saveCustomModels(next).catch(() => {});
          return next;
        });
      }
      refreshStorage();
    },
    [refreshStorage],
  );

  const importModel = useCallback(async () => {
    setImporting(true);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    try {
      const id = `custom-${newId()}`;
      const file = await downloads.importModel(id);
      if (file) {
        const next = [{ id, role: 'general' as SpecialistId, ...file }, ...custom];
        setCustomModels(next.map(toModelInfo));
        setCustom(next);
        await saveCustomModels(next);
      }
    } catch (e) {
      Alert.alert('Import failed', errorText(e));
    } finally {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      setImporting(false);
      refreshStorage();
    }
  }, [custom, refreshStorage]);

  const setModelRole = useCallback((m: ModelInfo, role: SpecialistId) => {
    setCustom((prev) => {
      const next = prev.map((c) => (c.id === m.id ? { ...c, role } : c));
      saveCustomModels(next).catch(() => {});
      return next;
    });
  }, []);

  /** Loads the best installed model for agent work and resolves with its name. */
  const prepareLocalAgent = useCallback(async () => {
    const pick = pickModel('reasoning', models, installed);
    if (!pick) throw new Error('No local model is installed. Download one in Models, or use an AI API.');
    await engine.ensureLoaded(pick.model.id, downloads.modelPath(pick.model), settings.contextTokens);
    setLoadedId(pick.model.id);
    return pick.model.name;
  }, [installed, models, settings.contextTokens]);

  const askByVoice = useCallback(
    async (text: string, onPartial: (answer: string, lang: Lang) => void): Promise<VoiceAnswer | null> => {
      const m = await send(text, { voice: true, onPartial });
      if (!m) return null;
      if (m.error) return { text: '', lang: m.lang ?? 'en', error: m.content };
      return { text: splitThinking(m.content).answer, lang: m.lang ?? 'en' };
    },
    [send],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    followRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
  }, []);

  const lastId = messages[messages.length - 1]?.id;
  const loadedModel = loadedId ? getModel(loadedId) : undefined;
  const subtitle = useMemo(() => {
    if (engine.isDemo) return 'web preview · demo only';
    if (loadedModel) return `${loadedModel.name} · offline`;
    return installed.size ? 'offline · local AI' : 'no model yet';
  }, [installed.size, loadedModel]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <IconButton icon="menu" onPress={() => setShowHistory(true)} accessibilityLabel="Chat history" />
        <View style={styles.headerCenter}>
          <Text style={styles.brand}>
            Hezam<Text style={styles.brandDim}>.0</Text>
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <PillButton
          variant="glass"
          small
          icon="cube-outline"
          label={`${installed.size}/${models.length}`}
          onPress={() => setShowModels(true)}
          accessibilityLabel="Manage AI models"
        />
        <IconButton icon="settings-sharp" onPress={() => setShowSettings(true)} accessibilityLabel="Settings" />
        <IconButton icon="add" iconSize={24} onPress={newChat} accessibilityLabel="New chat" />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.empty} keyboardShouldPersistTaps="handled">
            <Text style={styles.heroLogo}>
              Hezam<Text style={styles.brandDim}>.0</Text>
            </Text>
            <Text style={styles.heroTag}>
              One assistant, many experts.{'\n'}Automatically picks the right local AI model for every question.
            </Text>
            {installed.size === 0 ? (
              <AccentCard onPress={() => setShowModels(true)}>
                <Text style={styles.ctaTitle}>Download your first model</Text>
                <Text style={styles.ctaText}>You need at least one model to chat offline.</Text>
              </AccentCard>
            ) : (
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s) => {
                  const spec = SPECIALISTS[s.specialist];
                  return (
                    <Pressable
                      key={s.text}
                      style={styles.suggestion}
                      onPress={() => send(s.text)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.suggestionKind, { color: spec.color }]}>
                        {spec.glyph} {spec.name}
                      </Text>
                      <Text style={styles.suggestionText}>{s.text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageView message={item} status={generating && item.id === lastId ? status : undefined} />
            )}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={64}
            onContentSizeChange={() => {
              if (followRef.current) listRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        <View style={styles.dock}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modes}
            keyboardShouldPersistTaps="handled"
          >
            <PillButton small icon="flash" label="Agent" onPress={() => setShowAgent(true)} />
            <ModeChip label="◈ Auto" active={mode === 'auto'} color={colors.accent} onPress={() => setMode('auto')} />
            {SPECIALIST_ORDER.map((id) => (
              <ModeChip
                key={id}
                label={`${SPECIALISTS[id].glyph} ${SPECIALISTS[id].short}`}
                active={mode === id}
                color={SPECIALISTS[id].color}
                onPress={() => setMode(id)}
              />
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything…"
              placeholderTextColor={colors.textFaint}
              multiline
              accessibilityLabel="Message"
            />
            {!generating && (
              <IconButton icon="mic" onPress={() => setShowVoice(true)} accessibilityLabel="Voice mode" />
            )}
            {generating ? (
              <IconButton
                icon="stop"
                variant="accent"
                iconSize={16}
                onPress={() => engine.stop().catch(() => {})}
                accessibilityLabel="Stop"
              />
            ) : (
              <IconButton
                icon="arrow-up"
                variant="accent"
                iconSize={21}
                disabled={!input.trim()}
                onPress={() => send(input)}
                accessibilityLabel="Send"
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <ModelsSheet
        visible={showModels}
        onClose={() => setShowModels(false)}
        installed={installed}
        progress={progress}
        loadedId={loadedId}
        freeBytes={freeBytes}
        busy={generating}
        onDownload={download}
        onCancel={(m) => downloads.cancelDownload(m)}
        onDelete={removeModel}
        models={models}
        importing={importing}
        onImport={importModel}
        onSetRole={setModelRole}
      />
      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={changeSettings}
        translatorAvailable={translatorAvailable}
        googlePack={googlePack}
        packBusy={packBusy}
        onDownloadPack={downloadPack}
      />
      <AgentSheet
        visible={showAgent}
        onClose={() => setShowAgent(false)}
        chatBusy={generating}
        prepareLocal={prepareLocalAgent}
      />
      <VoiceSheet
        visible={showVoice}
        onClose={() => setShowVoice(false)}
        voiceLanguage={settings.voiceLanguage}
        onAsk={askByVoice}
      />
      <HistorySheet
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        conversations={conversations}
        currentId={chatId}
        onOpen={openChat}
        onDelete={deleteChat}
      />
    </SafeAreaView>
  );
}

function ModeChip(props: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.chip, props.active && { borderColor: props.color, backgroundColor: colors.surfaceHigh }]}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
    >
      <Text style={[styles.chipText, props.active && { color: props.color }]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  iconButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.text, fontSize: 20 },
  headerCenter: { flex: 1, paddingLeft: 4 },
  brand: { color: colors.text, fontSize: 19, fontWeight: '700', letterSpacing: 0.2 },
  brandDim: { color: colors.textFaint },
  subtitle: { color: colors.textFaint, fontSize: 12 },
  modelsPill: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  modelsPillText: { color: colors.text, fontSize: 13, fontWeight: '600' },

  empty: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24, gap: 12 },
  heroLogo: { color: colors.text, fontSize: 44, fontWeight: '800', textAlign: 'center', letterSpacing: -1 },
  heroTag: { color: colors.textDim, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  cta: { backgroundColor: colors.accent, borderRadius: 18, padding: 18, gap: 4 },
  ctaTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  ctaText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  suggestions: { gap: 10 },
  suggestion: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  suggestionKind: { fontSize: 12, fontWeight: '600' },
  suggestionText: { color: colors.text, fontSize: 15, lineHeight: 21 },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },

  dock: { paddingBottom: 8, gap: 8 },
  modes: { paddingHorizontal: 12, gap: 8, alignItems: 'center', paddingVertical: 4 },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 12,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 26,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 140,
    minHeight: 36,
    paddingTop: 7,
    paddingBottom: 7,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlyph: { fontSize: 17 },
  sendDisabled: { opacity: 0.3 },
  sendArrow: { color: colors.onAccent, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.onAccent },
});

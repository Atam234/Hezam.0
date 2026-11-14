# Hezam.0

A local AI assistant for mobile. One chat, many experts: the app automatically picks which
**on-device AI model** answers, based on your question — coding, writing, art and ideas,
math and reasoning, or general conversation. Every answer is generated on the phone itself;
internet is only needed to download models.

## How it works

1. **Router** (`src/router/router.ts`) — scores the message (English, Tagalog, Taglish)
   against keywords and patterns and picks a specialist. Routing uses no model inference,
   so it is instant and costs no extra RAM. A short follow-up ("fix it more") stays with
   the previous specialist.
2. **Model picker** — finds an installed model for that specialist. If it is not installed
   yet, the closest stand-in is used and the chat says so.
3. **Engine** (`src/engine/engine.ts`) — loads the model in llama.cpp and streams the
   answer. Only one model is in memory; it is swapped when the specialist changes.

You can override Auto with the chips above the message box.

## Reply language and translator

The app detects whether you wrote in Tagalog/Taglish or English (`src/router/language.ts`).
For Tagalog, **Google ML Kit on-device translation** (the offline language packs behind
Google Translate) sits between you and the AI models:

1. your Tagalog question is translated to English,
2. the specialist model answers in English, where small models are strongest,
3. the answer is translated back to Tagalog. Code blocks and inline code are left untouched,
   and "Show original" reveals the English answer.

The Tagalog pack (about 30 MB) is downloaded once, on first use or from Settings; after that
translation is offline. The native wrapper lives in `modules/hezam-translate` (Android only).
Where ML Kit is unavailable, the app falls back to asking the model to reply in Tagalog and
translating with an installed multilingual model. An explicit request such as
"i-translate sa English" always wins.

## Settings

The gear icon opens Settings: reply language (Auto / Tagalog / English), translator on/off,
voice language, a **max output tokens** slider (64–8192), and **context size**
(2048–16384 tokens). The app version is shown at the bottom.

## Voice mode

The microphone button opens a hands-free conversation: the phone listens, the local model
answers, and the answer is read aloud, then it listens again. Tap the circle to interrupt.
Speech recognition and the voice come from the phone's own speech services
([expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition),
[expo-speech](https://docs.expo.dev/versions/latest/sdk/speech/)); whether they work offline
depends on the speech packs installed on the phone. The AI model itself stays local.

## Using your own models

**Models → Import from files** lets you pick any `.gguf` file already on the phone. The app
copies it in, and you choose which specialist it is best at; matching questions are then
routed to it ahead of the built-in model for that specialist.

## Agent mode

The **Agent** button opens a task runner: you describe a task and the agent works through it
one tool call at a time (`src/agent/core.ts`), showing every step.

- **Brain** — an OpenAI-compatible **AI API** with your own key (presets for Claude, OpenAI,
  OpenRouter and Groq; the key is kept in the device keystore), or an installed **local
  model**. Small local models are unreliable at multi-step work; they suit simple file tasks.
- **Files** — the agent sees only the one folder you share through Android's folder picker.
  Creating and editing files is off until you allow it, and overwriting or deleting asks first.
- **Phone control** — an accessibility service (`modules/hezam-translate`) lets the agent read
  the screen as a numbered list of elements and tap, type, scroll and press system buttons.
  It is off until you enable "Hezam.0 phone control" in Android's Accessibility settings.

Besides reading the screen and tapping by number, the agent has higher-level actions that do
the fiddly parts itself: `search_here` finds the open app's search box, types and presses
Enter; `tap_text` taps whatever shows the given words; `type_here` types into the focused
box; `play_media` plays a song through a music app or starts the first YouTube result.
Multi-part commands such as "buksan ang Chrome at i-search ang weather" or "open Facebook,
search Jollibee, then tap Follow" are split into steps and run in order.

Commands typed in the normal chat are carried out too: `src/agent/intent.ts` recognises a
command ("buksan ang Chrome", "list my files", "search cats on YouTube") and runs it. One-step
commands are executed directly with no model involved. For longer tasks a local model is
given a JSON-schema grammar built from the available tools, so it must call a tool instead of
replying with prose.

With an API brain, the task, any file contents the agent reads and the on-screen text it sees
are sent to that provider. With a local model nothing leaves the phone.

## Specialists and models

| Specialist | Model | Size | Hugging Face |
| --- | --- | --- | --- |
| General Assistant | Qwen2.5 1.5B Instruct | 1.12 GB | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` |
| Coding Expert | Qwen2.5-Coder 1.5B | 1.12 GB | `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF` |
| Writer | Gemma 2 2B | 1.71 GB | `bartowski/gemma-2-2b-it-GGUF` |
| Art & Ideas | Llama 3.2 3B | 2.02 GB | `bartowski/Llama-3.2-3B-Instruct-GGUF` |
| Reasoning & Math | DeepSeek-R1 Distill 1.5B | 1.12 GB | `bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF` |
| General (lite) | SmolLM2 360M | 271 MB | `bartowski/SmolLM2-360M-Instruct-GGUF` |

All are Q4_K_M GGUF files. They are downloaded inside the app (**Models**), not bundled in
the APK. To add or swap a model, edit `src/models/catalog.ts`.

"Art & Ideas" is a text model: it produces art concepts and image prompts, not images.

## Technology (open source)

- [Expo](https://github.com/expo/expo) / [React Native](https://github.com/facebook/react-native) — app framework
- [llama.rn](https://github.com/mybigday/llama.rn) — React Native binding of
  [llama.cpp](https://github.com/ggml-org/llama.cpp) for on-device inference
- GGUF models from [Hugging Face](https://huggingface.co/models?library=gguf)

## Installing on Android

Every push builds an APK in GitHub Actions (the **Android APK** workflow, about 55 minutes).
Open the latest run in the *Actions* tab, download the `Hezam.0-apk` artifact, unzip it, and
install `app-release.apk` on the phone (arm64). It is debug-signed: fine for personal use,
but it needs its own signing key before publishing to the Play Store.

## Development

```bash
npm install
npm test             # router unit tests
npm run typecheck
npx expo run:android # needs the Android SDK; will not work in Expo Go (native code)
npm run web          # UI preview only: answers are a demo, no AI runs in the browser
```

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

The app detects whether you wrote in Tagalog/Taglish or English (`src/router/language.ts`)
and tells whichever model answers to reply in that language. If the answer still comes out
in the wrong language, the **translator** passes it through an installed multilingual model
(Gemma 2 2B, Llama 3.2 3B, or Qwen2.5 1.5B) before showing it; code blocks are left as they
are, and "Show original" reveals the untranslated answer. An explicit request such as
"i-translate sa English" or "explain in Tagalog" always wins.

## Settings

The gear icon opens Settings: reply language (Auto / Tagalog / English), translator on/off,
**max reply tokens** (256–4096), and **context size** (2048–8192 tokens).

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

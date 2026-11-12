# Hezam.0

Local AI assistant para sa mobile. Isang chat, maraming eksperto: kusang pinipili ng app
kung aling **on-device AI model** ang sasagot base sa tanong mo — coding, pagsusulat,
art at ideya, math at reasoning, o pangkalahatang usapan. Lahat ng sagot ay ginagawa sa
mismong phone; internet ang kailangan sa pag-download ng model lang.

## Paano ito gumagana

1. **Router** (`src/router/router.ts`) — sinusuri ang mensahe (English, Tagalog, Taglish)
   gamit ang mga keyword at pattern at pumipili ng specialist. Walang model inference ang
   routing kaya instant ito at walang dagdag na RAM. Ang maikling follow-up ("ayusin mo pa")
   ay nananatili sa dating specialist.
2. **Model picker** — hinahanap ang naka-install na model para sa specialist na iyon. Kung
   wala pa, gagamit ng pinakamalapit na pamalit at sasabihin ito sa chat.
3. **Engine** (`src/engine/engine.ts`) — nilo-load ang model sa llama.cpp at nag-i-stream ng
   sagot. Isang model lang ang nasa memory; pinapalitan kapag nagbago ang specialist.

Puwede ring i-override ang Auto gamit ang mga chip sa itaas ng message box.

## Mga specialist at model

| Specialist | Model | Laki | Hugging Face |
| --- | --- | --- | --- |
| General Assistant | Qwen2.5 1.5B Instruct | 1.12 GB | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` |
| Coding Expert | Qwen2.5-Coder 1.5B | 1.12 GB | `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF` |
| Writer | Gemma 2 2B | 1.71 GB | `bartowski/gemma-2-2b-it-GGUF` |
| Art & Ideas | Llama 3.2 3B | 2.02 GB | `bartowski/Llama-3.2-3B-Instruct-GGUF` |
| Reasoning & Math | DeepSeek-R1 Distill 1.5B | 1.12 GB | `bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF` |
| General (lite) | SmolLM2 360M | 271 MB | `bartowski/SmolLM2-360M-Instruct-GGUF` |

Lahat ay Q4_K_M GGUF. Dina-download sa loob ng app (**Models**), hindi kasama sa APK.
Para magdagdag o magpalit ng model, i-edit ang `src/models/catalog.ts`.

Ang "Art & Ideas" ay text model: nagbibigay ito ng art concepts at image prompts, hindi ito
gumagawa ng mismong larawan.

## Teknolohiya (open source)

- [Expo](https://github.com/expo/expo) / [React Native](https://github.com/facebook/react-native) — app framework
- [llama.rn](https://github.com/mybigday/llama.rn) — React Native binding ng
  [llama.cpp](https://github.com/ggml-org/llama.cpp) para sa on-device inference
- GGUF models mula sa [Hugging Face](https://huggingface.co/models?library=gguf)

## Pag-install sa Android

Bawat push ay nagbi-build ng APK sa GitHub Actions (workflow na **Android APK**). Buksan ang
pinakabagong run sa tab na *Actions*, i-download ang artifact na `Hezam.0-apk`, i-unzip, at
i-install ang `app-release.apk` sa phone (arm64). Debug-signed ito: ayos para sa sariling
gamit, pero kailangan ng sariling signing key bago i-publish sa Play Store.

## Development

```bash
npm install
npm test             # router unit tests
npm run typecheck
npx expo run:android # kailangan ng Android SDK; hindi gagana sa Expo Go (may native code)
npm run web          # UI preview lang: demo ang sagot, walang AI sa browser
```

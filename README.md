# 🏙️ Street Raja — Open World Game (v0.1)

**Apna khud ka open-world 3D game — browser mein bhi chalta hai aur Android APK mein bhi!**
Bade shehar, highway, gaon, dhabe, police chase, missions aur poora **Character Creator** 🔥

> Made by **Tech Bro Z** — YouTube [@techbrozdeveloper](https://www.youtube.com/@techbrozdeveloper) · Instagram [@tech_bro_z_1](https://www.instagram.com/tech_bro_z_1)

![Street Raja](docs/screenshot_1.jpg)

## ⬇️ Download / Khelo

| | Link |
|---|---|
| 📱 **Android APK** (HD graphics andar hi bundled, ~80 MB) | [Street-Raja-v0.1.apk](https://github.com/nm621532-byte/street-raja-techbroz/releases/download/v0.1/Street-Raja-v0.1.apk) |
| 🌐 **Browser mein khelo** (PC / phone) | https://street-raja.sites.tab.bot/ |
| 🗜️ Web build zip | [Street-Raja-v0.1-web.zip](https://github.com/nm621532-byte/street-raja-techbroz/releases/download/v0.1/Street-Raja-v0.1-web.zip) |

APK install: download karo → open karo → "Unknown apps / is source se install" allow karo → Install. Internet ki zaroorat nahi, sab kuch APK ke andar hai.

## 🗺️ Duniya (World) — ~4 × 4 km

- **Ratnapur** — main city: bazaar ki galiyan, 64+ Indian dukaanon ke signboard, downtown, police thana, park.
- **Sonapur Bazaar** — purana bazaar town: patli dukaanein, rang-birangi jhandiyan (bunting) sadak ke upar.
- **Samudra Nagar** — beach city: oonchi buildings, nariyal ke ped (palms), samudra beach.
- **Gaon** (Rampur, Kheri, Bhojpur, Chandpur, Lakhanpur), khet, **dhabe** (Sher-e-Punjab, Highway King…)
- **Highways** NH-44 aur NH-7 sab shehron ko jodte hain, har shehar ke entry pe welcome gate.
- Chunk-streaming world: paas ke chunks load, door wale unload, LOD, har chunk ka apna seed → map aage aur bada hota jayega.
- Bada map 🗺 button (ya `M`) se dekho.

## 👕 Character Creator

Main menu → **CHARACTER BANAO**, ya Ratnapur mein **pink gol ghere** (kapde ki dukaan) mein jao.
- Ladka / Ladki, body (patla → bhaari), height, 8 skin tones
- Chehra preset, aankhon ka rang, daadhi / moochh / halki daadhi
- 7 hairstyles + 12 hair colours
- T-shirt / Shirt / Kurta / Jacket / Baniyan + colours + Lines/Checks design
- Jeans / Pant / Shorts / Pajama + colours, joote ka rang
- Cap / Topi / Pagdi, chashma / golden / kaala chashma, ghadi
- Live 3D preview (drag karke ghumao), save hota hai aur game mein wahi character dikhta hai.

## 🎮 Gameplay
- Paidal chalo/bhaago/jump/punch, kisi bhi gaadi mein baitho (sedan, SUV, sports, taxi, auto-rickshaw, police…)
- Traffic signals, traffic AI, pedestrians, din-raat (day/night), baarish 🌧
- Wanted level ★ + police chase, BUSTED / WASTED
- 5 missions: Mithai Delivery, Auto Wala, Police Se Bhaago, Sonapur Parcel, Samudra Trip
- Progress auto-save

**Phone controls:** left side = joystick, right side = camera, buttons: RUN / JUMP / PUNCH / ENTER, gaadi mein GAS / BRAKE / DRIFT / EXIT / horn.
**PC controls:** WASD chalna · Shift run · Space jump/drift · F gaadi mein baitho/niklo · Click punch · Mouse camera · C camera · M map · R baarish · T time · H horn · Esc menu

## ⚙️ Graphics
HDRI sky, real-time shadows, PBR textures (2K), bloom, ambient occlusion, SMAA, wet roads. Presets **Low / Medium / High / Ultra** — phone ke hisaab se apne aap select hota hai, aur dynamic resolution FPS ko ~30+ rakhta hai.

## 🛠️ Khud build karo
```bash
cd game
npm install
npx vite            # dev server
npx vite build      # dist/ banega
python3 tests/smoke.py   # smoke test (har publish se pehle)
```
Android APK: `android/` folder = Capacitor shell. `dist/` ko `android/www/` mein copy karo → `npx cap sync android` → `cd native && ./gradlew assembleRelease` (apna keystore `keystore.properties` mein).

Note: HD textures/models (~75 MB) repo mein nahi daale (bade hain) — wo **web zip** release asset mein hain (`assets/` folder), use `game/public/assets/` mein rakh do.

## 📜 Credits
Dekho [CREDITS.md](CREDITS.md). Saare assets CC0 / MIT. Saare naam aur jagah kaalpanik (fictional) hain.

License: MIT (code). Assets ke apne CC0 license.

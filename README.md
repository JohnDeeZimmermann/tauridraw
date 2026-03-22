# Tauridraw
This is a desktop version of Excalidraw using Tauri. The Excalidraw license notice is found in src/.
It it highly custom and specifically tuned to my personal preferences.

## Key Features

The core of the application consists of the free and open source version of Excalidraw. 
There are, however, a few key changes: 

* Local-only: All external services are removed
* Native file browser support
* Multiple tab support
* Application menu bar instead of the top left burger menu

## Window Bar Preference

tauridraw lets you choose between the custom window bar and the OS-managed window bar from the app menu:

`Preferences` -> `Use custom window bar`

The preference is saved and applied after you restart tauridraw.

## Usage
For a simple dev build run 
```
yarn tauri dev
```

If you want to package the application (e.g. as an AppImage) run
```
yarn tauri build --bundles appimage
```

## AI disclaimer

This application was 99% vibe coded using Codex while I was sick. 
This served as an experiment of how far vibe coding can take me. The code is a bit rough and there are small bugs.
Certain features (such as making use of KDEs global menu) the AI was unable to 
implement which is why I might revist the codebase in the future. 

*For the purposes of transparency, I opt to add an AI disclaimer to all my repositories which indicates the degree
of which AI was used.*

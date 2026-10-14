// Render360 Wasm launcher unity translation unit.
//
// The launcher is archived as libhl2_launcher.a before the final Emscripten
// MAIN_MODULE link. Keeping main.cpp and the browser-backed retail bridge in
// one archive member guarantees the bridge is extracted with main(), rather
// than leaving its runtime-dlopen symbols stranded in an otherwise-unreferenced
// static-library object.

#include "main.cpp"
#include "render360_browser_files.cpp"

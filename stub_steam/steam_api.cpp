#include <stdint.h>
typedef uint64_t uint64;
typedef uint32_t uint32;
typedef uint16_t uint16;

#define _CRT_SECURE_NO_WARNINGS
#define STEAM_API_EXPORTS

#if defined __GNUC__
 #define S_API extern "C" __attribute__ ((visibility("default"))) 
#elif defined _MSC_VER
#define S_API extern "C" __declspec(dllexport)
#endif
#define NULL 0

S_API void *g_pSteamClientGameServer;
void *g_pSteamClientGameServer = NULL;

//steam_api.h
S_API bool SteamAPI_Init() {
	return true;
}

S_API bool SteamAPI_InitSafe() {
	return true;
}

S_API void SteamAPI_Shutdown() {

}

S_API bool SteamAPI_RestartAppIfNecessary() {
	return false;
}

S_API void SteamAPI_ReleaseCurrentThreadMemory() {

}

S_API void SteamAPI_WriteMiniDump(uint32 uStructuredExceptionCode, void* pvExceptionInfo, uint32 uBuildID) {

}

S_API void SteamAPI_SetMiniDumpComment(const char *pchMsg) {

}

S_API void SteamAPI_RunCallbacks() {
}

S_API void SteamAPI_RegisterCallback(void *pCallback, int iCallback) {

}

S_API void SteamAPI_UnregisterCallback(void *pCallback) {

}

S_API void SteamAPI_RegisterCallResult(void*, uint64) {

}

S_API void SteamAPI_UnregisterCallResult(void*, uint64) {

}

S_API bool SteamAPI_IsSteamRunning() {
	return false;
}

S_API void Steam_RunCallbacks() {

}

S_API void Steam_RegisterInterfaceFuncs() {
}

S_API int Steam_GetHSteamUserCurrent() {
	return 0;
}

S_API const char *SteamAPI_GetSteamInstallPath() {
	return NULL;
}

S_API int SteamAPI_GetHSteamPipe() {
	return 0;
}

S_API void SteamAPI_SetTryCatchCallbacks(bool bTryCatchCallbacks) {

}

S_API void SteamAPI_SetBreakpadAppID(uint32 unAppID) {

}

S_API void SteamAPI_UseBreakpadCrashHandler(char const *pchVersion, char const *pchDate, char const *pchTime, bool bFullMemoryDumps, void *pvContext, void* m_pfnPreMinidumpCallback) {

}

S_API int GetHSteamPipe() {
	return 0;
}

S_API int GetHSteamUser() {
	return 0;
}

S_API int SteamAPI_GetHSteamUser() {
	return 0;
}

S_API void *SteamInternal_ContextInit() {
	return NULL;
}

S_API void *SteamInternal_CreateInterface() {
	return NULL;
}

S_API void *SteamApps() {
	return NULL;
}

S_API void *SteamClient() {
	return NULL;
}

S_API void *SteamFriends() {
	return NULL;
}

S_API void *SteamHTTP() {
	return NULL;
}

S_API void *SteamMatchmaking() {
	return NULL;
}

S_API void *SteamMatchmakingServers() {
	return NULL;
}

S_API void *SteamNetworking() {
	return NULL;
}

S_API void *SteamRemoteStorage() {
	return NULL;
}

S_API void *SteamScreenshots() {
	return NULL;
}

S_API void *SteamUser() {
	return NULL;
}

S_API void *SteamUserStats() {
	return NULL;
}

S_API void *SteamUtils() {
	return NULL;
}

S_API int SteamGameServer_GetHSteamPipe() {
	return 0;
}

S_API int SteamGameServer_GetHSteamUser() {
	return 0;
}

S_API int SteamGameServer_GetIPCCallCount() {
	return 0;
}

S_API int SteamGameServer_InitSafe(uint32 unIP, uint16 usSteamPort, uint16 usGamePort, uint16 usQueryPort, int eServerMode, const char *pchVersionString) {
	return 0;
}

S_API void SteamGameServer_RunCallbacks() {
}

S_API void SteamGameServer_Shutdown() {
}

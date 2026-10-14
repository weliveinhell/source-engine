#import "R360SDLAudioHost.h"
#import "R360Diagnostics.h"
#include <SDL.h>

@interface R360SDLAudioHost ()
@property(nonatomic, assign) SDL_AudioDeviceID deviceID;
@property(nonatomic, assign) SDL_AudioSpec obtained;
@end

static void R360SilenceCallback(void *userdata, Uint8 *stream, int length) {
    (void)userdata;
    SDL_memset(stream, 0, (size_t)length);
}

@implementation R360SDLAudioHost
- (BOOL)isOpen { return self.deviceID != 0; }
- (BOOL)start:(NSString **)error {
    if (self.deviceID) return YES;
    SDL_AudioSpec desired;
    SDL_zero(desired);
    desired.freq = 48000;
    desired.format = AUDIO_F32SYS;
    desired.channels = 2;
    desired.samples = 512;
    desired.callback = R360SilenceCallback;
    self.deviceID = SDL_OpenAudioDevice(NULL, 0, &desired, &_obtained,
        SDL_AUDIO_ALLOW_FREQUENCY_CHANGE | SDL_AUDIO_ALLOW_SAMPLES_CHANGE);
    if (!self.deviceID) {
        if (error) *error = [NSString stringWithFormat:@"SDL_OpenAudioDevice failed: %s", SDL_GetError()];
        return NO;
    }
    [R360Diagnostics.sharedDiagnostics setAudioState:[NSString stringWithFormat:@"open %d Hz | %u ch | %u samples | synthetic silence",
        self.obtained.freq, self.obtained.channels, self.obtained.samples]];
    SDL_PauseAudioDevice(self.deviceID, 0);
    return YES;
}
- (void)pause { if (self.deviceID) SDL_PauseAudioDevice(self.deviceID, 1); }
- (void)resume { if (self.deviceID) SDL_PauseAudioDevice(self.deviceID, 0); }
- (void)shutdown { if (self.deviceID) { SDL_CloseAudioDevice(self.deviceID); self.deviceID = 0; } }
@end

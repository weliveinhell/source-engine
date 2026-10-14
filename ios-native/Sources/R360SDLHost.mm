#define SDL_MAIN_HANDLED 1
#import "R360SDLHost.h"
#import "R360Diagnostics.h"
#import "R360GLESRendererBackend.h"
#import "R360SDLAudioHost.h"
#import "R360SDLInputDiagnostics.h"
#import "R360LifecycleService.h"
#include <SDL.h>
#include <SDL_main.h>
#include <SDL_system.h>

@interface R360SDLHost () <R360LifecycleServiceDelegate>
@property(nonatomic, assign) SDL_Window *window;
@property(nonatomic, strong) R360GLESRendererBackend *renderer;
@property(nonatomic, strong) R360SDLAudioHost *audio;
@property(nonatomic, strong) R360SDLInputDiagnostics *input;
@property(nonatomic, assign, readwrite, getter=isRunning) BOOL running;
@property(nonatomic, assign) BOOL renderingEnabled;
@property(nonatomic, assign) BOOL firstFramePresented;
- (void)performFrame;
- (void)cleanupHost;
@end

static void SDLCALL R360FrameCallback(void *context) {
    R360SDLHost *host = (__bridge R360SDLHost *)context;
    [host performFrame];
}

@implementation R360SDLHost
+ (instancetype)sharedHost { static R360SDLHost *h; static dispatch_once_t once; dispatch_once(&once, ^{ h = [R360SDLHost new]; }); return h; }

- (BOOL)start:(NSString **)error {
    if (self.running) return YES;
    [R360Diagnostics.sharedDiagnostics setLatestError:nil];
    [R360Diagnostics.sharedDiagnostics setCheckpoint:@"sdl-host-enter"];
    SDL_SetMainReady();
    SDL_SetHint(SDL_HINT_ORIENTATIONS, "LandscapeLeft LandscapeRight");
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_GAMECONTROLLER | SDL_INIT_EVENTS) != 0) {
        if (error) *error = [NSString stringWithFormat:@"SDL_Init failed: %s", SDL_GetError()];
        return NO;
    }
    [R360Diagnostics.sharedDiagnostics setCheckpoint:@"sdl-video-init"];
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
    SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);
    SDL_DisplayMode mode;
    if (SDL_GetCurrentDisplayMode(0, &mode) != 0) { mode.w = 896; mode.h = 414; }
    int width = mode.w > mode.h ? mode.w : mode.h;
    int height = mode.w > mode.h ? mode.h : mode.w;
    self.window = SDL_CreateWindow("Render360 Portal N1", SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
        width, height, SDL_WINDOW_OPENGL | SDL_WINDOW_ALLOW_HIGHDPI | SDL_WINDOW_FULLSCREEN);
    if (!self.window) {
        if (error) *error = [NSString stringWithFormat:@"SDL_CreateWindow failed: %s", SDL_GetError()];
        [self cleanupHost];
        return NO;
    }
    [R360Diagnostics.sharedDiagnostics setCheckpoint:@"sdl-window-created"];
    self.renderer = [R360GLESRendererBackend new];
    NSString *localError = nil;
    if (![self.renderer startWithWindow:self.window error:&localError]) {
        if (error) *error = localError;
        [self cleanupHost];
        return NO;
    }
    self.input = [R360SDLInputDiagnostics new];
    [self.input openConnectedControllers];
    self.audio = [R360SDLAudioHost new];
    if (![self.audio start:&localError]) {
        if (error) *error = localError;
        [self cleanupHost];
        return NO;
    }
    R360LifecycleService.sharedService.delegate = self;
    [R360LifecycleService.sharedService startObserving];
    self.renderingEnabled = YES;
    self.running = YES;
    self.firstFramePresented = NO;
    if (SDL_iPhoneSetAnimationCallback(self.window, 1, R360FrameCallback, (__bridge void *)self) != 0) {
        if (error) *error = [NSString stringWithFormat:@"SDL_iPhoneSetAnimationCallback failed: %s", SDL_GetError()];
        [self cleanupHost];
        return NO;
    }
    return YES;
}

- (void)performFrame {
    if (!self.running) return;
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        [self.input handleEvent:&event window:self.window];
        if (event.type == SDL_WINDOWEVENT && (event.window.event == SDL_WINDOWEVENT_SIZE_CHANGED || event.window.event == SDL_WINDOWEVENT_RESIZED)) {
            [self.renderer refreshMetrics];
        }
    }
    if (!self.renderingEnabled) return;
    [self.renderer renderFrameAtSeconds:(double)SDL_GetTicks64() / 1000.0];
    if (!self.firstFramePresented) {
        self.firstFramePresented = YES;
        [R360Diagnostics.sharedDiagnostics setCheckpoint:@"first-frame-presented"];
    }
}

- (void)cleanupHost {
    self.renderingEnabled = NO;
    self.running = NO;
    [self.audio shutdown];
    [self.input shutdown];
    [self.renderer shutdown];
    self.audio = nil;
    self.input = nil;
    self.renderer = nil;
    if (self.window) {
        SDL_DestroyWindow(self.window);
        self.window = NULL;
    }
    if (SDL_WasInit(0) != 0) SDL_Quit();
    self.firstFramePresented = NO;
}

- (void)r360WillResignActive { self.renderingEnabled = NO; [self.audio pause]; }
- (void)r360DidBecomeActive { [self.renderer resume]; [self.audio resume]; self.renderingEnabled = YES; }
- (void)r360DidEnterBackground { self.renderingEnabled = NO; [self.audio pause]; }
- (void)r360WillEnterForeground { [self.renderer resume]; }
- (void)r360AudioInterruptionBegan { [self.audio pause]; }
- (void)r360AudioInterruptionEndedShouldResume:(BOOL)shouldResume { if (shouldResume) [self.audio resume]; }
- (void)r360OrientationDidChange { [self.renderer refreshMetrics]; }
- (void)r360WillTerminate { [self cleanupHost]; }
@end

#import "R360GLESRendererBackend.h"
#import "R360Diagnostics.h"
#import <UIKit/UIKit.h>
#include <SDL.h>
#include <SDL_syswm.h>
#include <OpenGLES/ES3/gl.h>
#include <math.h>

@interface R360GLESRendererBackend ()
@property(nonatomic, assign) SDL_Window *window;
@property(nonatomic, assign) SDL_GLContext context;
@property(nonatomic, assign) int drawableWidth;
@property(nonatomic, assign) int drawableHeight;
@end

@implementation R360GLESRendererBackend

- (BOOL)startWithWindow:(SDL_Window *)window error:(NSString **)error {
    self.window = window;
    self.context = SDL_GL_CreateContext(window);
    if (!self.context) {
        if (error) *error = [NSString stringWithFormat:@"SDL_GL_CreateContext failed: %s", SDL_GetError()];
        return NO;
    }
    if (SDL_GL_MakeCurrent(window, self.context) != 0) {
        if (error) *error = [NSString stringWithFormat:@"SDL_GL_MakeCurrent failed: %s", SDL_GetError()];
        return NO;
    }
    SDL_GL_SetSwapInterval(1);
    const GLubyte *version = glGetString(GL_VERSION);
    const GLubyte *renderer = glGetString(GL_RENDERER);
    const GLubyte *vendor = glGetString(GL_VENDOR);
    NSString *summary = [NSString stringWithFormat:@"GLES: %s | renderer: %s | vendor: %s",
                         version ? (const char *)version : "unknown",
                         renderer ? (const char *)renderer : "unknown",
                         vendor ? (const char *)vendor : "unknown"];
    [R360Diagnostics.sharedDiagnostics setRendererState:summary];
    [R360Diagnostics.sharedDiagnostics setCheckpoint:@"gles-context-created"];
    [self refreshMetrics];
    return YES;
}

- (void)refreshMetrics {
    if (!self.window) return;
    int logicalW = 0, logicalH = 0;
    SDL_GetWindowSize(self.window, &logicalW, &logicalH);
    SDL_GL_GetDrawableSize(self.window, &_drawableWidth, &_drawableHeight);
    UIEdgeInsets safe = UIEdgeInsetsZero;
    SDL_SysWMinfo info;
    SDL_VERSION(&info.version);
    if (SDL_GetWindowWMInfo(self.window, &info) && info.subsystem == SDL_SYSWM_UIKIT && info.info.uikit.window) {
        safe = info.info.uikit.window.safeAreaInsets;
    }
    double scale = logicalW > 0 ? (double)self.drawableWidth / (double)logicalW : 0.0;
    [R360Diagnostics.sharedDiagnostics setDisplayState:[NSString stringWithFormat:@"points %dx%d | pixels %dx%d | scale %.2fx | safe %.0f/%.0f/%.0f/%.0f",
        logicalW, logicalH, self.drawableWidth, self.drawableHeight, scale,
        safe.top, safe.left, safe.bottom, safe.right]];
}

- (void)renderFrameAtSeconds:(double)seconds {
    if (!self.window || !self.context) return;
    glViewport(0, 0, self.drawableWidth, self.drawableHeight);
    float r = 0.12f + 0.08f * (float)(0.5 + 0.5 * sin(seconds * 0.9));
    float g = 0.16f + 0.10f * (float)(0.5 + 0.5 * sin(seconds * 1.1 + 1.7));
    float b = 0.22f + 0.12f * (float)(0.5 + 0.5 * sin(seconds * 0.7 + 3.2));
    glClearColor(r, g, b, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
    SDL_GL_SwapWindow(self.window);
}

- (void)resume {
    if (self.window && self.context) SDL_GL_MakeCurrent(self.window, self.context);
    [self refreshMetrics];
}

- (void)shutdown {
    if (self.context) {
        SDL_GL_DeleteContext(self.context);
        self.context = NULL;
    }
    self.window = NULL;
}
@end

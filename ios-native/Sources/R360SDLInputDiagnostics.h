#import <Foundation/Foundation.h>
#include <SDL.h>
NS_ASSUME_NONNULL_BEGIN
@interface R360SDLInputDiagnostics : NSObject
- (void)openConnectedControllers;
- (void)handleEvent:(const SDL_Event *)event window:(SDL_Window *)window;
- (void)shutdown;
@end
NS_ASSUME_NONNULL_END

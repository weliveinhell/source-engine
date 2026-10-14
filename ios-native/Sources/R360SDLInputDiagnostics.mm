#import "R360SDLInputDiagnostics.h"
#import "R360Diagnostics.h"
#include <unordered_map>

@interface R360SDLInputDiagnostics ()
@property(nonatomic, assign) NSInteger activeTouches;
@end

@implementation R360SDLInputDiagnostics {
    std::unordered_map<SDL_JoystickID, SDL_GameController *> _controllers;
}

- (void)openControllerAtIndex:(int)index {
    if (!SDL_IsGameController(index)) return;
    SDL_GameController *controller = SDL_GameControllerOpen(index);
    if (!controller) return;
    SDL_Joystick *joystick = SDL_GameControllerGetJoystick(controller);
    SDL_JoystickID identifier = SDL_JoystickInstanceID(joystick);
    _controllers[identifier] = controller;
    const char *name = SDL_GameControllerName(controller);
    SDL_GameControllerType type = SDL_GameControllerGetType(controller);
    [R360Diagnostics.sharedDiagnostics setInputState:[NSString stringWithFormat:@"controller connected: %s | type %d | instance %d", name ?: "unknown", (int)type, (int)identifier]];
}

- (void)openConnectedControllers {
    SDL_GameControllerEventState(SDL_ENABLE);
    for (int i = 0; i < SDL_NumJoysticks(); ++i) [self openControllerAtIndex:i];
    if (_controllers.empty()) [R360Diagnostics.sharedDiagnostics setInputState:@"touch ready | controller: none"];
}

- (void)handleEvent:(const SDL_Event *)event window:(SDL_Window *)window {
    switch (event->type) {
        case SDL_FINGERDOWN:
            self.activeTouches += 1;
            // fall through
        case SDL_FINGERMOTION: {
            int w = 0, h = 0; SDL_GetWindowSize(window, &w, &h);
            [R360Diagnostics.sharedDiagnostics setInputState:[NSString stringWithFormat:@"touch %@ | normalized %.3f,%.3f | points %.0f,%.0f | active %ld",
                event->type == SDL_FINGERDOWN ? @"down" : @"move", event->tfinger.x, event->tfinger.y,
                event->tfinger.x * w, event->tfinger.y * h, (long)self.activeTouches]];
            break;
        }
        case SDL_FINGERUP: {
            self.activeTouches = MAX(0, self.activeTouches - 1);
            [R360Diagnostics.sharedDiagnostics setInputState:[NSString stringWithFormat:@"touch up | normalized %.3f,%.3f | active %ld", event->tfinger.x, event->tfinger.y, (long)self.activeTouches]];
            break;
        }
        case SDL_CONTROLLERDEVICEADDED:
            [self openControllerAtIndex:event->cdevice.which];
            break;
        case SDL_CONTROLLERDEVICEREMOVED: {
            auto it = _controllers.find(event->cdevice.which);
            if (it != _controllers.end()) { SDL_GameControllerClose(it->second); _controllers.erase(it); }
            [R360Diagnostics.sharedDiagnostics setInputState:[NSString stringWithFormat:@"controller disconnected: instance %d", (int)event->cdevice.which]];
            break;
        }
        case SDL_CONTROLLERBUTTONDOWN:
        case SDL_CONTROLLERBUTTONUP: {
            const char *button = SDL_GameControllerGetStringForButton((SDL_GameControllerButton)event->cbutton.button);
            [R360Diagnostics.sharedDiagnostics setInputState:[NSString stringWithFormat:@"controller button %s %@", button ?: "unknown", event->type == SDL_CONTROLLERBUTTONDOWN ? @"down" : @"up"]];
            break;
        }
        case SDL_CONTROLLERAXISMOTION: {
            const char *axis = SDL_GameControllerGetStringForAxis((SDL_GameControllerAxis)event->caxis.axis);
            [R360Diagnostics.sharedDiagnostics setInputState:[NSString stringWithFormat:@"controller axis %s = %d", axis ?: "unknown", event->caxis.value]];
            break;
        }
        default: break;
    }
}

- (void)shutdown {
    for (auto &entry : _controllers) SDL_GameControllerClose(entry.second);
    _controllers.clear();
    self.activeTouches = 0;
}
@end

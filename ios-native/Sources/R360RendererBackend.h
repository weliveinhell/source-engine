#import <Foundation/Foundation.h>

typedef struct SDL_Window SDL_Window;

NS_ASSUME_NONNULL_BEGIN

@protocol R360RendererBackend <NSObject>
- (BOOL)startWithWindow:(SDL_Window *)window error:(NSString * _Nullable * _Nullable)error;
- (void)renderFrameAtSeconds:(double)seconds;
- (void)refreshMetrics;
- (void)resume;
- (void)shutdown;
@end

NS_ASSUME_NONNULL_END

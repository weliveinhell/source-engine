#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface R360SDLAudioHost : NSObject
@property(nonatomic, readonly, getter=isOpen) BOOL open;
- (BOOL)start:(NSString * _Nullable * _Nullable)error;
- (void)pause;
- (void)resume;
- (void)shutdown;
@end
NS_ASSUME_NONNULL_END

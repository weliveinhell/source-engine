#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface R360SDLHost : NSObject
@property(nonatomic, readonly, getter=isRunning) BOOL running;
+ (instancetype)sharedHost;
- (BOOL)start:(NSString * _Nullable * _Nullable)error;
@end
NS_ASSUME_NONNULL_END

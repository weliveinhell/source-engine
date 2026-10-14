#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@protocol R360LifecycleServiceDelegate <NSObject>
- (void)r360WillResignActive;
- (void)r360DidBecomeActive;
- (void)r360DidEnterBackground;
- (void)r360WillEnterForeground;
- (void)r360AudioInterruptionBegan;
- (void)r360AudioInterruptionEndedShouldResume:(BOOL)shouldResume;
- (void)r360OrientationDidChange;
- (void)r360WillTerminate;
@end
@interface R360LifecycleService : NSObject
@property(nonatomic, weak, nullable) id<R360LifecycleServiceDelegate> delegate;
+ (instancetype)sharedService;
- (void)startObserving;
@end
NS_ASSUME_NONNULL_END

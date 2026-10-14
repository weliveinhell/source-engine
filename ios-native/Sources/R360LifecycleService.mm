#import "R360LifecycleService.h"
#import "R360Diagnostics.h"
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>

@implementation R360LifecycleService {
    BOOL _observing;
}
+ (instancetype)sharedService { static R360LifecycleService *s; static dispatch_once_t once; dispatch_once(&once, ^{ s = [R360LifecycleService new]; }); return s; }
- (void)startObserving {
    if (_observing) return; _observing = YES;
    NSNotificationCenter *nc = NSNotificationCenter.defaultCenter;
    [nc addObserver:self selector:@selector(willResign:) name:UIApplicationWillResignActiveNotification object:nil];
    [nc addObserver:self selector:@selector(didBecome:) name:UIApplicationDidBecomeActiveNotification object:nil];
    [nc addObserver:self selector:@selector(didBackground:) name:UIApplicationDidEnterBackgroundNotification object:nil];
    [nc addObserver:self selector:@selector(willForeground:) name:UIApplicationWillEnterForegroundNotification object:nil];
    [nc addObserver:self selector:@selector(memoryWarning:) name:UIApplicationDidReceiveMemoryWarningNotification object:nil];
    [nc addObserver:self selector:@selector(orientation:) name:UIDeviceOrientationDidChangeNotification object:nil];
    [nc addObserver:self selector:@selector(audioInterruption:) name:AVAudioSessionInterruptionNotification object:AVAudioSession.sharedInstance];
    [nc addObserver:self selector:@selector(willTerminate:) name:UIApplicationWillTerminateNotification object:nil];
    [UIDevice.currentDevice beginGeneratingDeviceOrientationNotifications];
    [R360Diagnostics.sharedDiagnostics setLifecycleState:@"observing"];
}
- (void)willResign:(NSNotification *)n { (void)n; [R360Diagnostics.sharedDiagnostics setLifecycleState:@"resigned active"]; [R360Diagnostics.sharedDiagnostics setCheckpoint:@"app-resigned-active"]; [self.delegate r360WillResignActive]; }
- (void)didBecome:(NSNotification *)n { (void)n; [R360Diagnostics.sharedDiagnostics setLifecycleState:@"active"]; [R360Diagnostics.sharedDiagnostics setCheckpoint:@"app-active"]; [self.delegate r360DidBecomeActive]; }
- (void)didBackground:(NSNotification *)n { (void)n; [R360Diagnostics.sharedDiagnostics setLifecycleState:@"background"]; [R360Diagnostics.sharedDiagnostics setCheckpoint:@"app-background"]; [self.delegate r360DidEnterBackground]; }
- (void)willForeground:(NSNotification *)n { (void)n; [R360Diagnostics.sharedDiagnostics setLifecycleState:@"foreground"]; [R360Diagnostics.sharedDiagnostics setCheckpoint:@"app-foreground"]; [self.delegate r360WillEnterForeground]; }
- (void)memoryWarning:(NSNotification *)n { (void)n; [R360Diagnostics.sharedDiagnostics recordMemoryWarning]; }
- (void)orientation:(NSNotification *)n { (void)n; [R360Diagnostics.sharedDiagnostics setCheckpoint:@"orientation-changed"]; [self.delegate r360OrientationDidChange]; }
- (void)audioInterruption:(NSNotification *)n {
    AVAudioSessionInterruptionType type = [n.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue];
    if (type == AVAudioSessionInterruptionTypeBegan) {
        [R360Diagnostics.sharedDiagnostics setCheckpoint:@"audio-interruption-begin"];
        [self.delegate r360AudioInterruptionBegan];
    } else {
        AVAudioSessionInterruptionOptions opts = [n.userInfo[AVAudioSessionInterruptionOptionKey] unsignedIntegerValue];
        BOOL resume = (opts & AVAudioSessionInterruptionOptionShouldResume) != 0;
        [R360Diagnostics.sharedDiagnostics setCheckpoint:@"audio-interruption-end"];
        [self.delegate r360AudioInterruptionEndedShouldResume:resume];
    }
}
- (void)willTerminate:(NSNotification *)n {
    (void)n;
    [R360Diagnostics.sharedDiagnostics setLifecycleState:@"terminating"];
    [R360Diagnostics.sharedDiagnostics setCheckpoint:@"application-will-terminate"];
    [self.delegate r360WillTerminate];
}
@end

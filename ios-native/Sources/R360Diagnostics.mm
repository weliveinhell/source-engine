#import "R360Diagnostics.h"
#import <UIKit/UIKit.h>
#ifndef RENDER360_BUILD_IDENTIFIER
#define RENDER360_BUILD_IDENTIFIER "local"
#endif
NSString * const R360DiagnosticsDidChangeNotification = @"R360DiagnosticsDidChangeNotification";
@interface R360Diagnostics ()
@property(nonatomic, copy, readwrite) NSString *checkpoint;
@property(nonatomic, copy, readwrite) NSString *gameDataState;
@property(nonatomic, copy, readwrite) NSString *lifecycleState;
@property(nonatomic, copy, readwrite) NSString *rendererState;
@property(nonatomic, copy, readwrite) NSString *displayState;
@property(nonatomic, copy, readwrite) NSString *inputState;
@property(nonatomic, copy, readwrite) NSString *audioState;
@property(nonatomic, copy, readwrite, nullable) NSString *latestError;
@property(nonatomic, assign, readwrite) NSUInteger memoryWarningCount;
@end
@implementation R360Diagnostics
+ (instancetype)sharedDiagnostics { static R360Diagnostics *d; static dispatch_once_t once; dispatch_once(&once, ^{ d=[[R360Diagnostics alloc] initPrivate]; }); return d; }
- (instancetype)init { [NSException raise:NSInternalInconsistencyException format:@"Use +sharedDiagnostics"]; return nil; }
- (instancetype)initPrivate { if ((self=[super init])) { _checkpoint=@"bootstrap-created"; _gameDataState=@"not configured"; _lifecycleState=@"starting"; _rendererState=@"not started"; _displayState=@"not available"; _inputState=@"not started"; _audioState=@"not started"; } return self; }
- (void)postChange { void (^p)(void)=^{ [NSNotificationCenter.defaultCenter postNotificationName:R360DiagnosticsDidChangeNotification object:self]; }; NSThread.isMainThread ? p() : dispatch_async(dispatch_get_main_queue(), p); }
#define R360_SETTER(method, ivar) - (void)method:(NSString *)state { @synchronized(self){ ivar=[state copy]; } [self postChange]; }
R360_SETTER(setCheckpoint, _checkpoint)
R360_SETTER(setGameDataState, _gameDataState)
R360_SETTER(setLifecycleState, _lifecycleState)
R360_SETTER(setRendererState, _rendererState)
R360_SETTER(setDisplayState, _displayState)
R360_SETTER(setInputState, _inputState)
R360_SETTER(setAudioState, _audioState)
- (void)setLatestError:(NSString *)error { @synchronized(self){ _latestError=[error copy]; } [self postChange]; }
- (void)recordMemoryWarning { @synchronized(self){ _memoryWarningCount++; _checkpoint=@"memory-warning"; } [self postChange]; }
- (NSString *)architectureName {
#if defined(__arm64__) || defined(__aarch64__)
 return @"arm64";
#elif defined(__x86_64__)
 return @"x86_64";
#else
 return @"unknown";
#endif
}
- (NSString *)formattedSummary {
 NSString *cp,*gd,*lc,*rs,*ds,*is,*as,*err; NSUInteger mw;
 @synchronized(self){ cp=[_checkpoint copy]; gd=[_gameDataState copy]; lc=[_lifecycleState copy]; rs=[_rendererState copy]; ds=[_displayState copy]; is=[_inputState copy]; as=[_audioState copy]; err=[_latestError copy]; mw=_memoryWarningCount; }
 NSBundle *b=NSBundle.mainBundle; NSString *v=[b objectForInfoDictionaryKey:@"CFBundleShortVersionString"]?:@"unknown"; NSString *build=[b objectForInfoDictionaryKey:@"CFBundleVersion"]?:@"unknown"; NSString *commit=[NSString stringWithUTF8String:RENDER360_BUILD_IDENTIFIER]?:@"unknown";
 return [NSString stringWithFormat:@"version: %@ (%@)\ncommit: %@\narchitecture: %@\niOS: %@\ncheckpoint: %@\nlifecycle: %@\ndisplay: %@\nrenderer: %@\ninput: %@\naudio: %@\nmemory warnings: %lu\ngame data: %@\nlatest error: %@",v,build,commit,[self architectureName],UIDevice.currentDevice.systemVersion?:@"unknown",cp,lc,ds,rs,is,as,(unsigned long)mw,gd,err.length?err:@"none"];
}
@end

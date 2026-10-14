#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
extern NSString * const R360DiagnosticsDidChangeNotification;
@interface R360Diagnostics : NSObject
@property(nonatomic, copy, readonly) NSString *checkpoint;
@property(nonatomic, copy, readonly) NSString *gameDataState;
@property(nonatomic, copy, readonly) NSString *lifecycleState;
@property(nonatomic, copy, readonly) NSString *rendererState;
@property(nonatomic, copy, readonly) NSString *displayState;
@property(nonatomic, copy, readonly) NSString *inputState;
@property(nonatomic, copy, readonly) NSString *audioState;
@property(nonatomic, copy, readonly, nullable) NSString *latestError;
@property(nonatomic, assign, readonly) NSUInteger memoryWarningCount;
+ (instancetype)sharedDiagnostics;
- (void)setCheckpoint:(NSString *)checkpoint;
- (void)setGameDataState:(NSString *)state;
- (void)setLifecycleState:(NSString *)state;
- (void)setRendererState:(NSString *)state;
- (void)setDisplayState:(NSString *)state;
- (void)setInputState:(NSString *)state;
- (void)setAudioState:(NSString *)state;
- (void)setLatestError:(nullable NSString *)error;
- (void)recordMemoryWarning;
- (NSString *)formattedSummary;
@end
NS_ASSUME_NONNULL_END

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface R360PortalValidationResult : NSObject

@property(nonatomic, assign, readonly, getter=isValid) BOOL valid;
@property(nonatomic, assign, readonly) NSUInteger vpkCount;
@property(nonatomic, copy, readonly) NSString *detail;
@property(nonatomic, copy, readonly, nullable) NSString *errorReason;

- (instancetype)initWithValid:(BOOL)valid
                     vpkCount:(NSUInteger)vpkCount
                       detail:(NSString *)detail
                  errorReason:(nullable NSString *)errorReason NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@end

@interface R360PortalValidator : NSObject
+ (R360PortalValidationResult *)validateCandidateRootURL:(NSURL *)rootURL;
@end

NS_ASSUME_NONNULL_END

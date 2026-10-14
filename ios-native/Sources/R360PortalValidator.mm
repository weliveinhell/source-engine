#import "R360PortalValidator.h"

@implementation R360PortalValidationResult

- (instancetype)initWithValid:(BOOL)valid
                     vpkCount:(NSUInteger)vpkCount
                       detail:(NSString *)detail
                  errorReason:(NSString * _Nullable)errorReason {
    self = [super init];
    if (self) {
        _valid = valid;
        _vpkCount = vpkCount;
        _detail = [detail copy];
        _errorReason = [errorReason copy];
    }
    return self;
}

@end

@implementation R360PortalValidator

+ (R360PortalValidationResult *)validateCandidateRootURL:(NSURL *)rootURL {
    BOOL scoped = [rootURL startAccessingSecurityScopedResource];
    @try {
        NSFileManager *fm = NSFileManager.defaultManager;
        NSURL *gameInfoURL = [rootURL URLByAppendingPathComponent:@"portal/gameinfo.txt" isDirectory:NO];
        NSURL *portalURL = [rootURL URLByAppendingPathComponent:@"portal" isDirectory:YES];
        NSURL *hl2URL = [rootURL URLByAppendingPathComponent:@"hl2" isDirectory:YES];
        NSURL *platformURL = [rootURL URLByAppendingPathComponent:@"platform" isDirectory:YES];

        BOOL rootIsDirectory = NO;
        if (![fm fileExistsAtPath:rootURL.path isDirectory:&rootIsDirectory] || !rootIsDirectory) {
            return [[R360PortalValidationResult alloc] initWithValid:NO
                                                           vpkCount:0
                                                             detail:@"The selected item is not an accessible directory."
                                                        errorReason:@"candidate root is not an accessible directory"];
        }

        BOOL gameInfoIsDirectory = NO;
        BOOL portalIsDirectory = NO;
        BOOL hl2IsDirectory = NO;
        BOOL platformIsDirectory = NO;
        BOOL hasGameInfo = [fm fileExistsAtPath:gameInfoURL.path isDirectory:&gameInfoIsDirectory] && !gameInfoIsDirectory;
        BOOL hasPortal = [fm fileExistsAtPath:portalURL.path isDirectory:&portalIsDirectory] && portalIsDirectory;
        BOOL hasHL2 = [fm fileExistsAtPath:hl2URL.path isDirectory:&hl2IsDirectory] && hl2IsDirectory;
        BOOL hasPlatform = [fm fileExistsAtPath:platformURL.path isDirectory:&platformIsDirectory] && platformIsDirectory;

        NSUInteger vpkCount = 0;
        NSError *enumerationError = nil;
        if (hasPortal) {
            NSArray<NSURL *> *portalEntries = [fm contentsOfDirectoryAtURL:portalURL
                                                includingPropertiesForKeys:@[NSURLIsRegularFileKey]
                                                                   options:NSDirectoryEnumerationSkipsHiddenFiles
                                                                     error:&enumerationError];
            if (portalEntries) {
                for (NSURL *entry in portalEntries) {
                    if ([entry.pathExtension.lowercaseString isEqualToString:@"vpk"]) {
                        ++vpkCount;
                    }
                }
            }
        }

        if (enumerationError) {
            NSString *reason = [NSString stringWithFormat:@"portal directory read failed: %@", enumerationError.localizedDescription];
            return [[R360PortalValidationResult alloc] initWithValid:NO
                                                           vpkCount:0
                                                             detail:@"The portal/ directory exists but could not be enumerated. Check Files/provider access and try again."
                                                        errorReason:reason];
        }

        BOOL valid = hasGameInfo && hasPortal && hasHL2 && hasPlatform && vpkCount > 0;
        if (valid) {
            NSString *detail = [NSString stringWithFormat:
                @"Found portal/gameinfo.txt, portal/, hl2/, platform/, and %lu top-level VPK file%@. Access is temporary in N0; persistence/import remains an N4 task.",
                (unsigned long)vpkCount,
                vpkCount == 1 ? @"" : @"s"];
            return [[R360PortalValidationResult alloc] initWithValid:YES
                                                           vpkCount:vpkCount
                                                             detail:detail
                                                        errorReason:nil];
        }

        NSString *detail = [NSString stringWithFormat:
            @"Need a Portal root containing portal/gameinfo.txt, portal/, hl2/, platform/, and at least one VPK directly under portal/. Results: gameinfo=%@ portal=%@ hl2=%@ platform=%@ vpks=%lu",
            hasGameInfo ? @"yes" : @"no",
            hasPortal ? @"yes" : @"no",
            hasHL2 ? @"yes" : @"no",
            hasPlatform ? @"yes" : @"no",
            (unsigned long)vpkCount];
        return [[R360PortalValidationResult alloc] initWithValid:NO
                                                       vpkCount:vpkCount
                                                         detail:detail
                                                    errorReason:@"candidate root is incomplete"];
    } @finally {
        if (scoped) {
            [rootURL stopAccessingSecurityScopedResource];
        }
    }
}

@end

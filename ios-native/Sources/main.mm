#import <UIKit/UIKit.h>
#import "R360BootstrapViewController.h"
#import "R360Diagnostics.h"
#import "R360LifecycleService.h"

@interface R360AppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation R360AppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    (void)application; (void)launchOptions;
    [R360LifecycleService.sharedService startObserving];
    self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    self.window.rootViewController=[[R360BootstrapViewController alloc] init];
    [self.window makeKeyAndVisible];
    return YES;
}
- (void)applicationWillTerminate:(UIApplication *)application { (void)application; [R360Diagnostics.sharedDiagnostics setCheckpoint:@"application-will-terminate"]; }
@end
int main(int argc,char *argv[]){ @autoreleasepool { [R360Diagnostics.sharedDiagnostics setCheckpoint:@"bootstrap-enter"]; return UIApplicationMain(argc,argv,nil,NSStringFromClass(R360AppDelegate.class)); } }

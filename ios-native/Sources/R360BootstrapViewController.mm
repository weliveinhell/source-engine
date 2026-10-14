#import "R360BootstrapViewController.h"
#import "R360Diagnostics.h"
#import "R360PortalValidator.h"
#import "R360SDLHost.h"
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static UIColor *R360Background(void){return [UIColor colorWithRed:0.035 green:0.043 blue:0.055 alpha:1];}
static UIColor *R360Panel(void){return [UIColor colorWithRed:0.075 green:0.086 blue:0.105 alpha:1];}
@interface R360BootstrapViewController () <UIDocumentPickerDelegate>
@property(nonatomic,strong) UILabel *statusLabel; @property(nonatomic,strong) UILabel *detailLabel; @property(nonatomic,strong) UILabel *diagnosticsLabel;
@end
@implementation R360BootstrapViewController
- (void)viewDidLoad {
 [super viewDidLoad]; self.view.backgroundColor=R360Background();
 UIScrollView *scroll=[UIScrollView new]; scroll.translatesAutoresizingMaskIntoConstraints=NO; scroll.alwaysBounceVertical=YES;
 UIStackView *stack=[UIStackView new]; stack.translatesAutoresizingMaskIntoConstraints=NO; stack.axis=UILayoutConstraintAxisVertical; stack.spacing=12;
 UILabel *title=[UILabel new]; title.text=@"Render360 Portal"; title.textColor=UIColor.whiteColor; title.font=[UIFont systemFontOfSize:32 weight:UIFontWeightBold];
 UILabel *sub=[UILabel new]; sub.text=@"Native iOS N1 • SDL2 host • GLES3 bring-up"; sub.textColor=[UIColor colorWithWhite:.72 alpha:1]; sub.font=[UIFont monospacedSystemFontOfSize:14 weight:UIFontWeightRegular];
 UIView *panel=[UIView new]; panel.translatesAutoresizingMaskIntoConstraints=NO; panel.backgroundColor=R360Panel(); panel.layer.cornerRadius=16;
 UIStackView *ps=[UIStackView new]; ps.translatesAutoresizingMaskIntoConstraints=NO; ps.axis=UILayoutConstraintAxisVertical; ps.spacing=10;
 UILabel *status=[UILabel new]; status.numberOfLines=0; status.text=@"Portal data is not configured."; status.textColor=UIColor.whiteColor; status.font=[UIFont systemFontOfSize:20 weight:UIFontWeightSemibold]; self.statusLabel=status;
 UILabel *detail=[UILabel new]; detail.numberOfLines=0; detail.text=@"Folder validation remains optional setup. Start the N1 host to test SDL2/GLES3/input/audio; no Portal files are required."; detail.textColor=[UIColor colorWithWhite:.78 alpha:1]; detail.font=[UIFont systemFontOfSize:15]; self.detailLabel=detail;
 UIButtonConfiguration *startCfg=[UIButtonConfiguration filledButtonConfiguration]; startCfg.title=@"Start N1 SDL Host"; startCfg.contentInsets=NSDirectionalEdgeInsetsMake(12,18,12,18); UIButton *start=[UIButton buttonWithConfiguration:startCfg primaryAction:nil]; [start addTarget:self action:@selector(startSDL:) forControlEvents:UIControlEventTouchUpInside];
 UIButtonConfiguration *importCfg=[UIButtonConfiguration borderedButtonConfiguration]; importCfg.title=@"Choose Portal Folder"; importCfg.contentInsets=NSDirectionalEdgeInsetsMake(10,18,10,18); UIButton *import=[UIButton buttonWithConfiguration:importCfg primaryAction:nil]; [import addTarget:self action:@selector(importPortalFolder:) forControlEvents:UIControlEventTouchUpInside];
 UILabel *dh=[UILabel new]; dh.text=@"Latest native diagnostics"; dh.textColor=UIColor.whiteColor; dh.font=[UIFont systemFontOfSize:16 weight:UIFontWeightSemibold];
 UILabel *diag=[UILabel new]; diag.numberOfLines=0; diag.textColor=[UIColor colorWithWhite:.66 alpha:1]; diag.font=[UIFont monospacedSystemFontOfSize:12 weight:UIFontWeightRegular]; self.diagnosticsLabel=diag;
 [self.view addSubview:scroll]; [scroll addSubview:stack]; [stack addArrangedSubview:title]; [stack addArrangedSubview:sub]; [stack addArrangedSubview:panel]; [panel addSubview:ps]; [ps addArrangedSubview:status]; [ps addArrangedSubview:detail]; [ps addArrangedSubview:start]; [ps addArrangedSubview:import]; [stack addArrangedSubview:dh]; [stack addArrangedSubview:diag];
 UILayoutGuide *safe=self.view.safeAreaLayoutGuide; [NSLayoutConstraint activateConstraints:@[[scroll.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor],[scroll.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor],[scroll.topAnchor constraintEqualToAnchor:safe.topAnchor],[scroll.bottomAnchor constraintEqualToAnchor:safe.bottomAnchor],[stack.leadingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.leadingAnchor constant:24],[stack.trailingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.trailingAnchor constant:-24],[stack.topAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.topAnchor constant:18],[stack.bottomAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.bottomAnchor constant:-18],[stack.widthAnchor constraintEqualToAnchor:scroll.frameLayoutGuide.widthAnchor constant:-48],[ps.leadingAnchor constraintEqualToAnchor:panel.leadingAnchor constant:18],[ps.trailingAnchor constraintEqualToAnchor:panel.trailingAnchor constant:-18],[ps.topAnchor constraintEqualToAnchor:panel.topAnchor constant:16],[ps.bottomAnchor constraintEqualToAnchor:panel.bottomAnchor constant:-16]]];
 [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(diagnosticsDidChange:) name:R360DiagnosticsDidChangeNotification object:R360Diagnostics.sharedDiagnostics];
 R360Diagnostics *d=R360Diagnostics.sharedDiagnostics; [d setCheckpoint:@"ui-ready"]; [d setGameDataState:@"not configured"]; [d setLatestError:nil]; [d setCheckpoint:@"game-data-not-configured"]; [self refreshDiagnostics];
}
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; }
- (void)diagnosticsDidChange:(NSNotification *)n { (void)n; [self refreshDiagnostics]; }
- (void)refreshDiagnostics { if(self.isViewLoaded) self.diagnosticsLabel.text=R360Diagnostics.sharedDiagnostics.formattedSummary; }
- (void)startSDL:(id)sender { (void)sender; NSString *error=nil; if(![R360SDLHost.sharedHost start:&error]){ self.statusLabel.text=@"N1 SDL host failed to start."; self.detailLabel.text=error?:@"Unknown SDL error"; [R360Diagnostics.sharedDiagnostics setLatestError:error]; } else { self.statusLabel.text=@"N1 SDL host started."; self.detailLabel.text=@"SDL now owns the game-facing window. The animated clear is diagnostic only, not Portal rendering."; } }
- (void)importPortalFolder:(id)sender { (void)sender; R360Diagnostics *d=R360Diagnostics.sharedDiagnostics; [d setLatestError:nil]; [d setCheckpoint:@"import-picker-open"]; UIDocumentPickerViewController *p=[[UIDocumentPickerViewController alloc] initForOpeningContentTypes:@[UTTypeFolder] asCopy:NO]; p.delegate=self; p.allowsMultipleSelection=NO; [self presentViewController:p animated:YES completion:nil]; }
- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller { (void)controller; [R360Diagnostics.sharedDiagnostics setCheckpoint:@"import-picker-cancelled"]; }
- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls { (void)controller; NSURL *root=urls.firstObject; R360Diagnostics *d=R360Diagnostics.sharedDiagnostics; if(!root){[d setLatestError:@"document picker returned no URL"];[d setCheckpoint:@"candidate-root-invalid"];return;} [d setCheckpoint:@"candidate-root-validating"]; [d setGameDataState:@"validating selected root"]; R360PortalValidationResult *r=[R360PortalValidator validateCandidateRootURL:root]; if(r.isValid){self.statusLabel.text=@"Portal folder verified for N1 setup.";self.detailLabel.text=r.detail;[d setGameDataState:@"candidate root valid (temporary access only)"];[d setLatestError:nil];[d setCheckpoint:@"candidate-root-valid"];}else{self.statusLabel.text=@"That folder is not a complete Portal root.";self.detailLabel.text=r.detail;[d setGameDataState:@"candidate root invalid"];[d setLatestError:r.errorReason?:@"Portal root validation failed"];[d setCheckpoint:@"candidate-root-invalid"];}}
- (UIInterfaceOrientationMask)supportedInterfaceOrientations{return UIInterfaceOrientationMaskLandscape;}
- (BOOL)prefersStatusBarHidden{return YES;}
@end

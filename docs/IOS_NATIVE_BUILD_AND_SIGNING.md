# Render360 Portal Native iOS — Build, IPA, and Signing Guide

## What the repository builds now

`render360/ios-native` contains an N0 native arm64 iPhone bootstrap and two GitHub Actions workflows.

- `.github/workflows/ios-native.yml` builds an unsigned arm64 `.app`, packages it as `Render360-Portal-iOS-unsigned.ipa`, and uploads it as an artifact.
- `.github/workflows/ios-native-signed.yml` is manual-only and builds a signed IPA when Apple signing material is configured.

The N0 IPA proves the native toolchain/app packaging path. It is **not yet a playable Portal build**. Gameplay is enabled incrementally by N1–N14 in the master roadmap.

## Why no new fork is required

The existing repository already contains the Source code and Git submodules required by this port. A dedicated development branch is sufficient and keeps the web experiments available for reference without splitting history.

Always checkout with submodules:

```bash
git clone --recursive https://github.com/matthewcodergamer/source-engine-render360.git
cd source-engine-render360
git switch render360/ios-native
git submodule update --init --recursive
```

## Unsigned IPA workflow

Trigger automatically by pushing native files to `render360/ios-native`, or manually from Actions → **iOS Native Bootstrap IPA** → Run workflow.

The job:

1. checks out repository + submodules;
2. verifies no obvious retail Portal assets exist under `ios-native/`;
3. generates an Xcode iOS project with CMake;
4. builds Release/iphoneos/arm64 with code signing disabled;
5. validates the output binary is arm64;
6. places the `.app` in `Payload/`;
7. zips it into an IPA;
8. uploads the IPA as a GitHub Actions artifact.

Unsigned IPAs cannot simply be tapped and installed on a normal iPhone. They must be signed for the device by an Apple-compatible signing route before installation.

## Signed workflow inputs

The signed workflow follows the standard temporary-keychain pattern on a GitHub-hosted macOS runner.

Configure GitHub **Secrets**:

- `BUILD_CERTIFICATE_BASE64`: Base64 of the `.p12` certificate.
- `P12_PASSWORD`: password for that `.p12`.
- `BUILD_PROVISION_PROFILE_BASE64`: Base64 of the `.mobileprovision` file.
- `KEYCHAIN_PASSWORD`: random password used only for the temporary CI keychain.

Configure GitHub **Variables**:

- `IOS_TEAM_ID`: Apple Developer team identifier.
- `IOS_BUNDLE_ID`: bundle identifier covered by the provisioning profile, for example `com.example.render360portal`.
- optional `IOS_SIGNING_IDENTITY`: defaults to `Apple Development` when unset.

Then run Actions → **iOS Native Signed IPA** manually.

The runner imports the certificate into a temporary keychain, installs the provisioning profile, builds with manual signing, verifies the signature, packages the signed `.app` into an IPA, uploads the artifact, and deletes signing material during cleanup.

## Creating Base64 secrets on macOS

Certificate:

```bash
base64 -i Render360Development.p12 | pbcopy
```

Provisioning profile:

```bash
base64 -i Render360.mobileprovision | pbcopy
```

Paste the resulting text into the corresponding GitHub Secret. Never commit either file to the repository.

## Local unsigned build

Requires macOS + Xcode + CMake.

```bash
cmake -S ios-native -B build/ios -G Xcode \
  -DCMAKE_SYSTEM_NAME=iOS \
  -DCMAKE_OSX_SYSROOT=iphoneos \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 \
  -DRENDER360_BUNDLE_ID=com.render360.portal

xcodebuild \
  -project build/ios/Render360PortalIOS.xcodeproj \
  -scheme Render360Portal \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  ARCHS=arm64 \
  build
```

## Retail Portal data boundary

Do not place the following in Git history, Actions artifacts, or the IPA:

- `.vpk`
- `.bsp`
- retail `.vtf`, `.vmt`, `.vcs`, models, sounds or voice assets
- Valve retail binaries
- a copied Portal installation

The app imports/authorizes files supplied by the user on-device. Synthetic fixtures are allowed for automated tests.

## Artifact naming as the port progresses

Recommended artifact convention:

```text
Render360-Portal-iOS-N0-bootstrap-unsigned.ipa
Render360-Portal-iOS-N1-sdl-unsigned.ipa
...
Render360-Portal-iOS-N8-chamber00-unsigned.ipa
Render360-Portal-iOS-signed.ipa
```

The current workflow keeps the stable name `Render360-Portal-iOS-unsigned.ipa` inside the artifact and includes the Actions run number in the artifact container name.

## When an IPA counts as "Portal"

An IPA is not called playable merely because it installs. The minimum playable gate is:

- native arm64 executable;
- Source main loop active;
- user's Portal data imported/authorized;
- real `background1` rendering;
- real `testchmb_a_00` loading;
- movement/look/use/portal input;
- audio;
- current-map-only transition/unload behavior.

Until then, artifacts should be labeled with their native phase/milestone.

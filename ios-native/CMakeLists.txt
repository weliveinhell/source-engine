cmake_minimum_required(VERSION 3.25)
project(Render360PortalIOS VERSION 0.3.0 LANGUAGES C CXX OBJC OBJCXX)

if(NOT IOS)
  message(FATAL_ERROR "Render360PortalIOS must be configured with -DCMAKE_SYSTEM_NAME=iOS")
endif()

string(TOLOWER "${CMAKE_OSX_SYSROOT}" RENDER360_SYSROOT_LOWER)
if(RENDER360_SYSROOT_LOWER MATCHES "iphonesimulator")
  message(FATAL_ERROR "Native target requires physical iPhoneOS, not the simulator")
endif()

if(NOT CMAKE_OSX_ARCHITECTURES)
  set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "Native iPhone architecture" FORCE)
elseif(NOT CMAKE_OSX_ARCHITECTURES STREQUAL "arm64")
  message(FATAL_ERROR "Render360 native iOS requires exactly arm64; got '${CMAKE_OSX_ARCHITECTURES}'")
endif()

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(RENDER360_BUNDLE_ID "com.render360.portal" CACHE STRING "iOS bundle identifier")
set(RENDER360_DEPLOYMENT_TARGET "15.0" CACHE STRING "Minimum iOS deployment target")
set(RENDER360_BUILD_IDENTIFIER "local" CACHE STRING "Build/commit identifier")
set(RENDER360_BUILD_NUMBER "1" CACHE STRING "CFBundleVersion")

if(CMAKE_OSX_DEPLOYMENT_TARGET AND NOT CMAKE_OSX_DEPLOYMENT_TARGET STREQUAL RENDER360_DEPLOYMENT_TARGET)
  message(FATAL_ERROR
    "CMAKE_OSX_DEPLOYMENT_TARGET (${CMAKE_OSX_DEPLOYMENT_TARGET}) must match RENDER360_DEPLOYMENT_TARGET (${RENDER360_DEPLOYMENT_TARGET})")
endif()

include(cmake/SDL2Pinned.cmake)
include(cmake/SourceFoundation.cmake)

add_executable(Render360Portal MACOSX_BUNDLE
  Sources/main.mm
  Sources/R360BootstrapViewController.h
  Sources/R360BootstrapViewController.mm
  Sources/R360Diagnostics.h
  Sources/R360Diagnostics.mm
  Sources/R360PortalValidator.h
  Sources/R360PortalValidator.mm
  Sources/R360RendererBackend.h
  Sources/R360GLESRendererBackend.h
  Sources/R360GLESRendererBackend.mm
  Sources/R360SDLAudioHost.h
  Sources/R360SDLAudioHost.mm
  Sources/R360SDLInputDiagnostics.h
  Sources/R360SDLInputDiagnostics.mm
  Sources/R360LifecycleService.h
  Sources/R360LifecycleService.mm
  Sources/R360SDLHost.h
  Sources/R360SDLHost.mm
)

add_dependencies(Render360Portal r360_source_foundation)

target_compile_definitions(Render360Portal PRIVATE
  RENDER360_IOS_NATIVE=1
  RENDER360_PORTAL_NATIVE_BOOTSTRAP=1
  RENDER360_N1_SDL_HOST=1
  RENDER360_N2_SOURCE_FOUNDATION=1
  SDL_MAIN_HANDLED=1
  RENDER360_BUILD_IDENTIFIER="${RENDER360_BUILD_IDENTIFIER}"
)

target_link_libraries(Render360Portal PRIVATE
  SDL2::SDL2-static
  "-framework UIKit"
  "-framework Foundation"
  "-framework UniformTypeIdentifiers"
  "-framework QuartzCore"
  "-framework OpenGLES"
  "-framework GameController"
  "-framework AVFoundation"
)

set_target_properties(Render360Portal PROPERTIES
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist"
  XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${RENDER360_BUNDLE_ID}"
  XCODE_ATTRIBUTE_IPHONEOS_DEPLOYMENT_TARGET "${RENDER360_DEPLOYMENT_TARGET}"
  XCODE_ATTRIBUTE_MARKETING_VERSION "${PROJECT_VERSION}"
  XCODE_ATTRIBUTE_CURRENT_PROJECT_VERSION "${RENDER360_BUILD_NUMBER}"
  XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "1"
  XCODE_ATTRIBUTE_ONLY_ACTIVE_ARCH "NO"
  XCODE_ATTRIBUTE_ARCHS "arm64"
  XCODE_ATTRIBUTE_ENABLE_BITCODE "NO"
  XCODE_ATTRIBUTE_CLANG_ENABLE_OBJC_ARC "YES"
  XCODE_ATTRIBUTE_SUPPORTED_PLATFORMS "iphoneos"
  XCODE_ATTRIBUTE_SUPPORTS_MACCATALYST "NO"
  XCODE_ATTRIBUTE_SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD "NO"
  XCODE_ATTRIBUTE_SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD "NO"
  XCODE_ATTRIBUTE_GENERATE_INFOPLIST_FILE "NO"
  XCODE_ATTRIBUTE_INFOPLIST_FILE "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist"
)

message(STATUS
  "Render360 iOS N2 target: sdk=${CMAKE_OSX_SYSROOT} arch=${CMAKE_OSX_ARCHITECTURES} deployment=${RENDER360_DEPLOYMENT_TARGET} bundle=${RENDER360_BUNDLE_ID}")

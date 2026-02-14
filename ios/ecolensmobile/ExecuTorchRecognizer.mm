#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>
#import "ETExecuTorchAdapter.h"

#include <array>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <dlfcn.h>
#include <memory>
#include <vector>

static NSString *const ETErrorBadPayload = @"E_BAD_PAYLOAD";
static NSString *const ETErrorBadImage = @"E_BAD_IMAGE";
static NSString *const ETErrorRuntime = @"E_RUNTIME";

static NSString *const ETBridgeCreateSymbol = @"et_ecolens_create_model";
static NSString *const ETBridgeRunSymbol = @"et_ecolens_run_inference";
static NSString *const ETBridgeDestroySymbol = @"et_ecolens_destroy_model";
static NSString *const ETBridgeFreeCStringSymbol = @"et_ecolens_free_cstring";

static NSError *ETMakeError(NSInteger code, NSString *message)
{
  return [NSError errorWithDomain:@"ExecuTorchRecognizer"
                             code:code
                         userInfo:@{NSLocalizedDescriptionKey: message ?: @"Unknown error."}];
}

static NSString *ETStringOrEmpty(id value)
{
  return [value isKindOfClass:[NSString class]] ? (NSString *)value : @"";
}

static NSNumber *ETNumberOrNil(id value)
{
  return [value isKindOfClass:[NSNumber class]] ? (NSNumber *)value : nil;
}

static NSDictionary *ETDictionaryOrEmpty(id value)
{
  return [value isKindOfClass:[NSDictionary class]] ? (NSDictionary *)value : @{};
}

static NSArray *ETArrayOrEmpty(id value)
{
  return [value isKindOfClass:[NSArray class]] ? (NSArray *)value : @[];
}

static NSString *ETResolveExistingPath(NSString *candidate)
{
  if (candidate.length == 0) {
    return nil;
  }
  return [[NSFileManager defaultManager] fileExistsAtPath:candidate] ? candidate : nil;
}

static NSNumber *ETNumberFromUnknown(id value)
{
  if ([value isKindOfClass:[NSNumber class]]) {
    return (NSNumber *)value;
  }
  if ([value isKindOfClass:[NSString class]]) {
    NSString *stringValue = [(NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (stringValue.length == 0) {
      return nil;
    }
    NSNumberFormatter *formatter = [NSNumberFormatter new];
    formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    return [formatter numberFromString:stringValue];
  }
  return nil;
}

static NSString *ETFirstString(NSDictionary *dict, NSArray<NSString *> *keys, NSString *fallback)
{
  for (NSString *key in keys) {
    NSString *candidate = ETStringOrEmpty(dict[key]);
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return fallback;
}

static NSNumber *ETFirstNumber(NSDictionary *dict, NSArray<NSString *> *keys, NSNumber *fallback)
{
  for (NSString *key in keys) {
    NSNumber *candidate = ETNumberFromUnknown(dict[key]);
    if (candidate != nil) {
      return candidate;
    }
  }
  return fallback;
}

static NSString *ETNormalizePredictionName(NSString *value)
{
  NSString *trimmed = [value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (trimmed.length == 0) {
    return @"";
  }
  NSMutableString *mutableText = [trimmed mutableCopy];
  [mutableText replaceOccurrencesOfString:@"_" withString:@" " options:0 range:NSMakeRange(0, mutableText.length)];
  [mutableText replaceOccurrencesOfString:@"-" withString:@" " options:0 range:NSMakeRange(0, mutableText.length)];
  while ([mutableText containsString:@"  "]) {
    [mutableText replaceOccurrencesOfString:@"  " withString:@" " options:0 range:NSMakeRange(0, mutableText.length)];
  }
  return [mutableText copy];
}

static NSArray<NSDictionary *> *ETNormalizeTopPredictions(id rawValue)
{
  NSArray *rawPredictions = ETArrayOrEmpty(rawValue);
  if (rawPredictions.count == 0) {
    return @[];
  }

  NSMutableArray<NSDictionary *> *normalized = [NSMutableArray arrayWithCapacity:rawPredictions.count];
  NSMutableSet<NSString *> *seen = [NSMutableSet set];

  for (id rawEntry in rawPredictions) {
    NSDictionary *entry = ETDictionaryOrEmpty(rawEntry);
    if (entry.count == 0) {
      continue;
    }

    NSString *name = ETNormalizePredictionName(
      ETFirstString(entry, @[ @"name", @"label", @"class", @"item" ], @"")
    );
    NSNumber *index = ETFirstNumber(entry, @[ @"index", @"id" ], nil);
    NSNumber *probability = ETFirstNumber(entry, @[ @"probability", @"confidence", @"score" ], nil);

    if (name.length == 0 && index == nil) {
      continue;
    }

    NSString *dedupeKey = name.length > 0
      ? [name lowercaseString]
      : [NSString stringWithFormat:@"#%@", index ?: @(-1)];
    if ([seen containsObject:dedupeKey]) {
      continue;
    }
    [seen addObject:dedupeKey];

    NSMutableDictionary *normalizedEntry = [NSMutableDictionary dictionary];
    if (name.length > 0) {
      normalizedEntry[@"name"] = name;
    }
    if (index != nil) {
      normalizedEntry[@"index"] = index;
    }
    if (probability != nil) {
      normalizedEntry[@"probability"] = probability;
    }
    [normalized addObject:normalizedEntry];
  }

  return normalized;
}

struct ETInputConfig {
  int32_t width = 224;
  int32_t height = 224;
  bool normalize = true;
  std::array<float, 3> mean = {0.485f, 0.456f, 0.406f};
  std::array<float, 3> std = {0.229f, 0.224f, 0.225f};
};

struct ETPreprocessedTensor {
  std::vector<float> chw;
  int32_t width = 0;
  int32_t height = 0;
  int32_t channels = 3;
  size_t sourceBytes = 0;
};

class ETImageTensorPreprocessor {
public:
  static bool preprocess(UIImage *image,
                         const ETInputConfig &config,
                         ETPreprocessedTensor &output,
                         NSError **error)
  {
    if (!image || !image.CGImage) {
      if (error != nullptr) {
        *error = ETMakeError(2001, @"Input image is missing or invalid.");
      }
      return false;
    }

    const int32_t width = std::max(config.width, 1);
    const int32_t height = std::max(config.height, 1);

    std::vector<uint8_t> rgba(static_cast<size_t>(width) * static_cast<size_t>(height) * 4);
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    const CGBitmapInfo bitmapInfo = kCGBitmapByteOrder32Big | static_cast<CGBitmapInfo>(kCGImageAlphaPremultipliedLast);
    CGContextRef context = CGBitmapContextCreate(
      rgba.data(),
      width,
      height,
      8,
      width * 4,
      colorSpace,
      bitmapInfo);
    CGColorSpaceRelease(colorSpace);

    if (!context) {
      if (error != nullptr) {
        *error = ETMakeError(2002, @"Failed to create image preprocessing context.");
      }
      return false;
    }

    CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), image.CGImage);
    CGContextRelease(context);

    ETPreprocessedTensor tensor;
    tensor.width = width;
    tensor.height = height;
    tensor.channels = 3;
    tensor.chw.resize(static_cast<size_t>(width) * static_cast<size_t>(height) * 3);

    const size_t pixelCount = static_cast<size_t>(width) * static_cast<size_t>(height);
    for (size_t i = 0; i < pixelCount; i++) {
      const size_t rgbaBase = i * 4;
      float r = static_cast<float>(rgba[rgbaBase]) / 255.0f;
      float g = static_cast<float>(rgba[rgbaBase + 1]) / 255.0f;
      float b = static_cast<float>(rgba[rgbaBase + 2]) / 255.0f;

      if (config.normalize) {
        r = (r - config.mean[0]) / config.std[0];
        g = (g - config.mean[1]) / config.std[1];
        b = (b - config.mean[2]) / config.std[2];
      }

      tensor.chw[i] = r;
      tensor.chw[pixelCount + i] = g;
      tensor.chw[(2 * pixelCount) + i] = b;
    }

    output = std::move(tensor);
    return true;
  }
};

typedef void *(*ETCreateModelFn)(const char *model_path,
                                 const char *tokenizer_path,
                                 const char *preset,
                                 const char **error_message);
typedef const char *(*ETRunInferenceFn)(void *handle,
                                        const float *input,
                                        int64_t input_size,
                                        int32_t width,
                                        int32_t height,
                                        const char *label_hint,
                                        const char **error_message);
typedef void (*ETDestroyModelFn)(void *handle);
typedef void (*ETFreeCStringFn)(const char *ptr);

class ETExecuTorchRuntimeBridge {
public:
  ETExecuTorchRuntimeBridge()
  {
    // Prefer direct symbol addresses to keep adapter symbols linked into the final binary.
    createFn_ = &et_ecolens_create_model;
    runFn_ = &et_ecolens_run_inference;
    destroyFn_ = &et_ecolens_destroy_model;
    freeCStringFn_ = &et_ecolens_free_cstring;

    // Fallback to dlsym to support swapping adapter implementation from an external binary.
    if (createFn_ == nullptr) {
      createFn_ = reinterpret_cast<ETCreateModelFn>(dlsym(RTLD_DEFAULT, ETBridgeCreateSymbol.UTF8String));
    }
    if (runFn_ == nullptr) {
      runFn_ = reinterpret_cast<ETRunInferenceFn>(dlsym(RTLD_DEFAULT, ETBridgeRunSymbol.UTF8String));
    }
    if (destroyFn_ == nullptr) {
      destroyFn_ = reinterpret_cast<ETDestroyModelFn>(dlsym(RTLD_DEFAULT, ETBridgeDestroySymbol.UTF8String));
    }
    if (freeCStringFn_ == nullptr) {
      freeCStringFn_ = reinterpret_cast<ETFreeCStringFn>(dlsym(RTLD_DEFAULT, ETBridgeFreeCStringSymbol.UTF8String));
    }
  }

  ~ETExecuTorchRuntimeBridge()
  {
    unload();
  }

  bool isLinked() const
  {
    return createFn_ != nullptr && runFn_ != nullptr && destroyFn_ != nullptr;
  }

  bool loadModel(NSString *modelPath,
                 NSString *tokenizerPath,
                 NSString *preset,
                 NSString **errorMessage)
  {
    if (!isLinked()) {
      if (errorMessage != nullptr) {
        *errorMessage = @"ExecuTorch adapter symbols are not linked. Export C symbols et_ecolens_create_model, et_ecolens_run_inference, and et_ecolens_destroy_model.";
      }
      return false;
    }

    if (modelPath.length == 0) {
      if (errorMessage != nullptr) {
        *errorMessage = @"No model path provided. Supply runtimeConfig.modelPath or bundle a .pte model file.";
      }
      return false;
    }

    if (handle_ != nullptr &&
        [loadedModelPath_ isEqualToString:modelPath] &&
        [loadedTokenizerPath_ isEqualToString:(tokenizerPath ?: @"")] &&
        [loadedPreset_ isEqualToString:(preset ?: @"")]) {
      return true;
    }

    unload();

    const char *errorOut = nullptr;
    handle_ = createFn_(modelPath.UTF8String,
                        tokenizerPath.length > 0 ? tokenizerPath.UTF8String : nullptr,
                        preset.length > 0 ? preset.UTF8String : nullptr,
                        &errorOut);
    if (handle_ == nullptr) {
      if (errorMessage != nullptr) {
        if (errorOut != nullptr) {
          *errorMessage = [NSString stringWithUTF8String:errorOut];
        } else {
          *errorMessage = @"ExecuTorch model initialization failed.";
        }
      }
      if (errorOut != nullptr && freeCStringFn_ != nullptr) {
        freeCStringFn_(errorOut);
      }
      return false;
    }

    loadedModelPath_ = [modelPath copy];
    loadedTokenizerPath_ = [tokenizerPath copy] ?: @"";
    loadedPreset_ = [preset copy] ?: @"";
    return true;
  }

  NSDictionary *runInference(const ETPreprocessedTensor &tensor,
                             NSString *labelHint,
                             NSString **errorMessage)
  {
    if (!isLinked() || handle_ == nullptr) {
      if (errorMessage != nullptr) {
        *errorMessage = @"ExecuTorch runtime is not initialized.";
      }
      return nil;
    }

    const char *errorOut = nullptr;
    const char *json = runFn_(
      handle_,
      tensor.chw.data(),
      static_cast<int64_t>(tensor.chw.size()),
      tensor.width,
      tensor.height,
      labelHint.length > 0 ? labelHint.UTF8String : nullptr,
      &errorOut);

    if (json == nullptr) {
      if (errorMessage != nullptr) {
        if (errorOut != nullptr) {
          *errorMessage = [NSString stringWithUTF8String:errorOut];
        } else {
          *errorMessage = @"ExecuTorch inference returned empty output.";
        }
      }
      if (errorOut != nullptr && freeCStringFn_ != nullptr) {
        freeCStringFn_(errorOut);
      }
      return nil;
    }

    NSData *jsonData = [NSData dataWithBytes:json length:strlen(json)];
    NSError *jsonError = nil;
    id parsed = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&jsonError];

    if (freeCStringFn_ != nullptr) {
      freeCStringFn_(json);
    }
    if (errorOut != nullptr && freeCStringFn_ != nullptr) {
      freeCStringFn_(errorOut);
    }

    if (jsonError != nil || ![parsed isKindOfClass:[NSDictionary class]]) {
      if (errorMessage != nullptr) {
        *errorMessage = jsonError.localizedDescription ?: @"ExecuTorch output JSON parsing failed.";
      }
      return nil;
    }

    return (NSDictionary *)parsed;
  }

  NSString *loadedModelPath() const { return loadedModelPath_; }
  NSString *loadedTokenizerPath() const { return loadedTokenizerPath_; }
  NSString *loadedPreset() const { return loadedPreset_; }

private:
  void unload()
  {
    if (handle_ != nullptr && destroyFn_ != nullptr) {
      destroyFn_(handle_);
      handle_ = nullptr;
    }
  }

  ETCreateModelFn createFn_ = nullptr;
  ETRunInferenceFn runFn_ = nullptr;
  ETDestroyModelFn destroyFn_ = nullptr;
  ETFreeCStringFn freeCStringFn_ = nullptr;
  void *handle_ = nullptr;
  NSString *loadedModelPath_ = @"";
  NSString *loadedTokenizerPath_ = @"";
  NSString *loadedPreset_ = @"";
};

class ETOutputParser {
public:
  static NSDictionary *normalize(NSDictionary *raw,
                                 NSString *labelHint,
                                 NSNumber *confidenceHint,
                                 NSDictionary *runtime,
                                 NSDictionary *imageMetadata)
  {
    NSMutableDictionary *result = [NSMutableDictionary dictionary];

    NSString *name = ETFirstString(raw, @[ @"name", @"label", @"detected_label", @"item" ], labelHint.length > 0 ? labelHint : @"Detected Item");
    NSString *category = ETFirstString(raw, @[ @"category", @"class", @"item_type" ], @"unknown");
    NSNumber *ecoScore = ETFirstNumber(raw, @[ @"ecoScore", @"eco_score", @"score" ], @55);
    NSNumber *co2 = ETFirstNumber(raw, @[ @"co2Gram", @"co2_gram", @"co2" ], @95);
    NSNumber *confidence = ETFirstNumber(raw, @[ @"confidence", @"score_confidence" ], confidenceHint ?: @0.62);

    NSString *summary = ETFirstString(raw, @[ @"summary", @"suggestion", @"altRecommendation" ], @"Prefer reusable alternatives where possible.");
    NSString *explanation = ETFirstString(raw, @[ @"explanation", @"reasoning", @"analysis" ], @"Result generated by ExecuTorch runtime path.");
    NSString *title = ETFirstString(raw, @[ @"title" ], @"On-device inference");

    NSArray *rawFactors = ETArrayOrEmpty(raw[@"scoreFactors"]);
    NSArray *scoreFactors = rawFactors.count > 0
      ? rawFactors
      : @[
          @{ @"code": @"model_output", @"label": @"Model output", @"detail": @"Derived from ExecuTorch inference response.", @"delta": @0 }
        ];
    NSArray<NSDictionary *> *topPredictions = ETNormalizeTopPredictions(raw[@"topPredictions"]);

    result[@"title"] = title;
    result[@"name"] = name;
    result[@"category"] = category;
    result[@"ecoScore"] = ecoScore;
    result[@"co2Gram"] = co2;
    result[@"confidence"] = confidence;
    result[@"suggestion"] = summary;
    result[@"altRecommendation"] = summary;
    result[@"explanation"] = explanation;
    result[@"scoreFactors"] = scoreFactors;
    if (topPredictions.count > 0) {
      result[@"topPredictions"] = topPredictions;
    }

    NSMutableDictionary *runtimeOut = [runtime mutableCopy] ?: [NSMutableDictionary dictionary];
    if (imageMetadata.count > 0) {
      runtimeOut[@"image"] = imageMetadata;
    }
    result[@"runtime"] = runtimeOut;
    return result;
  }
};

@interface ExecuTorchPipeline : NSObject {
@private
  std::unique_ptr<ETExecuTorchRuntimeBridge> _runtimeBridge;
}
@property (nonatomic, strong) NSDate *lastWarmupAt;
@property (nonatomic, copy) NSString *activeModelPath;
@property (nonatomic, copy) NSString *activeTokenizerPath;
@property (nonatomic, copy) NSString *activeLabelsPath;
@property (nonatomic, copy) NSString *activePreset;
@property (nonatomic, assign) BOOL initialized;
@property (nonatomic, assign) ETInputConfig inputConfig;
- (BOOL)warmupWithConfig:(NSDictionary *)config error:(NSError **)error;
- (NSDictionary *)runWithPayload:(NSDictionary *)payload error:(NSError **)error;
@end

@implementation ExecuTorchPipeline

- (instancetype)init
{
  self = [super init];
  if (self) {
    _runtimeBridge = std::make_unique<ETExecuTorchRuntimeBridge>();
    _initialized = NO;
    _activePreset = @"balanced";
    _inputConfig = ETInputConfig();
  }
  return self;
}

- (NSString *)resolveBundleModelPath
{
  NSArray<NSArray<NSString *> *> *candidates = @[
    @[ @"gemma3_vision", @"pte" ],
    @[ @"qwen3", @"pte" ],
    @[ @"model", @"pte" ]
  ];
  for (NSArray<NSString *> *candidate in candidates) {
    NSString *path = [[NSBundle mainBundle] pathForResource:candidate[0] ofType:candidate[1]];
    if (path.length > 0) {
      return path;
    }
  }
  return nil;
}

- (NSString *)resolveBundleTokenizerPath
{
  NSArray<NSArray<NSString *> *> *candidates = @[
    @[ @"tokenizer", @"json" ],
    @[ @"tokenizer_config", @"json" ]
  ];
  for (NSArray<NSString *> *candidate in candidates) {
    NSString *path = [[NSBundle mainBundle] pathForResource:candidate[0] ofType:candidate[1]];
    if (path.length > 0) {
      return path;
    }
  }
  return nil;
}

- (NSString *)resolveBundleLabelsPath
{
  NSArray<NSArray<NSString *> *> *candidates = @[
    @[ @"labels", @"json" ],
    @[ @"classes", @"json" ],
    @[ @"label_map", @"json" ],
    @[ @"imagenet_labels", @"json" ]
  ];
  for (NSArray<NSString *> *candidate in candidates) {
    NSString *path = [[NSBundle mainBundle] pathForResource:candidate[0] ofType:candidate[1]];
    if (path.length > 0) {
      return path;
    }
  }
  return nil;
}

- (NSString *)resolveBundlePathFromRuntimeValue:(NSString *)runtimeValue defaultExtension:(NSString *)defaultExtension
{
  NSString *trimmed = [runtimeValue stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (trimmed.length == 0) {
    return nil;
  }

  // Absolute or app-sandbox file path.
  NSString *existing = ETResolveExistingPath(trimmed);
  if (existing.length > 0) {
    return existing;
  }

  // Bundle resource path (supports values like "model.pte" or "models/model.pte").
  NSString *directory = [trimmed stringByDeletingLastPathComponent];
  if ([directory isEqualToString:@"."] || [directory isEqualToString:@"/"] || directory.length == 0) {
    directory = nil;
  }

  NSString *leaf = [trimmed lastPathComponent];
  NSString *extension = [leaf pathExtension];
  NSString *resource = [leaf stringByDeletingPathExtension];

  if (extension.length == 0 && defaultExtension.length > 0) {
    extension = defaultExtension;
    resource = leaf;
  }
  if (resource.length == 0) {
    resource = leaf;
  }

  NSString *bundlePath = [[NSBundle mainBundle] pathForResource:resource
                                                         ofType:extension.length > 0 ? extension : nil
                                                    inDirectory:directory];
  return bundlePath.length > 0 ? bundlePath : nil;
}

- (void)updateInputConfigFromRuntime:(NSDictionary *)runtimeConfig
{
  NSNumber *requestedWidth = ETNumberFromUnknown(runtimeConfig[@"inputWidth"]);
  NSNumber *requestedHeight = ETNumberFromUnknown(runtimeConfig[@"inputHeight"]);
  NSNumber *requestedNormalize = ETNumberFromUnknown(runtimeConfig[@"normalize"]);

  ETInputConfig next = self.inputConfig;
  if (requestedWidth != nil) {
    next.width = std::max(1, requestedWidth.intValue);
  }
  if (requestedHeight != nil) {
    next.height = std::max(1, requestedHeight.intValue);
  }
  if (requestedNormalize != nil) {
    next.normalize = requestedNormalize.boolValue;
  }

  NSArray *meanValues = ETArrayOrEmpty(runtimeConfig[@"mean"]);
  NSArray *stdValues = ETArrayOrEmpty(runtimeConfig[@"std"]);
  if (meanValues.count == 3) {
    for (NSUInteger i = 0; i < 3; i++) {
      NSNumber *value = ETNumberFromUnknown(meanValues[i]);
      if (value != nil) {
        next.mean[i] = value.floatValue;
      }
    }
  }
  if (stdValues.count == 3) {
    for (NSUInteger i = 0; i < 3; i++) {
      NSNumber *value = ETNumberFromUnknown(stdValues[i]);
      if (value != nil && std::fabs(value.floatValue) > 1e-8f) {
        next.std[i] = value.floatValue;
      }
    }
  }

  self.inputConfig = next;
}

- (BOOL)warmupWithConfig:(NSDictionary *)config error:(NSError **)error
{
  NSDictionary *runtimeConfig = ETDictionaryOrEmpty(config);
  [self updateInputConfigFromRuntime:runtimeConfig];

  NSString *requestedModelPath = ETStringOrEmpty(runtimeConfig[@"modelPath"]);
  NSString *requestedTokenizerPath = ETStringOrEmpty(runtimeConfig[@"tokenizerPath"]);
  NSString *requestedLabelsPath = ETStringOrEmpty(runtimeConfig[@"labelsPath"]);
  NSString *requestedPreset = ETStringOrEmpty(runtimeConfig[@"preset"]);

  NSString *resolvedModelPath =
    [self resolveBundlePathFromRuntimeValue:requestedModelPath defaultExtension:@"pte"] ?: [self resolveBundleModelPath];
  NSString *resolvedTokenizerPath =
    [self resolveBundlePathFromRuntimeValue:requestedTokenizerPath defaultExtension:@"json"] ?: [self resolveBundleTokenizerPath];
  NSString *resolvedLabelsPath =
    [self resolveBundlePathFromRuntimeValue:requestedLabelsPath defaultExtension:@"json"] ?: [self resolveBundleLabelsPath];
  NSString *adapterMetadataPath = resolvedLabelsPath.length > 0 ? resolvedLabelsPath : (resolvedTokenizerPath ?: @"");
  NSString *resolvedPreset = requestedPreset.length > 0 ? requestedPreset : @"balanced";

  if (resolvedModelPath.length == 0) {
    if (error != nullptr) {
      *error = ETMakeError(3001, @"No .pte model found. Provide runtimeConfig.modelPath or bundle a model file.");
    }
    return false;
  }

  NSString *bridgeError = nil;
  if (!_runtimeBridge->loadModel(resolvedModelPath, adapterMetadataPath, resolvedPreset, &bridgeError)) {
    if (error != nullptr) {
      *error = ETMakeError(3002, bridgeError ?: @"Failed to load ExecuTorch model.");
    }
    return false;
  }

  self.activeModelPath = resolvedModelPath ?: @"";
  self.activeTokenizerPath = resolvedTokenizerPath ?: @"";
  self.activeLabelsPath = resolvedLabelsPath ?: @"";
  self.activePreset = resolvedPreset;
  self.lastWarmupAt = [NSDate date];
  self.initialized = YES;

  if (error != nullptr) {
    *error = nil;
  }
  return true;
}

- (UIImage *)decodeImageFromBase64:(NSString *)imageBase64 byteCount:(size_t *)byteCount error:(NSError **)error
{
  if (imageBase64.length == 0) {
    if (error != nullptr) {
      *error = ETMakeError(4001, @"imageBase64 is required for on-device inference.");
    }
    return nil;
  }

  NSData *imageData = [[NSData alloc] initWithBase64EncodedString:imageBase64
                                                           options:NSDataBase64DecodingIgnoreUnknownCharacters];
  if (imageData.length == 0) {
    if (error != nullptr) {
      *error = ETMakeError(4002, @"imageBase64 could not be decoded.");
    }
    return nil;
  }

  UIImage *image = [UIImage imageWithData:imageData];
  if (!image || !image.CGImage) {
    if (error != nullptr) {
      *error = ETMakeError(4003, @"Decoded bytes are not a valid image.");
    }
    return nil;
  }

  if (byteCount != nullptr) {
    *byteCount = imageData.length;
  }
  return image;
}

- (NSDictionary *)runWithPayload:(NSDictionary *)payload error:(NSError **)error
{
  if (!self.initialized) {
    if (![self warmupWithConfig:@{} error:error]) {
      return nil;
    }
  }

  NSString *labelHint = ETStringOrEmpty(payload[@"detectedLabel"]);
  NSNumber *confidenceHint = ETNumberOrNil(payload[@"confidence"]) ?: @0.62;
  NSString *imageBase64 = ETStringOrEmpty(payload[@"imageBase64"]);

  size_t sourceBytes = 0;
  NSError *decodeError = nil;
  UIImage *image = [self decodeImageFromBase64:imageBase64 byteCount:&sourceBytes error:&decodeError];
  if (!image) {
    if (error != nullptr) {
      *error = decodeError;
    }
    return nil;
  }

  ETPreprocessedTensor inputTensor;
  NSError *preprocessError = nil;
  if (!ETImageTensorPreprocessor::preprocess(image, self.inputConfig, inputTensor, &preprocessError)) {
    if (error != nullptr) {
      *error = preprocessError ?: ETMakeError(5001, @"Image preprocessing failed.");
    }
    return nil;
  }
  inputTensor.sourceBytes = sourceBytes;

  NSString *runErrorText = nil;
  NSDictionary *rawOutput = _runtimeBridge->runInference(inputTensor, labelHint, &runErrorText);
  if (rawOutput == nil) {
    if (error != nullptr) {
      *error = ETMakeError(5002, runErrorText ?: @"ExecuTorch inference failed.");
    }
    return nil;
  }

  NSDictionary *imageMetadata = @{
    @"sourceWidth": @(image.size.width),
    @"sourceHeight": @(image.size.height),
    @"sourceBytes": @(inputTensor.sourceBytes),
    @"tensorWidth": @(inputTensor.width),
    @"tensorHeight": @(inputTensor.height),
    @"tensorChannels": @(inputTensor.channels),
    @"tensorElementCount": @(inputTensor.chw.size())
  };

  NSDictionary *runtime = @{
    @"engine": @"on-device",
    @"source": @"executorch-c-abi",
    @"modelPath": self.activeModelPath ?: @"",
    @"tokenizerPath": self.activeTokenizerPath ?: @"",
    @"labelsPath": self.activeLabelsPath ?: @"",
    @"preset": self.activePreset ?: @"balanced",
    @"warmupAt": self.lastWarmupAt ? @([self.lastWarmupAt timeIntervalSince1970] * 1000.0) : @0
  };

  NSDictionary *normalized = ETOutputParser::normalize(rawOutput, labelHint, confidenceHint, runtime, imageMetadata);
  if (error != nullptr) {
    *error = nil;
  }
  return normalized;
}

@end

@interface ExecuTorchRecognizer : NSObject <RCTBridgeModule>
@property (nonatomic, strong) dispatch_queue_t workQueue;
@property (nonatomic, strong) ExecuTorchPipeline *pipeline;
@end

@implementation ExecuTorchRecognizer

RCT_EXPORT_MODULE(ExecuTorchRecognizer);

- (instancetype)init
{
  self = [super init];
  if (self) {
    _workQueue = dispatch_queue_create("com.adylagad.ecolens.executorch", DISPATCH_QUEUE_SERIAL);
    _pipeline = [ExecuTorchPipeline new];
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return _workQueue;
}

RCT_REMAP_METHOD(
  warmup,
  warmup:(NSDictionary *)config
  warmupResolver:(RCTPromiseResolveBlock)resolve
  warmupRejecter:(RCTPromiseRejectBlock)reject
)
{
  NSError *error = nil;
  BOOL ok = [self.pipeline warmupWithConfig:ETDictionaryOrEmpty(config) error:&error];
  if (!ok || error != nil) {
    reject(ETErrorRuntime, error.localizedDescription ?: @"Failed to warm up pipeline.", error);
    return;
  }
  resolve(@{
    @"ok": @YES,
    @"modelPath": self.pipeline.activeModelPath ?: @"",
    @"tokenizerPath": self.pipeline.activeTokenizerPath ?: @"",
    @"labelsPath": self.pipeline.activeLabelsPath ?: @"",
    @"preset": self.pipeline.activePreset ?: @"balanced"
  });
}

RCT_REMAP_METHOD(
  detectAndSummarize,
  detectAndSummarize:(NSDictionary *)payload
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  if (![payload isKindOfClass:[NSDictionary class]]) {
    reject(ETErrorBadPayload, @"Payload must be an object.", nil);
    return;
  }

  NSDictionary *runtimeConfig = ETDictionaryOrEmpty(payload[@"runtimeConfig"]);
  NSError *warmupError = nil;
  if (![self.pipeline warmupWithConfig:runtimeConfig error:&warmupError] || warmupError != nil) {
    reject(ETErrorRuntime, warmupError.localizedDescription ?: @"Failed to initialize runtime.", warmupError);
    return;
  }

  NSError *runError = nil;
  NSDictionary *result = [self.pipeline runWithPayload:payload error:&runError];
  if (runError != nil || result == nil) {
    NSString *errorCode = (runError.code >= 4000 && runError.code < 5000) ? ETErrorBadImage : ETErrorRuntime;
    reject(errorCode, runError.localizedDescription ?: @"Inference failed.", runError);
    return;
  }
  resolve(result);
}

@end

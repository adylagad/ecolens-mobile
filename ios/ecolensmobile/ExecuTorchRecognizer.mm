#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>

static NSString *const ETErrorBadPayload = @"E_BAD_PAYLOAD";
static NSString *const ETErrorBadImage = @"E_BAD_IMAGE";
static NSString *const ETErrorRuntime = @"E_RUNTIME";

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

static NSString *ETResolveExistingPath(NSString *candidate)
{
  if (candidate.length == 0) {
    return nil;
  }
  return [[NSFileManager defaultManager] fileExistsAtPath:candidate] ? candidate : nil;
}

@interface ExecuTorchPipeline : NSObject
@property (nonatomic, strong) NSDate *lastWarmupAt;
@property (nonatomic, copy) NSString *activeModelPath;
@property (nonatomic, copy) NSString *activeTokenizerPath;
@property (nonatomic, copy) NSString *activePreset;
@property (nonatomic, assign) BOOL initialized;
- (BOOL)warmupWithConfig:(NSDictionary *)config error:(NSError **)error;
- (NSDictionary *)runWithPayload:(NSDictionary *)payload error:(NSError **)error;
@end

@implementation ExecuTorchPipeline

- (instancetype)init
{
  self = [super init];
  if (self) {
    _initialized = NO;
    _activePreset = @"balanced";
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

- (BOOL)warmupWithConfig:(NSDictionary *)config error:(NSError **)error
{
  NSDictionary *runtimeConfig = ETDictionaryOrEmpty(config);
  NSString *requestedModelPath = ETStringOrEmpty(runtimeConfig[@"modelPath"]);
  NSString *requestedTokenizerPath = ETStringOrEmpty(runtimeConfig[@"tokenizerPath"]);
  NSString *requestedPreset = ETStringOrEmpty(runtimeConfig[@"preset"]);

  NSString *resolvedModelPath = ETResolveExistingPath(requestedModelPath) ?: [self resolveBundleModelPath];
  NSString *resolvedTokenizerPath = ETResolveExistingPath(requestedTokenizerPath) ?: [self resolveBundleTokenizerPath];

  /*
   TODO(ExecuTorch Integration):
   - Load and cache ExecuTorch module from resolvedModelPath.
   - Load tokenizer artifacts from resolvedTokenizerPath.
   - Initialize backend/delegate selection (CPU / MPS / CoreML delegates when available).
  */
  self.activeModelPath = resolvedModelPath ?: @"";
  self.activeTokenizerPath = resolvedTokenizerPath ?: @"";
  self.activePreset = requestedPreset.length > 0 ? requestedPreset : @"balanced";
  self.lastWarmupAt = [NSDate date];
  self.initialized = YES;

  if (self.activeModelPath.length == 0) {
    NSLog(@"[ExecuTorchRecognizer] No model path found yet. Running in scaffold mode.");
  }
  if (error != NULL) {
    *error = nil;
  }
  return YES;
}

- (NSDictionary *)decodeImageMetadataFromBase64:(NSString *)imageBase64 error:(NSError **)error
{
  if (imageBase64.length == 0) {
    if (error != NULL) {
      *error = nil;
    }
    return @{};
  }

  NSData *imageData = [[NSData alloc] initWithBase64EncodedString:imageBase64
                                                           options:NSDataBase64DecodingIgnoreUnknownCharacters];
  if (imageData.length == 0) {
    if (error != NULL) {
      *error = [NSError errorWithDomain:@"ExecuTorchRecognizer"
                                   code:1001
                               userInfo:@{NSLocalizedDescriptionKey: @"imageBase64 could not be decoded."}];
    }
    return nil;
  }

  UIImage *image = [UIImage imageWithData:imageData];
  if (!image) {
    if (error != NULL) {
      *error = [NSError errorWithDomain:@"ExecuTorchRecognizer"
                                   code:1002
                               userInfo:@{NSLocalizedDescriptionKey: @"Decoded image bytes are not a valid image."}];
    }
    return nil;
  }

  NSDictionary *metadata = @{
    @"width": @(image.size.width),
    @"height": @(image.size.height),
    @"bytes": @(imageData.length)
  };
  if (error != NULL) {
    *error = nil;
  }
  return metadata;
}

- (NSDictionary *)runWithPayload:(NSDictionary *)payload error:(NSError **)error
{
  if (!self.initialized) {
    [self warmupWithConfig:@{} error:nil];
  }

  NSString *labelHint = ETStringOrEmpty(payload[@"detectedLabel"]);
  NSString *imageBase64 = ETStringOrEmpty(payload[@"imageBase64"]);
  NSNumber *confidenceHint = ETNumberOrNil(payload[@"confidence"]) ?: @0.62;

  NSError *imageError = nil;
  NSDictionary *imageMetadata = [self decodeImageMetadataFromBase64:imageBase64 error:&imageError];
  if (imageError != nil) {
    if (error != NULL) {
      *error = imageError;
    }
    return nil;
  }

  NSString *name = labelHint.length > 0 ? labelHint : @"Detected Item";
  NSString *normalized = [name lowercaseString];
  BOOL likelyReusable = [normalized containsString:@"reusable"] || [normalized containsString:@"steel"];

  NSInteger ecoScore = likelyReusable ? 84 : 58;
  NSInteger co2Gram = likelyReusable ? 33 : 104;
  NSString *suggestion = likelyReusable ? @"Keep reusing this item to maximize impact."
                                        : @"Prefer reusable variants when possible.";

  /*
   TODO(ExecuTorch Inference):
   1) Preprocess image into model input tensor.
   2) Run vision model forward pass with ExecuTorch runtime.
   3) Feed extracted semantics into LLM summarizer or VLM decoder.
   4) Map model output to this structured schema.
  */

  NSMutableDictionary *runtime = [@{
    @"engine": @"on-device",
    @"source": @"ios-native-scaffold",
    @"preset": self.activePreset ?: @"balanced",
    @"modelPath": self.activeModelPath ?: @"",
    @"tokenizerPath": self.activeTokenizerPath ?: @"",
    @"warmupAt": self.lastWarmupAt ? @([self.lastWarmupAt timeIntervalSince1970] * 1000.0) : @0
  } mutableCopy];
  if (imageMetadata.count > 0) {
    runtime[@"image"] = imageMetadata;
  }

  if (error != NULL) {
    *error = nil;
  }
  return @{
    @"title": @"On-device (pipeline scaffold)",
    @"name": name,
    @"category": likelyReusable ? @"reusable-item" : @"single-use-or-unknown",
    @"ecoScore": @(ecoScore),
    @"co2Gram": @(co2Gram),
    @"confidence": confidenceHint,
    @"suggestion": suggestion,
    @"altRecommendation": @"Choose reusable alternatives to reduce lifecycle impact.",
    @"explanation": @"iOS native pipeline scaffold is active. Replace placeholder scoring with ExecuTorch inference outputs.",
    @"scoreFactors": @[
      @{
        @"code": @"pipeline_scaffold",
        @"label": @"Scaffold inference path",
        @"detail": @"Result came from native Objective-C++ scaffold pending ExecuTorch model execution.",
        @"delta": @0
      }
    ],
    @"runtime": runtime
  };
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
    NSString *errorCode = (runError.code == 1001 || runError.code == 1002) ? ETErrorBadImage : ETErrorRuntime;
    reject(errorCode, runError.localizedDescription ?: @"Inference failed.", runError);
    return;
  }
  resolve(result);
}

@end

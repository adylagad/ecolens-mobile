#import <Foundation/Foundation.h>
#import "ETExecuTorchAdapter.h"
#import <TargetConditionals.h>

#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <initializer_list>
#include <memory>
#include <numeric>
#include <string>
#include <vector>

#ifndef ET_ENABLE_EXECUTORCH_CPP
#define ET_ENABLE_EXECUTORCH_CPP 0
#endif

#if ET_ENABLE_EXECUTORCH_CPP && !TARGET_OS_SIMULATOR && __has_include(<executorch/extension/module/module.h>) && __has_include(<executorch/extension/tensor/tensor.h>)
#define ET_HAS_EXECUTORCH_CPP 1
#include <executorch/extension/module/module.h>
#include <executorch/extension/tensor/tensor.h>
#else
#define ET_HAS_EXECUTORCH_CPP 0
#endif

namespace {

struct LabelMetadata {
  std::string name;
  std::string category;
  std::string summary;
  std::string suggestion;
  int ecoScore = -1;
};

struct AdapterModel {
  std::string modelPath;
  std::string tokenizerPath;
  std::string preset;
  std::vector<LabelMetadata> labels;
  std::string labelsPath;

  bool initialized = false;

#if ET_HAS_EXECUTORCH_CPP
  std::unique_ptr<executorch::extension::Module> module;
#endif
};

static const char *dupCString(const std::string &value)
{
  char *copy = static_cast<char *>(std::malloc(value.size() + 1));
  if (!copy) {
    return nullptr;
  }
  std::memcpy(copy, value.c_str(), value.size() + 1);
  return copy;
}

static void setError(const char **errorMessage, const std::string &message)
{
  if (!errorMessage) {
    return;
  }
  *errorMessage = dupCString(message);
}

static std::string safeString(const char *value)
{
  return value ? std::string(value) : std::string();
}

static NSString *safeNSString(const std::string &value)
{
  if (value.empty()) {
    return @"";
  }
  NSString *converted = [NSString stringWithUTF8String:value.c_str()];
  return converted ?: @"";
}

#if ET_HAS_EXECUTORCH_CPP
static std::string lowercase(std::string value)
{
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
    return static_cast<char>(std::tolower(c));
  });
  return value;
}
#endif

static int clampEcoScore(int score)
{
  return std::max(1, std::min(99, score));
}

static NSString *firstStringFromDict(NSDictionary *dict, NSArray<NSString *> *keys)
{
  for (NSString *key in keys) {
    id value = dict[key];
    if ([value isKindOfClass:[NSString class]]) {
      NSString *trimmed = [(NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return nil;
}

static int firstIntFromDict(NSDictionary *dict, NSArray<NSString *> *keys)
{
  for (NSString *key in keys) {
    id value = dict[key];
    if ([value isKindOfClass:[NSNumber class]]) {
      return [(NSNumber *)value intValue];
    }
    if ([value isKindOfClass:[NSString class]]) {
      NSString *text = [(NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
      if (text.length == 0) {
        continue;
      }
      NSInteger parsed = 0;
      NSScanner *scanner = [NSScanner scannerWithString:text];
      if ([scanner scanInteger:&parsed] && scanner.isAtEnd) {
        return static_cast<int>(parsed);
      }
    }
  }
  return -1;
}

static bool parseLabelEntryObject(id value, LabelMetadata &entry)
{
  if ([value isKindOfClass:[NSString class]]) {
    NSString *name = [(NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (name.length == 0) {
      return false;
    }
    entry.name = std::string(name.UTF8String);
    return true;
  }

  if (![value isKindOfClass:[NSDictionary class]]) {
    return false;
  }

  NSDictionary *dict = (NSDictionary *)value;
  NSString *name = firstStringFromDict(dict, @[ @"name", @"label", @"class", @"title", @"item" ]);
  if (name.length > 0) {
    entry.name = std::string(name.UTF8String);
  }

  NSString *category = firstStringFromDict(dict, @[ @"category", @"type" ]);
  if (category.length > 0) {
    entry.category = std::string(category.UTF8String);
  }

  NSString *summary = firstStringFromDict(dict, @[ @"summary", @"description", @"explanation" ]);
  if (summary.length > 0) {
    entry.summary = std::string(summary.UTF8String);
  }

  NSString *suggestion = firstStringFromDict(dict, @[ @"suggestion", @"recommendation", @"tip" ]);
  if (suggestion.length > 0) {
    entry.suggestion = std::string(suggestion.UTF8String);
  }

  int score = firstIntFromDict(dict, @[ @"ecoScore", @"eco_score", @"score" ]);
  if (score >= 0) {
    entry.ecoScore = clampEcoScore(score);
  }

  return !entry.name.empty();
}

static bool parseIndexedLabelDictionary(NSDictionary *dict, std::vector<LabelMetadata> &labels)
{
  NSMutableArray<NSNumber *> *indices = [NSMutableArray array];
  for (id key in dict) {
    if (![key isKindOfClass:[NSString class]]) {
      continue;
    }
    NSString *keyString = (NSString *)key;
    NSInteger parsed = 0;
    NSScanner *scanner = [NSScanner scannerWithString:keyString];
    if ([scanner scanInteger:&parsed] && scanner.isAtEnd && parsed >= 0) {
      [indices addObject:@(parsed)];
    }
  }

  if (indices.count == 0) {
    return false;
  }

  [indices sortUsingComparator:^NSComparisonResult(NSNumber *a, NSNumber *b) {
    return [a compare:b];
  }];

  NSInteger maxIndex = [[indices lastObject] integerValue];
  std::vector<LabelMetadata> parsed(static_cast<size_t>(maxIndex + 1));
  bool hasAny = false;

  for (NSNumber *indexNumber in indices) {
    NSInteger index = [indexNumber integerValue];
    id rawEntry = dict[[indexNumber stringValue]];
    LabelMetadata label;
    if (parseLabelEntryObject(rawEntry, label)) {
      parsed[static_cast<size_t>(index)] = label;
      hasAny = true;
    }
  }

  if (!hasAny) {
    return false;
  }

  labels = std::move(parsed);
  return true;
}

static bool parseLabelsFromJSON(id jsonObject, std::vector<LabelMetadata> &labels)
{
  if ([jsonObject isKindOfClass:[NSArray class]]) {
    NSArray *array = (NSArray *)jsonObject;
    std::vector<LabelMetadata> parsed;
    parsed.reserve(array.count);

    for (id rawEntry in array) {
      LabelMetadata entry;
      if (parseLabelEntryObject(rawEntry, entry)) {
        parsed.push_back(entry);
      }
    }

    if (parsed.empty()) {
      return false;
    }
    labels = std::move(parsed);
    return true;
  }

  if (![jsonObject isKindOfClass:[NSDictionary class]]) {
    return false;
  }

  NSDictionary *dict = (NSDictionary *)jsonObject;
  for (NSString *arrayKey in @[ @"labels", @"classes", @"items", @"categories" ]) {
    id nested = dict[arrayKey];
    if ([nested isKindOfClass:[NSArray class]]) {
      return parseLabelsFromJSON(nested, labels);
    }
  }

  for (NSString *indexedKey in @[ @"id2label", @"label_map", @"labelMap", @"class_map", @"classes_by_id" ]) {
    id nested = dict[indexedKey];
    if ([nested isKindOfClass:[NSDictionary class]] && parseIndexedLabelDictionary((NSDictionary *)nested, labels)) {
      return true;
    }
  }

  if (parseIndexedLabelDictionary(dict, labels)) {
    return true;
  }

  LabelMetadata single;
  if (parseLabelEntryObject(dict, single)) {
    labels = {single};
    return true;
  }

  return false;
}

static bool loadLabelsFromPath(NSString *path, std::vector<LabelMetadata> &labels)
{
  if (path.length == 0 || ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
    return false;
  }

  NSError *readError = nil;
  NSData *data = [NSData dataWithContentsOfFile:path options:0 error:&readError];
  if (!data || readError != nil) {
    return false;
  }

  NSError *jsonError = nil;
  id json = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];
  if (jsonError != nil || json == nil) {
    return false;
  }

  return parseLabelsFromJSON(json, labels);
}

static void loadLabelMetadata(AdapterModel *model)
{
  if (!model) {
    return;
  }

  @autoreleasepool {
    NSMutableArray<NSString *> *candidates = [NSMutableArray array];
    NSFileManager *fileManager = [NSFileManager defaultManager];

    auto addCandidatePath = ^(NSString *candidate) {
      if (candidate.length == 0) {
        return;
      }
      if (![fileManager fileExistsAtPath:candidate]) {
        return;
      }
      if (![candidates containsObject:candidate]) {
        [candidates addObject:candidate];
      }
    };

    NSString *tokenizerPath = safeNSString(model->tokenizerPath);
    addCandidatePath(tokenizerPath);

    NSString *modelPath = safeNSString(model->modelPath);
    NSString *modelDirectory = [modelPath stringByDeletingLastPathComponent];
    NSString *modelBasename = [[modelPath lastPathComponent] stringByDeletingPathExtension];
    NSArray<NSString *> *modelSidecars = @[
      [NSString stringWithFormat:@"%@.labels.json", modelBasename],
      [NSString stringWithFormat:@"%@_labels.json", modelBasename],
      [NSString stringWithFormat:@"%@.classes.json", modelBasename],
      @"labels.json",
      @"classes.json",
      @"label_map.json",
      @"imagenet_labels.json"
    ];

    for (NSString *filename in modelSidecars) {
      NSString *fullPath = [modelDirectory stringByAppendingPathComponent:filename];
      addCandidatePath(fullPath);
    }

    for (NSString *candidatePath in candidates) {
      std::vector<LabelMetadata> parsed;
      if (loadLabelsFromPath(candidatePath, parsed)) {
        model->labels = std::move(parsed);
        model->labelsPath = std::string(candidatePath.UTF8String);
        return;
      }
    }
  }
}

#if ET_HAS_EXECUTORCH_CPP
static bool containsAnyToken(const std::string &text, std::initializer_list<const char *> tokens)
{
  for (const char *token : tokens) {
    if (token != nullptr && text.find(token) != std::string::npos) {
      return true;
    }
  }
  return false;
}

static std::string inferCategoryFromLabel(const std::string &label)
{
  const std::string lowered = lowercase(label);

  const bool isPlastic = containsAnyToken(lowered, { "plastic", "polyethylene", "pet", "polythene" });
  const bool isBottle = containsAnyToken(lowered, { "bottle", "flask", "canteen", "thermos", "tumbler", "water jug" });
  const bool isSingleUse = containsAnyToken(lowered, {
    "single-use", "single use", "disposable", "wrapper", "styrofoam",
    "foam cup", "plastic cup", "plastic straw", "takeout", "to-go",
    "shopping bag", "garbage bag"
  });
  const bool isReusable = containsAnyToken(lowered, {
    "reusable", "refillable", "stainless", "steel", "glass", "metal",
    "thermos", "tumbler", "canteen", "lunch box", "lunchbox", "mug", "jar"
  });
  const bool isPackaging = containsAnyToken(lowered, {
    "wrapper", "packaging", "carton", "packet", "bag", "sachet", "cup", "plate", "straw"
  });
  const bool isElectronics = containsAnyToken(lowered, {
    "laptop", "computer", "phone", "tablet", "monitor", "keyboard",
    "mouse", "camera", "headphone", "speaker", "router", "printer"
  });
  const bool isDurableHousehold = containsAnyToken(lowered, {
    "chair", "table", "sofa", "shelf", "tool", "pan", "pot", "backpack", "shoe", "helmet", "bicycle", "bike"
  });

  if (isBottle && isPlastic) {
    return "single-use-plastic-bottle";
  }
  if (isBottle && (isReusable || !isPlastic)) {
    return "reusable-hydration";
  }
  if (isSingleUse) {
    return "single-use-item";
  }
  if (isReusable) {
    return "reusable-item";
  }
  if (isPackaging) {
    return "packaging";
  }
  if (isElectronics) {
    return "electronic-device";
  }
  if (isDurableHousehold) {
    return "durable-household";
  }
  return "general-object";
}

static std::string summaryForCategoryAndScore(const std::string &category, int ecoScore)
{
  if (category == "single-use-plastic-bottle") {
    return "Likely single-use plastic; switching to a reusable bottle cuts repeat waste.";
  }
  if (category == "single-use-item" || category == "packaging") {
    return "Likely disposable packaging or single-use item; reusable alternatives usually reduce impact.";
  }
  if (category == "reusable-hydration" || category == "reusable-item") {
    return "Looks reusable; keep using and refilling to lower lifecycle footprint.";
  }
  if (category == "electronic-device") {
    return "Electronics have high manufacturing impact; longer lifespan and repair improve outcomes.";
  }
  if (category == "durable-household") {
    return "Durable goods are generally better when used for many years and repaired when possible.";
  }
  if (ecoScore >= 70) {
    return "Lower expected ongoing impact; reuse and maintenance help preserve the benefit.";
  }
  if (ecoScore <= 40) {
    return "Higher likely impact pattern; consider reusable or longer-life alternatives.";
  }
  return "Moderate footprint estimate; small reuse changes can improve impact.";
}

static std::string suggestionForCategory(const std::string &category)
{
  if (category == "single-use-plastic-bottle") {
    return "Use a refillable stainless steel or insulated bottle.";
  }
  if (category == "single-use-item" || category == "packaging") {
    return "Pick reusable, refillable, or minimal-packaging options when possible.";
  }
  if (category == "reusable-hydration" || category == "reusable-item") {
    return "Keep reusing this item and avoid replacing it early.";
  }
  if (category == "electronic-device") {
    return "Extend device life, repair before replacing, and recycle through e-waste channels.";
  }
  if (category == "durable-household") {
    return "Maintain and repair this item to spread impact over a longer lifespan.";
  }
  return "Prefer durable and reusable choices where practical.";
}

static int inferEcoScoreFromLabel(const std::string &label, const std::string &preset)
{
  const std::string lowered = lowercase(label);
  int score = 56;

  const bool isPlastic = containsAnyToken(lowered, { "plastic", "polyethylene", "pet", "polythene" });
  const bool isSingleUse = containsAnyToken(lowered, {
    "single-use", "single use", "disposable", "wrapper", "styrofoam",
    "foam cup", "plastic cup", "plastic straw", "takeout", "to-go", "sachet"
  });
  const bool isReusable = containsAnyToken(lowered, {
    "reusable", "refillable", "stainless", "steel", "glass", "metal",
    "thermos", "tumbler", "canteen", "mug", "jar", "lunchbox", "lunch box"
  });
  const bool isBottle = containsAnyToken(lowered, { "bottle", "flask", "canteen", "thermos", "tumbler" });
  const bool isDurable = containsAnyToken(lowered, {
    "chair", "table", "sofa", "tool", "pan", "pot", "backpack", "shoe", "helmet",
    "laptop", "phone", "monitor", "keyboard", "camera", "bicycle", "bike"
  });
  const bool isCompostableOrNatural = containsAnyToken(lowered, {
    "paper", "cardboard", "cotton", "cloth", "fabric", "jute", "wood", "bamboo"
  });

  if (isReusable) {
    score += 16;
  }
  if (isSingleUse) {
    score -= 22;
  }
  if (isBottle && !isPlastic) {
    score += 8;
  }
  if (isBottle && isPlastic) {
    score -= 10;
  }
  if (isDurable && !isSingleUse) {
    score += 6;
  }
  if (isCompostableOrNatural && !isSingleUse) {
    score += 4;
  }

  if (preset == "strict") {
    score -= 6;
  } else if (preset == "optimistic") {
    score += 6;
  }

  return clampEcoScore(score);
}

#endif

[[maybe_unused]] static std::string runHeuristicInference(const float *input,
                                         int64_t inputSize,
                                         int32_t width,
                                         int32_t height,
                                         const char *labelHint,
                                         const std::string &preset)
{
  const std::string label = safeString(labelHint);

  double meanAbs = 0.0;
  if (input && inputSize > 0) {
    for (int64_t i = 0; i < inputSize; i++) {
      meanAbs += std::fabs(static_cast<double>(input[i]));
    }
    meanAbs /= static_cast<double>(inputSize);
  }

  int ecoScore = 56;
  if (!label.empty()) {
    std::string lowered = label;
    for (char &c : lowered) {
      c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }
    if (lowered.find("reusable") != std::string::npos || lowered.find("steel") != std::string::npos ||
        lowered.find("glass") != std::string::npos) {
      ecoScore += 22;
    }
    if (lowered.find("single") != std::string::npos || lowered.find("plastic") != std::string::npos ||
        lowered.find("disposable") != std::string::npos) {
      ecoScore -= 16;
    }
  }
  if (preset == "strict") {
    ecoScore -= 6;
  } else if (preset == "optimistic") {
    ecoScore += 6;
  }

  const int tensorBonus = static_cast<int>(std::round((0.35 - std::min(meanAbs, 1.0)) * 12.0));
  ecoScore += tensorBonus;
  if (ecoScore < 1) {
    ecoScore = 1;
  }
  if (ecoScore > 99) {
    ecoScore = 99;
  }

  const int co2 = std::max(12, 160 - ecoScore);
  const double confidence = std::max(0.35, std::min(0.96, 0.52 + (static_cast<double>(ecoScore) / 200.0)));

  NSString *name = label.empty() ? @"Detected Item" : [NSString stringWithUTF8String:label.c_str()];
  NSString *category = ecoScore >= 70 ? @"reusable-item" : @"single-use-or-unknown";
  NSString *suggestion = ecoScore >= 70
    ? @"Keep reusing this item to reduce lifecycle impact."
    : @"Prefer reusable alternatives to lower footprint.";

  NSDictionary *jsonDict = @{
    @"title": @"On-device (adapter)",
    @"name": name,
    @"category": category,
    @"ecoScore": @(ecoScore),
    @"co2Gram": @(co2),
    @"confidence": @(confidence),
    @"summary": suggestion,
    @"suggestion": suggestion,
    @"explanation": @"Result generated by ETExecuTorchAdapter heuristic path. Replace with real ExecuTorch model outputs.",
    @"scoreFactors": @[
      @{ @"code": @"adapter_input", @"label": @"Adapter tensor signal", @"detail": @"Uses tensor statistics until real model decoding is wired.", @"delta": @0 }
    ],
    @"runtimeDebug": @{
      @"preset": [NSString stringWithUTF8String:preset.c_str()],
      @"inputSize": @(inputSize),
      @"width": @(width),
      @"height": @(height),
      @"meanAbs": @(meanAbs)
    }
  };

  NSError *serializationError = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:jsonDict options:0 error:&serializationError];
  if (!data || serializationError) {
    return std::string("{\"name\":\"Detected Item\",\"category\":\"unknown\",\"ecoScore\":50,\"co2Gram\":100,\"confidence\":0.5,\"summary\":\"Fallback JSON serialization failed.\",\"explanation\":\"Adapter serialization fallback.\"}");
  }
  return std::string(reinterpret_cast<const char *>(data.bytes), data.length);
}

#if ET_HAS_EXECUTORCH_CPP
static std::string runExecuTorchInference(AdapterModel *model,
                                          const float *input,
                                          int64_t inputSize,
                                          int32_t width,
                                          int32_t height,
                                          const char *labelHint,
                                          const char **errorMessage)
{
  if (!model || !model->module) {
    setError(errorMessage, "ExecuTorch module is not initialized.");
    return std::string();
  }

  const std::vector<executorch::aten::SizesType> sizes = {
      static_cast<executorch::aten::SizesType>(1),
      static_cast<executorch::aten::SizesType>(3),
      static_cast<executorch::aten::SizesType>(height),
      static_cast<executorch::aten::SizesType>(width)};
  auto inputTensor = executorch::extension::from_blob(const_cast<float *>(input), sizes);
  if (!inputTensor) {
    setError(errorMessage, "Failed to create input tensor for ExecuTorch.");
    return std::string();
  }

  auto forwardResult = model->module->forward(inputTensor);
  if (!forwardResult.ok()) {
    setError(errorMessage, "ExecuTorch forward() returned an error.");
    return std::string();
  }

  const auto &outputs = forwardResult.get();
  if (outputs.empty() || !outputs[0].isTensor()) {
    setError(errorMessage, "ExecuTorch output is empty or not a tensor.");
    return std::string();
  }

  const auto outputTensor = outputs[0].toTensor();
  const float *scores = outputTensor.const_data_ptr<float>();
  const int64_t scoreCount = outputTensor.numel();
  if (!scores || scoreCount <= 0) {
    setError(errorMessage, "ExecuTorch output tensor is empty.");
    return std::string();
  }

  int64_t bestIndex = 0;
  float bestScore = scores[0];
  float maxLogit = scores[0];
  for (int64_t i = 1; i < scoreCount; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIndex = i;
    }
    if (scores[i] > maxLogit) {
      maxLogit = scores[i];
    }
  }

  double sumExp = 0.0;
  for (int64_t i = 0; i < scoreCount; i++) {
    sumExp += std::exp(static_cast<double>(scores[i] - maxLogit));
  }
  if (sumExp <= 0.0) {
    setError(errorMessage, "ExecuTorch output produced invalid probability normalization.");
    return std::string();
  }

  const double topProbability = std::exp(static_cast<double>(bestScore - maxLogit)) / sumExp;
  const double confidence = std::max(0.05, std::min(0.99, topProbability));

  std::vector<int64_t> ranking(static_cast<size_t>(scoreCount));
  std::iota(ranking.begin(), ranking.end(), 0);
  const size_t topK = std::min<size_t>(3, ranking.size());
  std::partial_sort(
      ranking.begin(),
      ranking.begin() + topK,
      ranking.end(),
      [scores](int64_t a, int64_t b) { return scores[a] > scores[b]; });

  const std::string hintedName = safeString(labelHint);
  LabelMetadata bestMetadata;
  const bool hasLabelMetadata =
      bestIndex >= 0 &&
      static_cast<size_t>(bestIndex) < model->labels.size() &&
      !model->labels[static_cast<size_t>(bestIndex)].name.empty();
  if (hasLabelMetadata) {
    bestMetadata = model->labels[static_cast<size_t>(bestIndex)];
  }

  const std::string resolvedName = hasLabelMetadata
      ? bestMetadata.name
      : (!hintedName.empty() ? hintedName : (std::string("Class ") + std::to_string(bestIndex)));

  const std::string resolvedCategory = !bestMetadata.category.empty()
      ? bestMetadata.category
      : inferCategoryFromLabel(resolvedName);

  const int ecoScore = bestMetadata.ecoScore >= 0
      ? clampEcoScore(bestMetadata.ecoScore)
      : inferEcoScoreFromLabel(resolvedName, model->preset);

  const int co2 = std::max(10, 165 - ecoScore);
  const std::string summary = !bestMetadata.summary.empty()
      ? bestMetadata.summary
      : summaryForCategoryAndScore(resolvedCategory, ecoScore);
  const std::string suggestion = !bestMetadata.suggestion.empty()
      ? bestMetadata.suggestion
      : suggestionForCategory(resolvedCategory);

  NSMutableArray *topPredictions = [NSMutableArray arrayWithCapacity:topK];
  for (size_t rank = 0; rank < topK; rank++) {
    const int64_t index = ranking[rank];
    const float logit = scores[index];
    const double probability = std::exp(static_cast<double>(logit - maxLogit)) / sumExp;

    std::string name = std::string("Class ") + std::to_string(index);
    if (static_cast<size_t>(index) < model->labels.size()) {
      const LabelMetadata &metadata = model->labels[static_cast<size_t>(index)];
      if (!metadata.name.empty()) {
        name = metadata.name;
      }
    }

    [topPredictions addObject:@{
      @"index": @(index),
      @"name": safeNSString(name),
      @"logit": @(logit),
      @"probability": @(probability)
    }];
  }

  NSDictionary *jsonDict = @{
    @"title": @"On-device (ExecuTorch)",
    @"name": safeNSString(resolvedName),
    @"category": safeNSString(resolvedCategory),
    @"ecoScore": @(ecoScore),
    @"co2Gram": @(co2),
    @"confidence": @(confidence),
    @"summary": safeNSString(summary),
    @"suggestion": safeNSString(suggestion),
    @"explanation": @"ExecuTorch runtime produced tensor outputs and mapped top classes to label metadata.",
    @"topPredictions": topPredictions,
    @"scoreFactors": @[
      @{ @"code": @"executorch_top1", @"label": @"Top-1 class", @"detail": [NSString stringWithFormat:@"Top class index: %lld", bestIndex], @"delta": @0 },
      @{ @"code": @"executorch_prob", @"label": @"Top-1 probability", @"detail": [NSString stringWithFormat:@"Confidence %.3f", confidence], @"delta": @0 }
    ],
    @"runtimeDebug": @{
      @"preset": safeNSString(model->preset),
      @"inputSize": @(inputSize),
      @"width": @(width),
      @"height": @(height),
      @"outputSize": @(scoreCount),
      @"topIndex": @(bestIndex),
      @"topLogit": @(bestScore),
      @"topProbability": @(topProbability),
      @"labelCount": @(model->labels.size()),
      @"labelsPath": safeNSString(model->labelsPath)
    }
  };

  NSError *serializationError = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:jsonDict options:0 error:&serializationError];
  if (!data || serializationError) {
    setError(errorMessage, "Failed to serialize ExecuTorch output JSON.");
    return std::string();
  }
  return std::string(reinterpret_cast<const char *>(data.bytes), data.length);
}
#endif

} // namespace

extern "C" void *et_ecolens_create_model(const char *model_path,
                                          const char *tokenizer_path,
                                          const char *preset,
                                          const char **error_message) __attribute__((used, visibility("default")));

extern "C" void *et_ecolens_create_model(const char *model_path,
                                         const char *tokenizer_path,
                                         const char *preset,
                                         const char **error_message)
{
  try {
    if (error_message) {
      *error_message = nullptr;
    }

    if (!model_path || std::strlen(model_path) == 0) {
      setError(error_message, "model_path is required.");
      return nullptr;
    }

    @autoreleasepool {
      NSString *modelPath = [NSString stringWithUTF8String:model_path];
      BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:modelPath];
      if (!exists) {
        setError(error_message, "Model path does not exist on device.");
        return nullptr;
      }
    }

    std::unique_ptr<AdapterModel> model = std::make_unique<AdapterModel>();
    model->modelPath = safeString(model_path);
    model->tokenizerPath = safeString(tokenizer_path);
    model->preset = safeString(preset);
    if (model->preset.empty()) {
      model->preset = "balanced";
    }

    // tokenizer_path can point to a label metadata file for vision models.
    loadLabelMetadata(model.get());

#if ET_HAS_EXECUTORCH_CPP
    model->module = std::make_unique<executorch::extension::Module>(model->modelPath);
    auto loadStatus = model->module->load();
    if (loadStatus != executorch::runtime::Error::Ok) {
      setError(error_message, "ExecuTorch module load() failed. Check model compatibility and backend delegates.");
      return nullptr;
    }
#else
    // ExecuTorch C++ SDK is not linked in this build.
    // Fallback inference path remains available below.
#endif
    model->initialized = true;

    return model.release();
  } catch (const std::exception &ex) {
    setError(error_message, std::string("Native exception during create_model: ") + ex.what());
    return nullptr;
  } catch (...) {
    setError(error_message, "Unknown native exception during create_model.");
    return nullptr;
  }
}

extern "C" const char *et_ecolens_run_inference(void *handle,
                                                  const float *input,
                                                  int64_t input_size,
                                                  int32_t width,
                                                  int32_t height,
                                                  const char *label_hint,
                                                  const char **error_message) __attribute__((used, visibility("default")));

extern "C" const char *et_ecolens_run_inference(void *handle,
                                                const float *input,
                                                int64_t input_size,
                                                int32_t width,
                                                int32_t height,
                                                const char *label_hint,
                                                const char **error_message)
{
  try {
    if (error_message) {
      *error_message = nullptr;
    }

    if (!handle) {
      setError(error_message, "Model handle is null.");
      return nullptr;
    }

    AdapterModel *model = static_cast<AdapterModel *>(handle);
    if (!model->initialized) {
      setError(error_message, "Model is not initialized.");
      return nullptr;
    }

    if (!input || input_size <= 0 || width <= 0 || height <= 0) {
      setError(error_message, "Invalid tensor input.");
      return nullptr;
    }

    std::string json;
#if ET_HAS_EXECUTORCH_CPP
    json = runExecuTorchInference(model, input, input_size, width, height, label_hint, error_message);
    if (json.empty()) {
      return nullptr;
    }
#else
    json = runHeuristicInference(input, input_size, width, height, label_hint, model->preset);
#endif
    return dupCString(json);
  } catch (const std::exception &ex) {
    setError(error_message, std::string("Native exception during run_inference: ") + ex.what());
    return nullptr;
  } catch (...) {
    setError(error_message, "Unknown native exception during run_inference.");
    return nullptr;
  }
}

extern "C" void et_ecolens_destroy_model(void *handle) __attribute__((used, visibility("default")));

extern "C" void et_ecolens_destroy_model(void *handle)
{
  if (!handle) {
    return;
  }
  AdapterModel *model = static_cast<AdapterModel *>(handle);
  delete model;
}

extern "C" void et_ecolens_free_cstring(const char *ptr) __attribute__((used, visibility("default")));

extern "C" void et_ecolens_free_cstring(const char *ptr)
{
  if (!ptr) {
    return;
  }
  std::free(const_cast<char *>(ptr));
}

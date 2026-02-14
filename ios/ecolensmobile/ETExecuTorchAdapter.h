#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void *et_ecolens_create_model(const char *model_path,
                              const char *tokenizer_path,
                              const char *preset,
                              const char **error_message);

const char *et_ecolens_run_inference(void *handle,
                                     const float *input,
                                     int64_t input_size,
                                     int32_t width,
                                     int32_t height,
                                     const char *label_hint,
                                     const char **error_message);

void et_ecolens_destroy_model(void *handle);
void et_ecolens_free_cstring(const char *ptr);

#ifdef __cplusplus
}
#endif

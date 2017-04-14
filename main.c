
#include <stdio.h>
#include "webrtc/common_audio/vad/include/webrtc_vad.h"
#include "webrtc/common_audio/signal_processing/include/signal_processing_library.h"
#include "webrtc/common_audio/include/typedefs.h"

// handle for the VAD
VadInst* handle;


int main() {

    printf("starting webrtc_vad \n");
    int ret_state = 0;
    ret_state = WebRtcVad_Create(&handle);
    if (ret_state == -1) return 0;
    ret_state = WebRtcVad_Init(handle);
    if (ret_state == -1) return 0;
    ret_state = WebRtcVad_set_mode(handle, 3);
    if (ret_state == -1) return 0;
    printf("Webrtc_vad started \n");

    //int level = WebRtcVad_Process(handle, 16000, data, n_samples);
    return 1;
}

#include <assert.h>
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
    printf("Webrtc_vad started \n");

    return 1;
}

int setmode(int mode){
    printf("mode set to %i \n", mode);
    if (!handle) {
        printf("not handle \n");
    }
    return WebRtcVad_set_mode(handle, mode);
}

int process_data(int16_t  data[], int n_samples, int samplerate, int val0, int val100, int val2000){
    printf("pointer here %p\n", (void *) &data);
    printf("n_samples here %i\n", n_samples);
    printf("samplerate here %i\n", samplerate);
    printf("val0 here %i\n", val0);
    printf("data[0] aqui %i \n", data[0]);

    if (data == NULL) {
        printf("data == NULL \n");
    }

    //for (int i = 0; i <= 2048; i++) {
    assert(data[0] == val0);
    assert(data[100] == val100);
    assert(data[2000] == val2000);

    //return WebRtcVad_Process(handle, samplerate, data, n_samples);
    return 99;
}
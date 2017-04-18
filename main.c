
#include <assert.h>
#include <stdio.h>
#include "webrtc/common_audio/vad/include/webrtc_vad.h"

// handle for the VAD
VadInst* handle;


int main() {

    int ret_state = 0;
    ret_state = WebRtcVad_Create(&handle);
    if (ret_state == -1) return 0;
    ret_state = WebRtcVad_Init(handle);
    if (ret_state == -1) return 0;

    return 1;
}

int setmode(int mode){
    return WebRtcVad_set_mode(handle, mode);
}

int process_data(int16_t  data[], int n_samples, int samplerate, int val0, int val100, int val2000){
    if (data == NULL) {
        printf("process_data: data == NULL \n");
    }

    assert(data[0] == val0);
    assert(data[100] == val100);
    assert(data[2000] == val2000);

    return WebRtcVad_Process(handle, samplerate, data, n_samples);
}
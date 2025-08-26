pragma circom 2.0.0;

include "../../circuits/gadgets/multimux.circom";

template TestMultiMux() {
    signal input in[4];
    signal input sel[2];
    signal output out;

    component mux = MultiMux(4, 2);

    for (var i = 0; i < 4; i++) {
        mux.in[i] <== in[i];
    }

    for (var j = 0; j < 2; j++) {
        mux.sel[j] <== sel[j];
    }
    out <== mux.out;
}
component main = TestMultiMux();


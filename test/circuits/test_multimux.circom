pragma circom 2.0.0;

include "../../circuits/MultiMux.circom";

template TestMultiMux() {
    signal input in[4];
    signal input sel[2];
    signal output out;

    component mux = MultiMux(4, 2);
    mux.in <== in;
    mux.sel <== sel;
    out <== mux.out;
}

component main = TestMultiMux();
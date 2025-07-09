pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/mux1.circom";

template MultiMux(N, K) {
    // N = number of inputs (must be power of 2 or padded)
    // K = number of control bits (log₂(N))
    signal input in[N];           // Array of N inputs
    signal input sel[K];          // K control bits
    signal output out;

    signal stage[K+1][N];

    // Predeclare and initialize all needed Mux1 components (at most N-1)
    component muxes[N-1];
    for (var i = 0; i < N-1; i++) {
        muxes[i] = Mux1();
    }

    // Initialize stage[0] with the inputs
    for (var i = 0; i < N; i++) {
        stage[0][i] <== in[i];
    }

    var muxIndex = 0;

    // Iteratively reduce using Mux1 layers
    for (var level = 0; level < K; level++) {
        var step = 2 ** (level + 1);
        for (var i = 0; i < N; i += step) {
            muxes[muxIndex].c[0] <== stage[level][i];
            muxes[muxIndex].c[1] <== stage[level][i + step / 2];
            muxes[muxIndex].s <== sel[level];
            stage[level + 1][i] <== muxes[muxIndex].out;
            muxIndex++;
        }
    }

    // The final output is in stage[K][0]
    out <== stage[K][0];}

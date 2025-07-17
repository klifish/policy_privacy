pragma circom 2.0.0;

include "./multimux.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";   // IsEqual, LessThan

template PostfixPolicyInterpreter(N, DEPTH, K) {
    /*
        N      : number of Boolean attributes (requesterPolicy size)
        DEPTH  : maximum length of the postfix expression as well as
                 the maximum stack depth during evaluation
        K      : number of bits required to address requesterPolicy (⌈log2(N)⌉)
    */

    // ──────────────────  Internal bookkeeping  ──────────────────
    // Flags telling whether token i is an operand (1) or operator (0)
    signal isOperand[DEPTH]; 

    // Stack pointer after each step (sp[0] == 0 initially)
    signal sp[DEPTH + 1];

    // Complete stack snapshot *after* each step
    signal stackState[DEPTH + 1][DEPTH];

    // Intermediate signals to keep constraints quadratic
    signal prefOperand[DEPTH];
    signal prefOp[DEPTH];
    signal tmpAttr[DEPTH][DEPTH];
    signal tmpOp[DEPTH][DEPTH];

    // Further intermediate updates to enforce quadratic constraints
    signal update1[DEPTH][DEPTH];
    signal update2[DEPTH][DEPTH];

    var KP = 0;
    while ((1 << KP) < DEPTH) {
        KP++;
    }
    // Next power-of-two sizes for muxes
    var NP2 = 1 << K;
    var DP2 = 1 << KP;

    // Padded stackState for power-of-two mux input
    signal stackStatePad[DEPTH + 1][DP2];

    signal active[DEPTH];
    signal attrVal[DEPTH];
    signal andResult[DEPTH];
    signal orResult[DEPTH];
    signal notResult[DEPTH];
    signal opVal[DEPTH];
    signal delta[DEPTH];

    // Compute ⌈log2(DEPTH)⌉ at compile‑time

    component attrMux[DEPTH];
    component opMux[DEPTH];
    component attrSelBits[DEPTH];
    component opSelBits[DEPTH];
    component ptrBits[DEPTH];
    component ptrM1Bits[DEPTH];
    component ptrM2Bits[DEPTH];
    component top1Mux[DEPTH];
    component top2Mux[DEPTH];
    component activeCmp[DEPTH];
    component operandCmp[DEPTH];
    component eqTop[DEPTH][DEPTH];
    component eqDest[DEPTH][DEPTH];
    for (var i = 0; i < DEPTH; i++) {
        attrMux[i] = MultiMux(NP2, K);
        opMux[i] = MultiMux(4, 2);
        attrSelBits[i] = Num2Bits(K);
        opSelBits[i] = Num2Bits(2);
        ptrBits[i] = Num2Bits(KP);
        ptrM1Bits[i] = Num2Bits(KP);
        ptrM2Bits[i] = Num2Bits(KP);
        top1Mux[i] = MultiMux(DP2, KP);
        top2Mux[i] = MultiMux(DP2, KP);
        activeCmp[i] = LessThan(32);
        operandCmp[i] = LessThan(N);
    }

    for (var i = 0; i < DEPTH; i++) {
        for (var j = 0; j < DEPTH; j++) {
            eqTop[i][j] = IsEqual();
            eqDest[i][j] = IsEqual();
        }
    }

    // ────────────────────────  I/O  ────────────────────────
    signal input postfixExpr[DEPTH];   // The postfix program, tokenised as integers
    signal input numOperations;        // How many tokens are meaningful (≤ DEPTH)

    signal input requesterPolicy[N];   // Private bitmap of the data requester

    // Padded policy for power-of-two mux input
    signal requesterPolicyPad[NP2];

    signal output isValid;             // 1 ⇒ the policy matches the consent

    // ───────────────────────  Main loop  ───────────────────────
    // Initialize stack pointer and state
    sp[0] <== 0;
    for (var j = 0; j < DEPTH; j++) {
        stackState[0][j] <== 0;
    }

    // Pad requesterPolicy to NP2 length
    for (var j = 0; j < N; j++) {
        requesterPolicyPad[j] <== requesterPolicy[j];
    }
    for (var j = N; j < NP2; j++) {
        requesterPolicyPad[j] <== 0;
    }
    // Pad initial stackState row to DP2 length
    for (var j = 0; j < DEPTH; j++) {
        stackStatePad[0][j] <== stackState[0][j];
    }
    for (var j = DEPTH; j < DP2; j++) {
        stackStatePad[0][j] <== 0;
    }
    for (var i = 0; i < DEPTH; i++) {

        // Pad current stackState row to DP2 length (skip i == 0)
        if (i > 0) {
            for (var j = 0; j < DEPTH; j++) {
                stackStatePad[i][j] <== stackState[i][j];
            }
            for (var j = DEPTH; j < DP2; j++) {
                stackStatePad[i][j] <== 0;
            }
        }

        activeCmp[i].in[0] <== i;
        activeCmp[i].in[1] <== numOperations;
        active[i] <== activeCmp[i].out;

        operandCmp[i].in[0] <== postfixExpr[i];
        operandCmp[i].in[1] <== N;
        isOperand[i] <== operandCmp[i].out;

        ptrBits[i].in <== sp[i];
        ptrM1Bits[i].in <== sp[i] - 1;
        ptrM2Bits[i].in <== sp[i] - 2;

        attrSelBits[i].in <== postfixExpr[i];

        attrMux[i].in <== requesterPolicyPad;
        attrMux[i].sel <== attrSelBits[i].out;
        attrVal[i] <== attrMux[i].out;

        top1Mux[i].in <== stackStatePad[i];
        top1Mux[i].sel <== ptrM2Bits[i].out;

        top2Mux[i].in <== stackStatePad[i];
        top2Mux[i].sel <== ptrM1Bits[i].out;

        andResult[i] <== top1Mux[i].out * top2Mux[i].out;
        orResult[i]  <== top1Mux[i].out + top2Mux[i].out - (top1Mux[i].out * top2Mux[i].out);
        notResult[i] <== 1 - top2Mux[i].out;

        opSelBits[i].in <== postfixExpr[i] - N;

        opMux[i].in[0] <== andResult[i];
        opMux[i].in[1] <== orResult[i];
        opMux[i].in[2] <== notResult[i];
        // Pad fourth input for 4-way mux
        opMux[i].in[3] <== 0;
        opMux[i].sel <== opSelBits[i].out;

        opVal[i] <== opMux[i].out;

        for (var j = 0; j < DEPTH; j++) {
            eqTop[i][j].in[0] <== j;
            eqTop[i][j].in[1] <== sp[i];

            eqDest[i][j].in[0] <== j;
            eqDest[i][j].in[1] <== sp[i] - 2;
        }

        delta[i] <== isOperand[i] - (1 - isOperand[i]);

        // Compute prefix products to stay within quadratic constraints
        prefOperand[i] <== active[i] * isOperand[i];
        prefOp[i]      <== active[i] * (1 - isOperand[i]);

        for (var j = 0; j < DEPTH; j++) {
            tmpAttr[i][j] <== eqTop[i][j].out * (attrVal[i] - stackState[i][j]);
            tmpOp[i][j]   <== eqDest[i][j].out * (opVal[i] - stackState[i][j]);
            // First update term
            update1[i][j] <== prefOperand[i] * tmpAttr[i][j];
            // Second update term
            update2[i][j] <== prefOp[i] * tmpOp[i][j];
            // Final stack update (linear sum)
            stackState[i + 1][j] <== stackState[i][j] + update1[i][j] + update2[i][j];
        }

        sp[i + 1] <== sp[i] + active[i] * delta[i];
    }

    isValid <== stackState[DEPTH][0];
}

// 3 attributes, max postfix length 10,
// K = ⌈log2(3)⌉ = 2
component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreter(3, 10, 2);

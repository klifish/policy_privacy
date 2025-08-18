pragma circom 2.0.0;

include "./multimux.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";   // IsEqual, LessThan

/*
    PostfixPolicyInterpreter
    ------------------------
    Evaluate a Boolean postfix (RPN) expression over N private Boolean attributes.

    Token encoding:
      - 0 .. N-1          : attribute index
      - N + 0 (code 0)    : AND (binary)
      - N + 1 (code 1)    : OR  (binary)
      - N + 2 (code 2)    : NOT (unary)
      - N + 3 (code 3)    : reserved / unused

    Inputs:
      postfixExpr[DEPTH]  : token array (only first numOperations meaningful)
      numOperations       : actual length (public)
      requesterPolicy[N]  : private attribute bitmap (Boolean)

    Output:
      isValid             : final Boolean value of the expression

    Invariants enforced:
      * Sufficient stack depth for each operator (binary needs >=2, unary >=1)
      * Final stack depth == 1

    Design notes:
      * Uses a stack model encoded in arrays (no dynamic indexing).
      * Each step writes exactly one slot: push (sp), unary overwrite (sp-1), binary reduce (sp-2).
      * Conditional write pattern: new = old + flag * (val - old) keeps constraints quadratic.
*/

template PostfixPolicyInterpreter(N, DEPTH, K) {
    // ───────────── Derived sizes ─────────────
    var KP = 0;
    while ((1 << KP) < DEPTH) { KP++; }     // bits for stack pointer
    var NP2 = 1 << K;                       // next power-of-two for attributes
    var DP2 = 1 << KP;                      // next power-of-two for stack depth

    // ───────────── Inputs / Outputs ─────────────
    signal input postfixExpr[DEPTH];
    signal input numOperations;
    signal input requesterPolicy[N];
    signal output isValid;

    // ───────────── Global state ─────────────
    signal sp[DEPTH + 1];                   // stack height (sp[0] = 0)
    signal stackState[DEPTH + 1][DEPTH];    // stack snapshot after each step

    // Padded arrays for mux components
    signal policyPad[NP2];
    signal stackPad[DEPTH + 1][DP2];

    // ───────────── Per-step flags / values ─────────────
    signal active[DEPTH];                   // i < numOperations
    signal isOperand[DEPTH];                // token < N
    signal isOper[DEPTH];                   // 1 - isOperand
    signal opIdx[DEPTH];                    // operator code (0..3) or 0 when operand

    signal have1[DEPTH];                    // stack depth >= 1
    signal have2[DEPTH];                    // stack depth >= 2

    // Stack top values (binary operations need two)
    signal topA[DEPTH];
    signal topB[DEPTH];

    // Operation intermediate & results
    signal andRes[DEPTH];
    signal orRes[DEPTH];
    signal notRes[DEPTH];
    signal calcVal[DEPTH];

    // Attribute value (push) / unified write value
    signal pushVal[DEPTH];
    signal writeVal[DEPTH];

    // Operator arity flags
    signal isBinary[DEPTH];
    signal isUnary[DEPTH];

    // Destination index expression & equality flags
    signal destIdx[DEPTH];
    signal destBits[DEPTH][KP];
    signal eqDest[DEPTH][DEPTH];
    signal writeFlag[DEPTH][DEPTH];

    // Stack pointer delta
    signal spDelta[DEPTH];

    // Helper products / bits decomposition
    signal bothTop[DEPTH];
    signal opMSB[DEPTH]; // Most Significant Bit
    signal opLSB[DEPTH]; // Least Significant Bit
    signal notOpLSB[DEPTH];
    signal tmpUnary1[DEPTH];

    // Helper signals to keep constraints quadratic
    signal tmpPushVal[DEPTH];
    signal tmpCalcVal[DEPTH];
    signal diffVal[DEPTH];
    signal tmpDestOpnd[DEPTH];
    signal tmpDestUnary[DEPTH];
    signal tmpDestBinary[DEPTH];

    // Reserved operator code (11b) detection
    signal tmpCode3Bits[DEPTH];   // MSB * LSB
    signal code3Flag[DEPTH];      // isOper * tmpCode3Bits
    signal _dummyZero[DEPTH];     // forced to 0 for constraint

    // ───────────── Component arrays ─────────────
    component attrBits[DEPTH];
    component opBits[DEPTH];
    component spBits[DEPTH];
    component spM1Bits[DEPTH];
    component spM2Bits[DEPTH];
    component attrMux[DEPTH];
    component topMuxA[DEPTH];
    component topMuxB[DEPTH];
    component valMux[DEPTH];
    component cmpActive[DEPTH];
    component cmpIsOperand[DEPTH];
    component cmpDepth1[DEPTH];
    component cmpDepth2[DEPTH];
    component destBitsNC[DEPTH];
    component eqDestCmp[DEPTH][DEPTH];

    // ───────────── Initialization ─────────────
    sp[0] <== 0;
    for (var j = 0; j < DEPTH; j++) {
        stackState[0][j] <== 0;
    }
    for (var j = 0; j < N; j++) {
        requesterPolicy[j] * (requesterPolicy[j] - 1) === 0; // enforce Boolean if needed
        policyPad[j] <== requesterPolicy[j];
    }
    for (var j = N; j < NP2; j++) {
        policyPad[j] <== 0;
    }
    for (var j = 0; j < DEPTH; j++) {
        stackPad[0][j] <== 0;
    }
    for (var j = DEPTH; j < DP2; j++) {
        stackPad[0][j] <== 0;
    }

    // ───────────── Main loop ─────────────
    for (var i = 0; i < DEPTH; i++) {

        // Component instantiation per step
        attrBits[i] = Num2Bits(K);
        opBits[i]   = Num2Bits(2);          // up to 4 operators
        spBits[i]   = Num2Bits(KP);
        spM1Bits[i] = Num2Bits(KP);
        spM2Bits[i] = Num2Bits(KP);
        attrMux[i]  = MultiMux(NP2, K);
        topMuxA[i]  = MultiMux(DP2, KP);
        topMuxB[i]  = MultiMux(DP2, KP);
        valMux[i]   = MultiMux(4, 2);

        cmpActive[i]    = LessThan(32);
        cmpIsOperand[i] = LessThan(N);
        cmpDepth1[i]    = LessThan(32);
        cmpDepth2[i]    = LessThan(32);
        destBitsNC[i]   = Num2Bits(KP);

        // Activate row padding
        if (i > 0) {
            for (var j = 0; j < DEPTH; j++) {
                stackPad[i][j] <== stackState[i][j];
            }
            for (var j = DEPTH; j < DP2; j++) {
                stackPad[i][j] <== 0;
            }
        }

        // Active flag
        cmpActive[i].in[0] <== i;
        cmpActive[i].in[1] <== numOperations;
        active[i] <== cmpActive[i].out;

        // Operand flag
        cmpIsOperand[i].in[0] <== postfixExpr[i];
        cmpIsOperand[i].in[1] <== N;
        isOperand[i] <== cmpIsOperand[i].out;
        isOper[i]    <== 1 - isOperand[i];

        // Stack pointer bits
        spBits[i].in <== sp[i];

        // Depth availability
        cmpDepth1[i].in[0] <== sp[i];
        cmpDepth1[i].in[1] <== 1;
        cmpDepth2[i].in[0] <== sp[i];
        cmpDepth2[i].in[1] <== 2;
        have1[i] <== 1 - cmpDepth1[i].out;
        have2[i] <== 1 - cmpDepth2[i].out;

        // Attribute selection (mask with isOperand)
        attrBits[i].in <== isOperand[i] * postfixExpr[i];
        for (var b = 0; b < K; b++) {
            attrMux[i].sel[b] <== attrBits[i].out[b];
        }
        for (var j = 0; j < NP2; j++) {
            attrMux[i].in[j] <== policyPad[j];
        }
        pushVal[i] <== attrMux[i].out;

        // Operator code (masked)
        opIdx[i] <== isOper[i] * (postfixExpr[i] - N);
        opBits[i].in <== opIdx[i];

        // Arity detection:
        // code 0 or 1 => AND / OR (binary) (MSB=0)
        // code 2      => NOT (unary)         (binary 10)
        opMSB[i]    <== opBits[i].out[1];
        isBinary[i] <== isOper[i] * (1 - opMSB[i]);   // degree 2
        opLSB[i]    <== opBits[i].out[0];
        notOpLSB[i] <== 1 - opLSB[i];
        tmpUnary1[i] <== isOper[i] * opMSB[i];         // degree 2
        isUnary[i]   <== tmpUnary1[i] * notOpLSB[i];   // degree 2

        // ----- Disallow reserved operator code 3 (bit pattern 11) -----
        tmpCode3Bits[i] <== opBits[i].out[1] * opBits[i].out[0];   // degree 2
        code3Flag[i]    <== isOper[i] * tmpCode3Bits[i];           // degree 2
        active[i] * code3Flag[i] === 0 ; // active step cannot have code 3

        // Binary needs depth >=2 ; Unary needs depth >=1
        isBinary[i] * (1 - have2[i]) === 0;
        isUnary[i]  * (1 - have1[i]) === 0;

        // Stack top indices (masked to 0 when insufficient depth)
        // have1*(sp-1), have2*(sp-2)
        spM1Bits[i].in <== have1[i] * sp[i] - have1[i];
        spM2Bits[i].in <== have2[i] * sp[i] - 2 * have2[i];

        // top mux inputs
        for (var j = 0; j < DP2; j++) {
            topMuxA[i].in[j] <== stackPad[i][j];
            topMuxB[i].in[j] <== stackPad[i][j];
        }
        for (var b = 0; b < KP; b++) {
            topMuxA[i].sel[b] <== spM2Bits[i].out[b];
            topMuxB[i].sel[b] <== spM1Bits[i].out[b];
        }
        topA[i] <== topMuxA[i].out;
        topB[i] <== topMuxB[i].out;

        // Operation core (no gating here; arity constraints ensure correctness)
        bothTop[i] <== topA[i] * topB[i];
        andRes[i]  <== bothTop[i];
        orRes[i]   <== topA[i] + topB[i] - bothTop[i];
        notRes[i]  <== 1 - topB[i];

        // Select operator result (AND / OR / NOT / 0)
        valMux[i].in[0] <== andRes[i];
        valMux[i].in[1] <== orRes[i];
        valMux[i].in[2] <== notRes[i];
        valMux[i].in[3] <== 0;
        for (var b = 0; b < 2; b++) {
            valMux[i].sel[b] <== opBits[i].out[b];
        }
        calcVal[i] <== valMux[i].out;

        // Unified write value
        // writeVal = isOperand? pushVal : calcVal
        diffVal[i] <== pushVal[i] - calcVal[i];
        writeVal[i] <== calcVal[i] + isOperand[i] * diffVal[i];

        // Destination index expression
        // destIdx = (operand ? sp) + (unary ? sp-1) + (binary ? sp-2)
        tmpDestOpnd[i]  <== isOperand[i] * sp[i];
        tmpDestUnary[i] <== isUnary[i] * (sp[i] - 1);
        tmpDestBinary[i] <== isBinary[i] * (sp[i] - 2);
        destIdx[i] <== tmpDestOpnd[i] + tmpDestUnary[i] + tmpDestBinary[i];

        // Bits for equality (only used; not fed to another Num2Bits)
        destBitsNC[i].in <== destIdx[i];
        for (var b = 0; b < KP; b++) {
            destBits[i][b] <== destBitsNC[i].out[b];
        }

        // Equality & conditional write
        for (var j = 0; j < DEPTH; j++) {
            eqDestCmp[i][j] = IsEqual();
            eqDestCmp[i][j].in[0] <== j;
            eqDestCmp[i][j].in[1] <== destIdx[i];
            eqDest[i][j] <== eqDestCmp[i][j].out;

            writeFlag[i][j] <== active[i] * eqDest[i][j]; // since isOperand + isOper == 1
            stackState[i + 1][j] <== stackState[i][j] + writeFlag[i][j] * (writeVal[i] - stackState[i][j]);
        }

        // Stack pointer delta: push +1, binary -1, unary 0
        spDelta[i] <== isOperand[i] - isBinary[i];
        sp[i + 1] <== sp[i] + active[i] * spDelta[i];

        // Optional: enforce Boolean nature of writeVal (cheap assurance)
        // writeVal[i] * (writeVal[i] - 1) === 0;
    }

    // Final stack depth must be exactly 1
    sp[DEPTH] === 1;

    // Output (stack no longer mutates after last active step)
    isValid <== stackState[DEPTH][0];
}

// Example instantiation:
//  N = 3 attributes, DEPTH = 10 tokens, K = ⌈log2(3)⌉ = 2
component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreter(3, 10, 2);

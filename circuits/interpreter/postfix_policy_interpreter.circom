pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";   // IsEqual, LessThan
include "../../node_modules/circomlib/circuits/poseidon.circom";      // For hashing binding leaf
include "../gadgets/multimux.circom";
include "../gadgets/external_predicates.circom";

/*
    PostfixPolicyInterpreter
    ------------------------
    Evaluate a Boolean postfix (RPN) expression over N private Boolean attributes
    and M external predicate values (ontology/credential checks).

    Token encoding:
      - 0 .. N-1          : requester attribute index
      - N .. N+M-1        : predicate value index (external checks)
      - N+M + 0 (code 0)  : AND (binary)
      - N+M + 1 (code 1)  : OR  (binary)
      - N+M + 2 (code 2)  : NOT (unary)
      - N+M + 3 (code 3)  : EXT (extended operator for ICD_MEMBER_REQ)

    Inputs:
      postfixExpr[DEPTH]  : token array (only first numOperations meaningful)
      numOperations       : actual length (public)
      requesterPolicy[N]  : private attribute bitmap (Boolean)
      predicateValues[M]  : external predicate results (Boolean)

    Output:
      isValid             : final Boolean value of the expression

    Invariants enforced:
      * Sufficient stack depth for each operator (binary needs >=2, unary >=1)
      * Final stack depth == 1

    Design notes:
      * Uses a stack model encoded in arrays (no dynamic indexing).
      * Each step writes exactly one slot: push (sp), unary overwrite (sp-1), binary reduce (sp-2).
      * Conditional write pattern: new = old + flag * (val - old) keeps constraints quadratic.
      * Backward compatibility: when M=0, behaves identically to original implementation.
*/

template PostfixPolicyInterpreter(N, M, DEPTH, K, MERKLE_LEVELS) {
    // ───────────── Derived sizes ─────────────
    var KP = 0;
    while ((1 << KP) < DEPTH) { KP++; }     // bits for stack pointer
    var KSEL = 0;
    while ((1 << KSEL) < (N + M)) { KSEL++; }  // bits for operand selection (N+M operands)
    var NMP2 = 1 << KSEL;                   // next power-of-two for operands (N+M)
    var DP2 = 1 << KP;                      // next power-of-two for stack depth

    // ───────────── Inputs / Outputs ─────────────
    signal input postfixExpr[DEPTH];
    signal input numOperations;
    signal input requesterPolicy[N];
    signal input predicateValues[M];
    
    // EXT operator inputs for ICD_MEMBER_REQ functionality
    signal input bindingRoot;                         // Merkle root for binding map (duo_id, icd_root, version, salt)
    signal input duoId;                              // DUO clause identifier for current EXT operation  
    signal input icdRoot;                            // ICD set Merkle root for current EXT operation
    signal input bindingVersion;                     // Version for binding map
    signal input bindingSalt;                        // Salt for binding map
    signal input bindingPathElements[MERKLE_LEVELS]; // Merkle proof for binding verification
    signal input bindingPathIndices[MERKLE_LEVELS];  // Merkle proof indices for binding verification
    signal input icdCode;                           // ICD code being checked for membership
    signal input icdPathElements[MERKLE_LEVELS];    // Merkle proof for ICD membership
    signal input icdPathIndices[MERKLE_LEVELS];     // Merkle proof indices for ICD membership
    
    signal output isValid;

    // ───────────── Global state ─────────────
    signal sp[DEPTH + 1];                   // stack height (sp[0] = 0)
    signal stackState[DEPTH + 1][DEPTH];    // stack snapshot after each step
    
    // Global dependency tracking for EXT operations
    signal depsOK[DEPTH + 1];               // tracks if all dependencies are satisfied
    signal extResult[DEPTH];                // result of EXT operations

    // Padded arrays for mux components
    signal operandPad[NMP2];
    signal stackPad[DEPTH + 1][DP2];

    // ───────────── Per-step flags / values ─────────────
    signal active[DEPTH];                   // i < numOperations
    signal isOperand[DEPTH];                // token < (N + M)
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
    signal isExt[DEPTH];                    // EXT operator flag

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
    signal tmpDestExt[DEPTH];

    // EXT operation helper signals
    signal bindingAndMembership[DEPTH];
    signal extClause[DEPTH];
    signal notTopB[DEPTH];
    signal extOk[DEPTH];
    signal extDependency[DEPTH];
    signal notIsExt[DEPTH];
    signal extTimesOk[DEPTH];              // isExt * extOk
    signal notExtTimesExtOk[DEPTH];        // notIsExt * isExt * extOk
    signal activeExt[DEPTH];               // active * isExt
    signal notActiveExt[DEPTH];            // 1 - activeExt

    // Reserved operator code (11b) detection - now used for EXT
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
    
    // EXT operation components
    component bindingVerifier;              // Merkle proof verifier for binding map
    component icdMembershipVerifier;        // Merkle proof verifier for ICD membership
    component bindingLeafHasher;            // Hash (duo_id, icd_root, version, salt)

    // ───────────── Initialization ─────────────
    sp[0] <== 0;
    depsOK[0] <== 1;  // Initialize dependency tracking as satisfied
    for (var j = 0; j < DEPTH; j++) {
        stackState[0][j] <== 0;
    }
    // Initialize operandPad with requesterPolicy and predicateValues
    for (var j = 0; j < N; j++) {
        requesterPolicy[j] * (requesterPolicy[j] - 1) === 0; // enforce Boolean if needed
        operandPad[j] <== requesterPolicy[j];
    }
    for (var j = 0; j < M; j++) {
        predicateValues[j] * (predicateValues[j] - 1) === 0; // enforce Boolean if needed
        operandPad[N + j] <== predicateValues[j];
    }
    for (var j = N + M; j < NMP2; j++) {
        operandPad[j] <== 0;
    }
    for (var j = 0; j < DEPTH; j++) {
        stackPad[0][j] <== 0;
    }
    for (var j = DEPTH; j < DP2; j++) {
        stackPad[0][j] <== 0;
    }

    // ───────────── EXT Operation Setup ─────────────
    // Instantiate Merkle proof verifiers for EXT operations
    bindingVerifier = MerkleProofVerifier(MERKLE_LEVELS);
    icdMembershipVerifier = MerkleProofVerifier(MERKLE_LEVELS);
    bindingLeafHasher = Poseidon(4);
    
    // Connect binding verifier inputs (computes binding leaf hash)
    bindingLeafHasher.inputs[0] <== duoId;
    bindingLeafHasher.inputs[1] <== icdRoot;
    bindingLeafHasher.inputs[2] <== bindingVersion;
    bindingLeafHasher.inputs[3] <== bindingSalt;
    
    bindingVerifier.leaf <== bindingLeafHasher.out;
    bindingVerifier.root <== bindingRoot;
    for (var j = 0; j < MERKLE_LEVELS; j++) {
        bindingVerifier.pathElements[j] <== bindingPathElements[j];
        bindingVerifier.pathIndices[j] <== bindingPathIndices[j];
    }
    
    // Connect ICD membership verifier inputs
    icdMembershipVerifier.leaf <== icdCode;
    icdMembershipVerifier.root <== icdRoot;
    for (var j = 0; j < MERKLE_LEVELS; j++) {
        icdMembershipVerifier.pathElements[j] <== icdPathElements[j];
        icdMembershipVerifier.pathIndices[j] <== icdPathIndices[j];
    }

    // ───────────── Main loop ─────────────
    for (var i = 0; i < DEPTH; i++) {

        // Component instantiation per step
        attrBits[i] = Num2Bits(KSEL);        // Updated to use KSEL for operand selection
        opBits[i]   = Num2Bits(2);          // up to 4 operators
        spBits[i]   = Num2Bits(KP);
        spM1Bits[i] = Num2Bits(KP);
        spM2Bits[i] = Num2Bits(KP);
        attrMux[i]  = MultiMux(NMP2, KSEL);  // Updated to use NMP2 and KSEL
        topMuxA[i]  = MultiMux(DP2, KP);
        topMuxB[i]  = MultiMux(DP2, KP);
        valMux[i]   = MultiMux(4, 2);

        cmpActive[i]    = LessThan(32);
        cmpIsOperand[i] = LessThan(N + M);    // Updated to compare against N+M
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

        // Operand flag (token < N+M)
        cmpIsOperand[i].in[0] <== postfixExpr[i];
        cmpIsOperand[i].in[1] <== N + M;
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

        // Operand selection (mask with isOperand)
        attrBits[i].in <== isOperand[i] * postfixExpr[i];
        for (var b = 0; b < KSEL; b++) {
            attrMux[i].sel[b] <== attrBits[i].out[b];
        }
        for (var j = 0; j < NMP2; j++) {
            attrMux[i].in[j] <== operandPad[j];
        }
        pushVal[i] <== attrMux[i].out;

        // Operator code (masked) - now subtract (N+M)
        opIdx[i] <== isOper[i] * (postfixExpr[i] - (N + M));
        opBits[i].in <== opIdx[i];

        // Arity detection:
        // code 0 or 1 => AND / OR (binary) (MSB=0)
        // code 2      => NOT (unary)         (binary 10)
        // code 3      => EXT (special)       (binary 11)
        opMSB[i]    <== opBits[i].out[1];
        isBinary[i] <== isOper[i] * (1 - opMSB[i]);   // degree 2
        opLSB[i]    <== opBits[i].out[0];
        notOpLSB[i] <== 1 - opLSB[i];
        tmpUnary1[i] <== isOper[i] * opMSB[i];         // degree 2
        isUnary[i]   <== tmpUnary1[i] * notOpLSB[i];   // degree 2

        // ----- EXT operator detection (code 3, bit pattern 11) -----
        tmpCode3Bits[i] <== opBits[i].out[1] * opBits[i].out[0];   // degree 2
        code3Flag[i]    <== isOper[i] * tmpCode3Bits[i];           // degree 2
        isExt[i] <== code3Flag[i];  // EXT operator when code = 3

        // Binary needs depth >=2 ; Unary needs depth >=1 ; EXT needs depth >=1
        isBinary[i] * (1 - have2[i]) === 0;
        isUnary[i]  * (1 - have1[i]) === 0;
        isExt[i]    * (1 - have1[i]) === 0;

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
        
        // EXT operation logic: ICD_MEMBER_REQ
        // extResult[i] = topB[i] && bindingVerifier.isValid && icdMembershipVerifier.isValid
        // Also compute ok = ¬topB[i] ∨ (bindingVerifier.isValid && icdMembershipVerifier.isValid)
        bindingAndMembership[i] <== bindingVerifier.isValid * icdMembershipVerifier.isValid;
        extClause[i] <== topB[i] * bindingAndMembership[i];  // clause = p && m
        notTopB[i] <== 1 - topB[i];
        extOk[i] <== notTopB[i] + bindingAndMembership[i] - notTopB[i] * bindingAndMembership[i]; // ¬p ∨ m
        extResult[i] <== extClause[i];

        // Select operator result (AND / OR / NOT / EXT)
        valMux[i].in[0] <== andRes[i];
        valMux[i].in[1] <== orRes[i];
        valMux[i].in[2] <== notRes[i];
        valMux[i].in[3] <== extResult[i];
        for (var b = 0; b < 2; b++) {
            valMux[i].sel[b] <== opBits[i].out[b];
        }
        calcVal[i] <== valMux[i].out;
        
        // Update depsOK register
        // depsOK[i+1] = depsOK[i] && (¬(active[i] && isExt[i]) ∨ extOk[i])
        // Only check extOk when this step is active AND is an EXT operation
        activeExt[i] <== active[i] * isExt[i];
        notActiveExt[i] <== 1 - activeExt[i];
        extTimesOk[i] <== activeExt[i] * extOk[i];
        notExtTimesExtOk[i] <== notActiveExt[i] * extTimesOk[i];
        extDependency[i] <== notActiveExt[i] + extTimesOk[i] - notExtTimesExtOk[i];
        depsOK[i + 1] <== depsOK[i] * extDependency[i];

        // Unified write value
        // writeVal = isOperand? pushVal : calcVal
        diffVal[i] <== pushVal[i] - calcVal[i];
        writeVal[i] <== calcVal[i] + isOperand[i] * diffVal[i];

        // Destination index expression
        // destIdx = (operand ? sp) + (unary ? sp-1) + (binary ? sp-2) + (ext ? sp-1)
        tmpDestOpnd[i]  <== isOperand[i] * sp[i];
        tmpDestUnary[i] <== isUnary[i] * (sp[i] - 1);
        tmpDestBinary[i] <== isBinary[i] * (sp[i] - 2);
        tmpDestExt[i]   <== isExt[i] * (sp[i] - 1);  // EXT overwrites top stack element
        destIdx[i] <== tmpDestOpnd[i] + tmpDestUnary[i] + tmpDestBinary[i] + tmpDestExt[i];

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

        // Stack pointer delta: push +1, binary -1, unary 0, ext 0
        spDelta[i] <== isOperand[i] - isBinary[i];
        sp[i + 1] <== sp[i] + active[i] * spDelta[i];

        // Optional: enforce Boolean nature of writeVal (cheap assurance)
        // writeVal[i] * (writeVal[i] - 1) === 0;
    }

    // Final stack depth must be exactly 1
    sp[DEPTH] === 1;

    // Output: Final result combines RPN evaluation with all dependency checks
    // isValid = RPN_result ∧ depsOK
    signal rpnResult;
    rpnResult <== stackState[DEPTH][0];
    isValid <== rpnResult * depsOK[DEPTH];
}

// Example instantiation:
//  N = 3 attributes, M = 2 predicates, DEPTH = 10 tokens, K = ⌈log2(3+2)⌉ = 3, MERKLE_LEVELS = 8
// component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreter(3, 2, 10, 3, 8);

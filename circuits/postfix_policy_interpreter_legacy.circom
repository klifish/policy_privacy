pragma circom 2.0.0;

include "./interpreter/postfix_policy_interpreter.circom";

// Legacy wrapper for backward compatibility
// This allows existing tests to work without modification
template PostfixPolicyInterpreterLegacy(N, DEPTH, K) {
    signal input postfixExpr[DEPTH];
    signal input numOperations;
    signal input requesterPolicy[N];
    signal output isValid;

    // Instantiate extended version with M=0 (no predicates), MERKLE_LEVELS=8
    component interpreter = PostfixPolicyInterpreter(N, 0, DEPTH, K, 8);
    
    // Pass through basic signals
    for (var i = 0; i < DEPTH; i++) {
        interpreter.postfixExpr[i] <== postfixExpr[i];
    }
    interpreter.numOperations <== numOperations;
    for (var i = 0; i < N; i++) {
        interpreter.requesterPolicy[i] <== requesterPolicy[i];
    }
    
    // Set dummy/default values for predicateValues (M=0, so empty)
    // No predicate values needed since M=0
    
    // Set dummy/default values for EXT operator inputs (these won't be used in legacy mode)
    interpreter.bindingRoot <== 0;
    interpreter.duoId <== 0;
    interpreter.icdRoot <== 0;
    interpreter.bindingVersion <== 0;
    interpreter.bindingSalt <== 0;
    for (var i = 0; i < 8; i++) {
        interpreter.bindingPathElements[i] <== 0;
        interpreter.bindingPathIndices[i] <== 0;
        interpreter.icdPathElements[i] <== 0;
        interpreter.icdPathIndices[i] <== 0;
    }
    interpreter.icdCode <== 0;
    
    isValid <== interpreter.isValid;
}

// Legacy instantiation for existing tests
component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreterLegacy(3, 10, 2);
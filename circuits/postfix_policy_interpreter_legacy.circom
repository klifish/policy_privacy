pragma circom 2.0.0;

include "./interpreter/postfix_policy_interpreter.circom";

// Legacy wrapper for backward compatibility
// This allows existing tests to work without modification
template PostfixPolicyInterpreterLegacy(N, DEPTH, K) {
    signal input postfixExpr[DEPTH];
    signal input numOperations;
    signal input requesterPolicy[N];
    signal output isValid;

    // Instantiate extended version with M=0 (no predicates)
    component interpreter = PostfixPolicyInterpreter(N, 0, DEPTH, K);
    
    // Pass through all signals
    for (var i = 0; i < DEPTH; i++) {
        interpreter.postfixExpr[i] <== postfixExpr[i];
    }
    interpreter.numOperations <== numOperations;
    for (var i = 0; i < N; i++) {
        interpreter.requesterPolicy[i] <== requesterPolicy[i];
    }
    
    isValid <== interpreter.isValid;
}

// Legacy instantiation for existing tests
component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreterLegacy(3, 10, 2);
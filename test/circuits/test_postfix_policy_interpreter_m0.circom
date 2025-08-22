pragma circom 2.0.0;

include "./postfix_policy_interpreter.circom";

// Test circuit for M=0 (no predicates) to verify backward compatibility
component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreter(3, 0, 10, 2);
pragma circom 2.0.0;

include "../../circuits/interpreter/postfix_policy_interpreter.circom";

// Test circuit for extended PostfixPolicyInterpreter with predicates
// N = 3 attributes, M = 2 predicates, DEPTH = 10, KSEL = 3
component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreter(3, 2, 10, 3);

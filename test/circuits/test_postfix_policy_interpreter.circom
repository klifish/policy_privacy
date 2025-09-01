pragma circom 2.0.0;

include "../../circuits/interpreter/postfix_policy_interpreter.circom";

/*
    Test for PostfixPolicyInterpreter with concrete parameters
    N=3, M=2, DEPTH=10, K=3
*/

// component main = PostfixPolicyInterpreter(3, 2, 10, 3);
component main { public [postfixExpr, numOperations] } = PostfixPolicyInterpreter(3, 2, 10, 3);

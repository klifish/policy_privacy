pragma circom 2.0.0;

include "../../circuits/interpreter/postfix_policy_interpreter.circom";

/*
    Test for PostfixPolicyInterpreter with concrete parameters
    N=3, M=2, DEPTH=10, K=3
*/

component main {
    public []  
} = PostfixPolicyInterpreter(3, 2, 10, 3);
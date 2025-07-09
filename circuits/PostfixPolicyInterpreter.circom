pragma circom 2.0.0;

// include "circomlib/mux.circom";
include "./MultiMux.circom";

template PostfixPolicyInterpreter(N, DEPTH, K) {
    /*
        N: number of attributes (requesterPolicy size)
        DEPTH: maximum depth of the postfix expression
        K: number of control bits (log₂(N))
    */

    // Public inputs
    signal input postfixExpr[DEPTH]; // Postfix expression encoded as integers
    signal input numOperations;      // Number of operations in postfixExpr

    // Private inputs
    signal input requesterPolicy[N]; // Data requester's attribute values (0 or 1)

    // Output: 1 if policy matches consent, 0 otherwise
    signal output isValid;

    // Stack for evaluating the postfix expression
    signal stack[DEPTH];
    var sp = 0; // Stack pointer

    // Predeclare arrays for components and signals
    component attrMux[DEPTH];
    component opMux[DEPTH];
    signal isOperand[DEPTH];
    signal andResult[DEPTH];
    signal orResult[DEPTH];
    signal notResult[DEPTH];

    // Instantiate MultiMux components outside the loop
    for (var i = 0; i < DEPTH; i++) {
        attrMux[i] = MultiMux(N, K);
        opMux[i] = MultiMux(3, 2);
    }

    // Loop over the postfix expression
    for (var i = 0; i < DEPTH; i++) {
        isOperand[i] <== postfixExpr[i] < N;

        attrMux[i].in <== requesterPolicy;
        attrMux[i].sel <== postfixExpr[i];

        andResult[i] <== stack[sp-2] * stack[sp-1];
        orResult[i] <== stack[sp-2] + stack[sp-1] - (stack[sp-2] * stack[sp-1]);
        notResult[i] <== 1 - stack[sp-1];

        opMux[i].in[0] <== andResult[i];
        opMux[i].in[1] <== orResult[i];
        opMux[i].in[2] <== notResult[i];
        opMux[i].sel <== postfixExpr[i] - N;

        if (i < numOperations) {
            // Operand path: push attribute value onto the stack
            stack[sp] <== attrMux[i].out * isOperand[i] + stack[sp] * (1 - isOperand[i]);
            sp += isOperand[i];

            // Operator path: write result back to stack only if operator
            stack[sp-2] <== opMux[i].out * (1 - isOperand[i]) + stack[sp-2] * isOperand[i];
            sp -= (1 - isOperand[i]);
        }
    }

    // The result is the final value on top of the stack
    isValid <== stack[0];
}

component main {public [postfixExpr,numOperations]}= PostfixPolicyInterpreter(3, 10, 2);
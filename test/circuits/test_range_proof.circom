pragma circom 2.0.0;

include "../../circuits/gadgets/external_predicates.circom";

/*
    Test for RangeProof component with 32-bit values
*/

component main {
    public [minValue, maxValue]  
} = RangeProof(32);
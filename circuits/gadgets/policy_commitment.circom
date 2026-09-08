pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

/*
    Policy Commitment Verifier
    ==========================
    
    Implements the paper's commitment scheme:
        h = Com(P, l; r) = Poseidon(Poseidon(P) || l || r)

    This verifier proves that a hidden policy P of program length l with
    randomness r produces the expected commitment h without revealing P, l or r.

    The policy P is represented as a fixed-length RPN token sequence, of which
    only the first l tokens are meaningful. Binding l into the preimage is what
    prevents a prover from re-interpreting the same committed token array at a
    shorter, stack-consistent prefix (e.g. reading "A AND B" as just "A").
*/

template PolicyCommitmentVerifier(DEPTH) {
    // Private inputs
    signal input policy[DEPTH];                     // Policy as RPN tokens P = [t_1, ..., t_d]
    signal input programLength;                     // Program length l <= DEPTH
    signal input randomizer;                        // Commitment randomness r

    // Public input
    signal input expectedCommitment;                // Expected commitment h

    // Output
    signal output isValid;                          // Boolean: Com(P, l; r) == h?

    // Internal signals
    signal policyHash;
    signal computedCommitment;

    // Components
    component policyHasher;
    component commitmentHasher;
    component commitmentCheck;

    // Hash the policy tokens to create a compact representation
    // circomlib's Poseidon supports max 16 inputs, so for DEPTH > 16 we use tree hashing
    if (DEPTH <= 16) {
        // Direct hashing for DEPTH <= 16
        policyHasher = Poseidon(DEPTH);
        for (var i = 0; i < DEPTH; i++) {
            policyHasher.inputs[i] <== policy[i];
        }
        policyHash <== policyHasher.out;
    } else {
        // Tree-based hashing for DEPTH > 16
        // Split into chunks of 16, hash each chunk, then hash the results
        var numChunks = (DEPTH + 15) \ 16;  // Ceiling division
        component chunkHashers[numChunks];
        signal chunkHashes[numChunks];

        for (var chunk = 0; chunk < numChunks; chunk++) {
            var startIdx = chunk * 16;
            var endIdx = startIdx + 16;
            if (endIdx > DEPTH) endIdx = DEPTH;
            var chunkSize = endIdx - startIdx;

            chunkHashers[chunk] = Poseidon(chunkSize);
            for (var i = 0; i < chunkSize; i++) {
                chunkHashers[chunk].inputs[i] <== policy[startIdx + i];
            }
            chunkHashes[chunk] <== chunkHashers[chunk].out;
        }

        // Hash all chunk hashes together
        component finalHasher = Poseidon(numChunks);
        for (var i = 0; i < numChunks; i++) {
            finalHasher.inputs[i] <== chunkHashes[i];
        }
        policyHash <== finalHasher.out;
    }

    // Then create commitment: h = Poseidon(policyHash || programLength || randomizer)
    // This matches the paper's specification Com(P, l; r) = Poseidon(P || l || r).
    // programLength is part of the preimage so that the committed token array
    // cannot be re-interpreted at a shorter prefix under the same h.
    commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== policyHash;
    commitmentHasher.inputs[1] <== programLength;
    commitmentHasher.inputs[2] <== randomizer;
    computedCommitment <== commitmentHasher.out;

    // Verify the commitment matches expected value
    commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== computedCommitment;
    commitmentCheck.in[1] <== expectedCommitment;
    isValid <== commitmentCheck.out;
}

/*
    Alternative commitment verifier that directly hashes all tokens with randomizer
    This provides a more direct implementation of Com(P;r) = Poseidon(P || r)

    Note: For DEPTH > 15, this uses tree hashing since Poseidon supports max 16 inputs
*/
template PolicyCommitmentVerifierDirect(DEPTH) {
    // Private inputs
    signal input policy[DEPTH];                     // Policy as RPN tokens
    signal input programLength;                     // Program length l <= DEPTH
    signal input randomizer;                        // Commitment randomness

    // Public input
    signal input expectedCommitment;                // Expected commitment

    // Output
    signal output isValid;                          // Boolean: Com(P, l; r) == h?

    // Components
    component commitmentHasher;
    component commitmentCheck;
    signal computedCommitment;

    // Direct commitment with Poseidon limit handling
    if (DEPTH + 2 <= 16) {
        // Direct hashing when DEPTH + 2 <= 16 (i.e., DEPTH <= 14)
        commitmentHasher = Poseidon(DEPTH + 2);

        // Add all policy tokens
        for (var i = 0; i < DEPTH; i++) {
            commitmentHasher.inputs[i] <== policy[i];
        }

        // Add program length and randomizer as final inputs
        commitmentHasher.inputs[DEPTH] <== programLength;
        commitmentHasher.inputs[DEPTH + 1] <== randomizer;
        computedCommitment <== commitmentHasher.out;
    } else {
        // Tree-based hashing for DEPTH > 14
        // First hash the policy, then hash with programLength and randomizer
        var numChunks = (DEPTH + 15) \ 16;
        component chunkHashers[numChunks];
        signal chunkHashes[numChunks];

        for (var chunk = 0; chunk < numChunks; chunk++) {
            var startIdx = chunk * 16;
            var endIdx = startIdx + 16;
            if (endIdx > DEPTH) endIdx = DEPTH;
            var chunkSize = endIdx - startIdx;

            chunkHashers[chunk] = Poseidon(chunkSize);
            for (var i = 0; i < chunkSize; i++) {
                chunkHashers[chunk].inputs[i] <== policy[startIdx + i];
            }
            chunkHashes[chunk] <== chunkHashers[chunk].out;
        }

        // Hash all chunk hashes together
        component policyHasher = Poseidon(numChunks);
        for (var i = 0; i < numChunks; i++) {
            policyHasher.inputs[i] <== chunkHashes[i];
        }

        // Finally hash with programLength and randomizer
        component finalHasher = Poseidon(3);
        finalHasher.inputs[0] <== policyHasher.out;
        finalHasher.inputs[1] <== programLength;
        finalHasher.inputs[2] <== randomizer;
        computedCommitment <== finalHasher.out;
    }

    // Verify commitment
    commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== computedCommitment;
    commitmentCheck.in[1] <== expectedCommitment;
    isValid <== commitmentCheck.out;
}
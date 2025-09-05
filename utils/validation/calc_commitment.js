const circomlibjs = require("circomlibjs");

async function calculateCommitment() {
    const poseidon = await circomlibjs.buildPoseidon();
    
    const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
    const randomizer = 12345n;
    
    const commitment = poseidon(policy.concat([randomizer]));
    console.log("Policy commitment:", commitment.toString());
}

calculateCommitment();
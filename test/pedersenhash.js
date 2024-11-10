const path = require("path");

const circomlibjs = require('circomlibjs');
const wasm_tester = require("circom_tester").wasm;
const assert = require('assert');
const Scalar = require("ffjavascript").Scalar;
const ffjavascript = require("ffjavascript");
const snarkjs = require("snarkjs");
const { c } = require("circom_tester");
const expect = require('chai').expect;
const ethers = require('hardhat').ethers;

function buff2hex(buff) {
    function i2hex(i) {
      return ('0' + i.toString(16)).slice(-2);
    }
    return Array.from(buff).map(i2hex).join('');
}

describe("ZKP test", function () {
    let pedersen;

    before(async () => {
        pedersen = await circomlibjs.buildPedersenHash();
    });

    it("Should check multihash reference 2", async () => {
        const msg = (new TextEncoder()).encode("Hello");
        const res2 = pedersen.hash(msg);
        assert.equal(buff2hex(res2),  "0e90d7d613ab8b5ea7f4f8bc537db6bb0fa2e5e97bbac1c1f609ef9e6a35fd8b");
    });

    describe("CommitmentPlonkVerifier test", function() {
        let plonkVerifier;
        let wasm;
        let zkey;

        it ("Should deploy the verifier", async () => {
            const [owner, otherAccount] = await ethers.getSigners();
            const CommitmentPlonkVerifier = await ethers.getContractFactory("PlonkVerifier");
            plonkVerifier = await CommitmentPlonkVerifier.deploy();

            plonkVerifierAddress = await plonkVerifier.getAddress();
            // console.log('plonkVerifierAddress', plonkVerifierAddress);
            // expect(plonkVerifierAddress).to.not.be.null;
            expect(plonkVerifierAddress).to.be.a.properAddress;
        });

        it("Should verify a proof", async () => {
            wasm = path.join(__dirname,"..", "build", "circuits","commitment_js", "commitment.wasm");
            zkey = path.join(__dirname,"..", "build", "circuits", "commitment_final.zkey");
            const {proof: proofJson, publicSignals: publicInputs} = await snarkjs.plonk.fullProve({secret:42}, wasm, zkey);

            const parseProof = (proofJson) => {
                const proof = [
                    "0x" + BigInt(proofJson.A[0]).toString(16), 
                    "0x" + BigInt(proofJson.A[1]).toString(16), 
                    "0x" + BigInt(proofJson.B[0]).toString(16), 
                    "0x" + BigInt(proofJson.B[1]).toString(16), 
                    "0x" + BigInt(proofJson.C[0]).toString(16), 
                    "0x" + BigInt(proofJson.C[1]).toString(16), 
                    "0x" + BigInt(proofJson.Z[0]).toString(16), 
                    "0x" + BigInt(proofJson.Z[1]).toString(16), 
                    "0x" + BigInt(proofJson.T1[0]).toString(16), 
                    "0x" + BigInt(proofJson.T1[1]).toString(16), 
                    "0x" + BigInt(proofJson.T2[0]).toString(16), 
                    "0x" + BigInt(proofJson.T2[1]).toString(16), 
                    "0x" + BigInt(proofJson.T3[0]).toString(16), 
                    "0x" + BigInt(proofJson.T3[1]).toString(16), 
                    "0x" + BigInt(proofJson.Wxi[0]).toString(16), 
                    "0x" + BigInt(proofJson.Wxi[1]).toString(16), 
                    "0x" + BigInt(proofJson.Wxiw[0]).toString(16), 
                    "0x" + BigInt(proofJson.Wxiw[1]).toString(16), 
                    "0x" + BigInt(proofJson.eval_a).toString(16), 
                    "0x" + BigInt(proofJson.eval_b).toString(16), 
                    "0x" + BigInt(proofJson.eval_c).toString(16), 
                    "0x" + BigInt(proofJson.eval_s1).toString(16), 
                    "0x" + BigInt(proofJson.eval_s2).toString(16), 
                    "0x" + BigInt(proofJson.eval_zw).toString(16), 
               ];

               return proof;
            };

            const proof = parseProof(proofJson);
            
            const res = await plonkVerifier.verifyProof(proof, publicInputs);
            console.log('res', res);
            expect(res).to.be.true;
        });
    });

    describe("Pedersen test", function() {
        let babyJub
        let pedersen;
        let F;
        let circuit;
        this.timeout(100000);
        let wasm;
        before( async() => {

            babyJub = await circomlibjs.buildBabyjub();
            F = babyJub.F; //await getCurveFromName("bn128", true).Fr
            pedersen = await circomlibjs.buildPedersenHash();
            circuit = await wasm_tester(path.join(__dirname,"..", "circuits", "commitment.circom"));
            wasm = path.join(__dirname,"..", "build", "circuits","commitment_js", "commitment.wasm");
            zkey = path.join(__dirname,"..", "build", "circuits", "commitment_final.zkey");
        });
        it("Should generate a valid proof", async () => {
            const {proof, publicSignals} = await snarkjs.plonk.fullProve({secret:42}, wasm, zkey);
            // console.log('puhlicSignals', publicSignals)

        });

        it("Should pedersen at zero", async () => {
    
            let w;
    
            w = await circuit.calculateWitness({ secret: 0}, true);
    
            const b = Buffer.alloc(32);
    
            const h = pedersen.hash(b);
            const hP = babyJub.unpackPoint(h);
            await circuit.assertOut(w, {commitment: F.toObject(hP[0]) });
    
        });
    });
});
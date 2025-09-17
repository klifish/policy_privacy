// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 11510139283922426703566754529700331665081718563665241838153110209750517249388;
    uint256 constant deltax2 = 1339626544276946823464129981481715944433526453182679036695094176408711244788;
    uint256 constant deltay1 = 5462903250015688964363372784015803093163622100777262130735734182810488513147;
    uint256 constant deltay2 = 16413302769332838104013527987310788748519041608753763403442464263811645786150;

    
    uint256 constant IC0x = 9005006101925072901497796943600538162660796438546727052252768316774853006009;
    uint256 constant IC0y = 895218082475883941372001211512463641257065980574604128606332899169245930936;
    
    uint256 constant IC1x = 17947722150452652794022038835401523835889284243992263402210696372929841135259;
    uint256 constant IC1y = 17072877427723659828788195275863196228538241001822192673948865134915680157556;
    
    uint256 constant IC2x = 1846259526137532304937578156001656875764953789825559053552777049372528655517;
    uint256 constant IC2y = 4730639426006395396496753833314493449896680797239184063462564678300628445901;
    
    uint256 constant IC3x = 21238435642250480827618999431317994977762087653726599887898915170232104741672;
    uint256 constant IC3y = 19637371592550660590269364416538303730506468490358850001426630337820727224746;
    
    uint256 constant IC4x = 11347967044160060440718546785435209279290515389380980434136892065383287900740;
    uint256 constant IC4y = 14445614299212457837496427798765581829872681353982706016242304456083782467824;
    
    uint256 constant IC5x = 16938757910153785548264562616304998437870074988712770778931156913100584820461;
    uint256 constant IC5y = 1018422682449571629252403011882296970945144953363893938455827123084752088707;
    
    uint256 constant IC6x = 12105383100816242658538852028424391505205607218775632476885313525960833819593;
    uint256 constant IC6y = 20903986772270882061540514941473453700391268799691668629855001759639163207450;
    
    uint256 constant IC7x = 21340518518482763427261430981401496931275370207804599922226242828961649012105;
    uint256 constant IC7y = 21753560397672564896620473530102090217754135909300806272001731000501382358186;
    
    uint256 constant IC8x = 20228265530974055543281014494199059847648177950062490890997310388555665986332;
    uint256 constant IC8y = 6577747636145270493409886448252458220167100356449347334965177398066574762048;
    
    uint256 constant IC9x = 19029833720914798665746495896460510661249429761526512427037066788967492632189;
    uint256 constant IC9y = 13794934196132181758485030682136764386794436868487777460330246844602016040825;
    
    uint256 constant IC10x = 3689791086852455001689720882436301858389442667716307824315637553079048990716;
    uint256 constant IC10y = 19555191217588163771095087307138317776717489959587588203475884853093621122050;
    
    uint256 constant IC11x = 20562506568120090903170172579145035601498420491098552765008374548613758624007;
    uint256 constant IC11y = 6315888109130145271950855037140791754882085374041681120505585640806298798365;
    
    uint256 constant IC12x = 11690450974024638114098426245850680630803266422423536780668946012518417594979;
    uint256 constant IC12y = 20390472963259421009047658844320580576212136164549263176839643354216328877886;
    
    uint256 constant IC13x = 14875625809493919829027278246730819361689256141971070657350015282054875362123;
    uint256 constant IC13y = 5972602516288867776026270703210756350283078007601411690288132422392224710779;
    
    uint256 constant IC14x = 21009566228882887188859762255378797530237373710841090563134649874410684838509;
    uint256 constant IC14y = 4152616785955590029985820160904180064066361213879806157655732422234979531187;
    
    uint256 constant IC15x = 20440941474548213872916367629496904053617652228072422713134133492074912046194;
    uint256 constant IC15y = 160526254535226429315397141792065824080466956624235888997730472477109438183;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[15] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }

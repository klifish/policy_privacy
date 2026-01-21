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

contract PolicyPrivacyMainVerifier {
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
    uint256 constant deltax1 = 15037957267118427734111545962861616077999315318368965055022684032688030424910;
    uint256 constant deltax2 = 13496495608339549061212756590154575858268363932042111863826564053211156908538;
    uint256 constant deltay1 = 15159021242098499314294600042977087985340580053602327011262456053983582762325;
    uint256 constant deltay2 = 10182455712159517360007555214948665811131105661634354758873071102511329957971;

    
    uint256 constant IC0x = 13384660524174095679068228889517413853443661114653124858800936184015530378356;
    uint256 constant IC0y = 17113721723375129784730404721853213091974665741600323303409727095880440179416;
    
    uint256 constant IC1x = 729300539696276001364551099792006383047916234910571055959915963557511740956;
    uint256 constant IC1y = 8449487624466537676504463748401396598368006199410011341780162412687072907407;
    
    uint256 constant IC2x = 13557548774348140279659668103923645708931518331447902864799087142677678057510;
    uint256 constant IC2y = 14899272569585038030190157493649159008381552303213233058306860250324408625222;
    
    uint256 constant IC3x = 7586871445831227472164517108798254706737698664934477817664072909803318534965;
    uint256 constant IC3y = 11832188469791043470783994597499561107772485551974654538324690417016282024229;
    
    uint256 constant IC4x = 12518539972712513744314474780033196950116011106861422334121715455127541195839;
    uint256 constant IC4y = 2550286528845663550854098118712561920263441898117146624199602396664420196384;
    
    uint256 constant IC5x = 5612023579770084265736518841095827429026621680484747046016110536587161053740;
    uint256 constant IC5y = 13111532889201818204098531333975388702068340711266420017872197209727431808996;
    
    uint256 constant IC6x = 2761392063359368916059931422654806497365304536213270910590243361780373943407;
    uint256 constant IC6y = 9236659337739704642820302485014808478627728691270632350383859115478751059504;
    
    uint256 constant IC7x = 14098471823123251786177445299509856612095654842108430842324993251816149053074;
    uint256 constant IC7y = 15525128463429522962604764958532015065685137712665140068312456584641293059029;
    
    uint256 constant IC8x = 5325878419945639655891084228619427102080598698319664146953802415384200835566;
    uint256 constant IC8y = 12706366000803954044197003130357917207526898434064581407237973610095480297681;
    
    uint256 constant IC9x = 11492068577655272522879700705676728442901699156870253862192997846770192708674;
    uint256 constant IC9y = 12518818903057429738516774983950205081622375576986181769992553427683725871865;
    
    uint256 constant IC10x = 8594275575033908050498437396536919569319027950239073597887913130327644904641;
    uint256 constant IC10y = 15490483192309502382861930198975774324214452484113922399296159252385312848259;
    
    uint256 constant IC11x = 14297180464224208860132027310323046513356080903514117657528685151880321970242;
    uint256 constant IC11y = 20705926887499396705126139110754642850768196578030924217157265785833442978495;
    
    uint256 constant IC12x = 659756722232487299937052942028335894736967284951606546418314196138103740120;
    uint256 constant IC12y = 5543957589260828469229802412454600314791184652221461528618644344726858412349;
    
    uint256 constant IC13x = 13300649281457303410973272591748050352589489677040544306635932587426719830821;
    uint256 constant IC13y = 313476186290650054065124179089332735598438263680718402473551951103188313791;
    
    uint256 constant IC14x = 15592325858070225765863137858133156026528138014296373434294924447738003772036;
    uint256 constant IC14y = 4200566935490100810164498859075600005926773822438444339513304485527810626111;
    
    uint256 constant IC15x = 14393352263696883146405613106745761114380436830569561498589868400955012857252;
    uint256 constant IC15y = 5897803685176025837089243192556140417363796730176157940909064656138217447534;
    
    uint256 constant IC16x = 10346053813285845850342919249498958750491361863070539146195068423510250269820;
    uint256 constant IC16y = 18746671725211729988704609819799350159720876361603722969186373604653836886083;
    
    uint256 constant IC17x = 15234913682931233931189140599561432341129646382268267738955520926341625215951;
    uint256 constant IC17y = 17817528805453062677039275796083915483723270682276578383163440289947725041887;
    
    uint256 constant IC18x = 21078687875078898101121059097454437986548355075112798109517207158028202875991;
    uint256 constant IC18y = 18498202450497927617693950305543661914470804768614725341085655118000883555577;
    
    uint256 constant IC19x = 11466948703382568540527340969218709629533874370779168171766953119441573214372;
    uint256 constant IC19y = 4570736666706268787137945970081724779570385357262186950808534417569981282319;
    
    uint256 constant IC20x = 8133322496912267047114859248834175422280104087728536702525942525190693437435;
    uint256 constant IC20y = 5373548318902268180559034710432550793108507342061284277024781615645759584141;
    
    uint256 constant IC21x = 10847135604904979311501383040264030021707187000885968176603475136038946345591;
    uint256 constant IC21y = 253026409170276708844801481684516440684700063121674571689340144714158121130;
    
    uint256 constant IC22x = 9684634718606118246149406358061046178448681751795679460738468182131080503535;
    uint256 constant IC22y = 14807378980183339100879657006232788555674752736487846140815123892681702743598;
    
    uint256 constant IC23x = 5798384037273874378934749506331272928028656703547672992027437199547298430214;
    uint256 constant IC23y = 8692530468223236976004462661453189554537245102076349037119794961757321203004;
    
    uint256 constant IC24x = 19145801301858535333473260774641925775237255798077389048634757576349122108581;
    uint256 constant IC24y = 20105974450897193057189090165614328654380846082047665217815162703126386129746;
    
    uint256 constant IC25x = 30142350214443932474179667056438133966488902783321043769096106660276201067;
    uint256 constant IC25y = 5141496740419955310585171233544081966453930632831936544514752209644474713226;
    
    uint256 constant IC26x = 16946238679946434934153254762854833007314779504609010194226240848104751140418;
    uint256 constant IC26y = 1042264325554062898564611233445254510563348606259078329681779295487080918840;
    
    uint256 constant IC27x = 8298326338535224479092071911843587641542569092324039744128360119412273900860;
    uint256 constant IC27y = 6734847400450724125259454838585980379817444020420741681533890065684524708019;
    
    uint256 constant IC28x = 16465075027225197164481120360393252836334038186096314053513820431058077624965;
    uint256 constant IC28y = 5700018279063736236026862153852068262691661320714654680437703485981987956348;
    
    uint256 constant IC29x = 11738587052819522793227589388815177176359998837476050877274317133204104308330;
    uint256 constant IC29y = 5962587435336817787300796040546290240256395583125294648196434821170304495908;
    
    uint256 constant IC30x = 16843551913652493224578805825323444194616021381429983609157992011968564767216;
    uint256 constant IC30y = 20508877517324272073878771848407866195829333893903301685745494752080299880742;
    
    uint256 constant IC31x = 14621360080864988957197355391972729189016273641220823224715867533664131150895;
    uint256 constant IC31y = 11717860444803689999141213173139331732142768565973547237160001058830943555591;
    
    uint256 constant IC32x = 18656381473350728241227262508422307562713313712399982331108801684237821469803;
    uint256 constant IC32y = 6052419346562882499152313393209186750536052182990175152098206250570684095581;
    
    uint256 constant IC33x = 12319954091778112096028885141084380040472429587326923067852084529790680648708;
    uint256 constant IC33y = 11630663097896897356519877975803178399350613083645709976697352777901998011541;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[33] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                
                g1_mulAccC(_pVk, IC30x, IC30y, calldataload(add(pubSignals, 928)))
                
                g1_mulAccC(_pVk, IC31x, IC31y, calldataload(add(pubSignals, 960)))
                
                g1_mulAccC(_pVk, IC32x, IC32y, calldataload(add(pubSignals, 992)))
                
                g1_mulAccC(_pVk, IC33x, IC33y, calldataload(add(pubSignals, 1024)))
                

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
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            
            checkField(calldataload(add(_pubSignals, 928)))
            
            checkField(calldataload(add(_pubSignals, 960)))
            
            checkField(calldataload(add(_pubSignals, 992)))
            
            checkField(calldataload(add(_pubSignals, 1024)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }

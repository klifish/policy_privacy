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
    uint256 constant deltax1 = 5266080778334475868890394717519361346424484165113302203102451787084667681311;
    uint256 constant deltax2 = 13142513008707356000990466420677990982841405364013298440161711171914458554863;
    uint256 constant deltay1 = 19042324039666534993972932565915476237516384700554636389139782926959692955042;
    uint256 constant deltay2 = 20294049843510651200197513137446912400600164572522628451850522537682856189927;

    
    uint256 constant IC0x = 16698535555392935570265571647659472828605002845942863939926880287253160318284;
    uint256 constant IC0y = 6702922271354734331143536140797468754787693021515856388353738134353975036984;
    
    uint256 constant IC1x = 12895685927292937940422465004342075743332379164277212384402217173640424511750;
    uint256 constant IC1y = 560818247830425552485630207932765198912444845903108204464696305484656836994;
    
    uint256 constant IC2x = 5370482094505916530128199042913987027211952956984701040152884430498144275942;
    uint256 constant IC2y = 16354436888199085056107572199627610387872030012565609129252034639975026529163;
    
    uint256 constant IC3x = 9621375192613091501893244486707751662044349890044761760706807855577942544379;
    uint256 constant IC3y = 11276986442253270856275212717374217434222723359488541507515481861811751935266;
    
    uint256 constant IC4x = 8429647324507112040839394671519070797856594792197432314047504501956251896787;
    uint256 constant IC4y = 21680176299790797724959394856648070803696410579440124694192092520085760638878;
    
    uint256 constant IC5x = 8943387790890648492300227680546045327918053701658854472851010937192400805494;
    uint256 constant IC5y = 2111165202946141601776415972412583526843537754194828492273882860003192405333;
    
    uint256 constant IC6x = 7077346669402872825108020725714806253906454407041480653634790960215728720791;
    uint256 constant IC6y = 1696123510724058324134591007453242016554823869612022656067434335581018572372;
    
    uint256 constant IC7x = 4522523982165391984578516578122575669653758687607567081150511409146894791396;
    uint256 constant IC7y = 14581720229462110689680204283321181739014112979748579361562208359856970176000;
    
    uint256 constant IC8x = 17470166805387199052451441238023063740753824125589245437671154539363571457969;
    uint256 constant IC8y = 173708663341270639229084834583978056160107051872047790511326977793426279692;
    
    uint256 constant IC9x = 9564794188766579443370307622164871445286711846525816355526978375949459572744;
    uint256 constant IC9y = 410739319843532674474590795614554812962179012906805219384429888486514458431;
    
    uint256 constant IC10x = 13177494454666132703954180660439763113635425088881227162684237706664544322220;
    uint256 constant IC10y = 12313796302625104748068768996756454456535879198460814459116312363173075962659;
    
    uint256 constant IC11x = 14616525998335228778909349648833925188875149915372441576008931702013254691221;
    uint256 constant IC11y = 19912766139858519945847318696633836412485917198729044176401748465644134506677;
    
    uint256 constant IC12x = 11254243606716468251721243173884037501888939842689111717756010332567893175274;
    uint256 constant IC12y = 18298407341842622697231476109465630000436283209321515212564396556522727972628;
    
    uint256 constant IC13x = 5227280333353663661623796801363493822688692463046787954370625472925437826585;
    uint256 constant IC13y = 13882582362257541068081869715285115759393011814634579739915185389638763319488;
    
    uint256 constant IC14x = 600033005506233191991935895634259749819169449585005134709467114965173940579;
    uint256 constant IC14y = 70365772017903138505282432848066259415433657771184693221139988868555104710;
    
    uint256 constant IC15x = 10961982022379988483570456676541186689941466290544544095483215395198093610147;
    uint256 constant IC15y = 13372972509499729956337229433654283409197445742553971306812103592570530485192;
    
    uint256 constant IC16x = 6362022343764933848805929252397202463529979870277871003692057687618720151950;
    uint256 constant IC16y = 14990470999839921018560607659450000070446581786030517489124520279611641165681;
    
    uint256 constant IC17x = 20117500331004372582054609233999420942349446699447885766556798127338951199570;
    uint256 constant IC17y = 6025965030465196638970347117089870338628889498914431468187303856892908095573;
    
    uint256 constant IC18x = 18141399520279773723688564093193156502522953674582983714878509367345696876706;
    uint256 constant IC18y = 20313442237821620332658935942682095028619767877086027340300166089922290324162;
    
    uint256 constant IC19x = 18989882914620414100075131327176982680415257002729146150079757195611969029835;
    uint256 constant IC19y = 21395745978112914582561860741910312287675918639927305208470111078831673777014;
    
    uint256 constant IC20x = 16453900558570154249282619847426281654052001797719559461149202868177152750762;
    uint256 constant IC20y = 21784942501893814698479353052215051653606831071912626385330478875424165389036;
    
    uint256 constant IC21x = 3958984845870010053347961560088633195302164981565161255418648435179231514921;
    uint256 constant IC21y = 887918153378436703912855640777397288207608635471041710594096960589559081240;
    
    uint256 constant IC22x = 9492959593981268043480756999352867359103755453968543577782004995523121933418;
    uint256 constant IC22y = 19508423225432334321622713561675535198471362222023944312908103535833693640903;
    
    uint256 constant IC23x = 1084911933761887208946758038474068227981883869180421362451046407630644900772;
    uint256 constant IC23y = 15801704346282417356860333351070232496896703080907892091947482228801083281413;
    
    uint256 constant IC24x = 18103579083018570444344162744262362297416986442336933006994668892102329359676;
    uint256 constant IC24y = 11764686121321798377431752193910622848502522601099879201359663920237662203121;
    
    uint256 constant IC25x = 1933302909121888144859196316288704188760741926737540249902458641360312765255;
    uint256 constant IC25y = 12578012802479641160968230092002085951173145157804307829662910419199965952344;
    
    uint256 constant IC26x = 9509999704482521723187495885810521598509909902710682280154052269349055004702;
    uint256 constant IC26y = 9311717439093357852250974017892213539114222441833294868882480192213924748155;
    
    uint256 constant IC27x = 17645637723067870751868961469499278888193795451336219199121929813253203452988;
    uint256 constant IC27y = 5947961779522028169290066866791321441617639577394719585963455558451039609806;
    
    uint256 constant IC28x = 64388918303332706593661391017493467549044462135631326306722757608180789364;
    uint256 constant IC28y = 17183706711332115761824515778561594819538316299215328353771199921558687647376;
    
    uint256 constant IC29x = 7622168195406980619585587127094055958585692965048737164268148924942646787367;
    uint256 constant IC29y = 15027181400357475511387932421253766760495593845289499799218418744663783366110;
    
    uint256 constant IC30x = 16660867841934604279749608633484982504788644798138102839602993413681042484475;
    uint256 constant IC30y = 13153948853544336437755526395202545020759658711448377889009163106201666906167;
    
    uint256 constant IC31x = 17602909643320493112501067301070865743906189820416817998092613242189328727511;
    uint256 constant IC31y = 12745920971209942866523384448894989718139429428350063986104730168524911680954;
    
    uint256 constant IC32x = 637333488625568541579067928752245898753793806043806070333695067060510034627;
    uint256 constant IC32y = 21261969840489761428515729811875528204295754513186505912299584443479632537176;
    
    uint256 constant IC33x = 17648341455501021776607308335657638149447716491639665416436982888034498512022;
    uint256 constant IC33y = 10291678840975048612520695206819833949693669632713568328340404570412033383780;
    
 
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

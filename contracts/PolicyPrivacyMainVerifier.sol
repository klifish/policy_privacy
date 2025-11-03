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
    uint256 constant deltax1 = 19565282650721320286452892299621389350732968243522351862541558246646828638223;
    uint256 constant deltax2 = 17207972666956978751752177228373482550262526301189086272897926264022709222366;
    uint256 constant deltay1 = 4520287964745294254652410910593811316396891490080065406063987905056258816031;
    uint256 constant deltay2 = 14896763442357030581863236551583714298054018527205096246417519293659020855070;

    
    uint256 constant IC0x = 9317298347290011047290723977282223491523592320419280592295006440871079960975;
    uint256 constant IC0y = 2956524160579501737186713269119611533844445401001702179510754442672528213207;
    
    uint256 constant IC1x = 9394436560819721178938053823873766209785367579134857316669796834824361479010;
    uint256 constant IC1y = 13233463522904681599012201834115759827210897480611620102916474961985908694510;
    
    uint256 constant IC2x = 11989588136686505020984385322586516358344808844285933079979233657931391036322;
    uint256 constant IC2y = 11689502292321480274611208220636317853164453470111825491786369551941280154474;
    
    uint256 constant IC3x = 15972603650993739631732400243506446495591504283082460364667854317729091228020;
    uint256 constant IC3y = 189735309816765568805125385230375948844036708578390581845313342349529452362;
    
    uint256 constant IC4x = 11915211040207323417175702546692050560554554190402599746275451414909645688504;
    uint256 constant IC4y = 19690957965824064832553894791985217997007067148368771520067322367953406436069;
    
    uint256 constant IC5x = 5293401591801726099151285151586802401535025859534664389389317690314216462284;
    uint256 constant IC5y = 19865035597730075885721032655324230436427762459117373355239581306855508579262;
    
    uint256 constant IC6x = 9364371819540820672357312498488122929363018152775487518056870705015292022161;
    uint256 constant IC6y = 1548398909022074662562323229086421956041550895545995772232776719832140435722;
    
    uint256 constant IC7x = 20126848148602855939054902066109170434009778827551824554553269754564978598703;
    uint256 constant IC7y = 17386130961213912922425279438161635744051009694727233049629188858277713499283;
    
    uint256 constant IC8x = 14481484935148745520373228870436235780834327584102488136548381531861613973375;
    uint256 constant IC8y = 11026383784551157004169285860648769564674955088829934895809884069646130254838;
    
    uint256 constant IC9x = 6712758728323693722879600817104437349080613694333617928368051062308482877110;
    uint256 constant IC9y = 21047674653382031571901237832534554426494762854731963344019106950595307172812;
    
    uint256 constant IC10x = 15016719269206476679939180477189725405783488819120562967306179616266387494038;
    uint256 constant IC10y = 20719011085949532450384880623223636550933680912978086673748661457862202345893;
    
    uint256 constant IC11x = 10349206624541307846629356676577263703977051829855000401968976495150787312536;
    uint256 constant IC11y = 9929867268547143141007108536371673229771454634792266532985220051910162458557;
    
    uint256 constant IC12x = 10415900321983746259174682878217928767186142421715203554602763197203040603766;
    uint256 constant IC12y = 16198311989247495322133661023222563834772675490897069994509906625897010480711;
    
    uint256 constant IC13x = 5984140706483150643125529580497574937701163589587542043848729461640426499879;
    uint256 constant IC13y = 7262805086764786025525900731904754711252759408589548917723623743368788304768;
    
    uint256 constant IC14x = 11959469319927913051701907894660768793608317790494297954975929610448363842368;
    uint256 constant IC14y = 11956578085178688697482703611467977874596536169639545668857408426915412682505;
    
    uint256 constant IC15x = 5821945707798668161838258323445166853681174040955462100908391966583736141310;
    uint256 constant IC15y = 3090905126701633636825763504160930935377209401531801176316901733849717765933;
    
    uint256 constant IC16x = 8511049244034090981036788786555129452858649680119741706034007061360861436643;
    uint256 constant IC16y = 12174094287350583349785688679626010585070560465738528070739500870494671822920;
    
    uint256 constant IC17x = 11792067524391956323677671304548126435693182840469429660504173542639942722542;
    uint256 constant IC17y = 18226068069529505616035748240067362380158107388745717946999769634258498285791;
    
    uint256 constant IC18x = 2772138487386935340173061803769145995437065749096029286103929747607629841709;
    uint256 constant IC18y = 17198946993431090958936414165502501524494919789627648648898737586385638682141;
    
    uint256 constant IC19x = 14716139353814052022813874368066290088417821923463456730881363054085367461695;
    uint256 constant IC19y = 4994777198475225046392895181168173722850031143949024385793079956092447285691;
    
    uint256 constant IC20x = 16550898151960227604211985751955047363380695057145284043046644527761952316520;
    uint256 constant IC20y = 4173223947213662697547889729882067588616800683646944138211162181684348406263;
    
    uint256 constant IC21x = 12199644336894257871582941085720785527068791636180372691226932782270590616287;
    uint256 constant IC21y = 8793268875641045895832740565825689128406445916665850733265929936925063029726;
    
    uint256 constant IC22x = 10546507558517649188380314245424795821907126203801956619907051290437033912785;
    uint256 constant IC22y = 9654440404045030158415839295012631788273360762241849203751677377881558855330;
    
    uint256 constant IC23x = 18339216791911969061647643856546291866583211498463362581517227776821383513387;
    uint256 constant IC23y = 13796046705921831213225339350535532380527457245183671343345478940994120086542;
    
    uint256 constant IC24x = 19679587759301193724491381537310399994276430926365016565808883765536474665841;
    uint256 constant IC24y = 308922735551019426919577702692317121304530219150561349457793202273227330867;
    
    uint256 constant IC25x = 13125796673656879200813102032940741106851069243958628162171458885463818928996;
    uint256 constant IC25y = 624242613797403882611154114900731794455933695574900159718333228803242420581;
    
    uint256 constant IC26x = 10391145409019103866502252105390462660305830303120212217792844863750444186403;
    uint256 constant IC26y = 17921446941756963925452171073759509316151570478623260718225035256161429584064;
    
    uint256 constant IC27x = 2104967953655207269029262599482182237403566579627610389149774923604188367619;
    uint256 constant IC27y = 12666366130551550810587969460127418028484200391108502144141735646125423875865;
    
    uint256 constant IC28x = 10356448297077937227226222726613946243121986063326876359304588441964925922192;
    uint256 constant IC28y = 19708883035348574722570504271003100569013925760195073653731866757901557791858;
    
    uint256 constant IC29x = 13667222530156817150337628645888186333478260807344996715484741031213096184407;
    uint256 constant IC29y = 11840733507737881321869247499825843637292732165615189325161952937588525733543;
    
    uint256 constant IC30x = 21189356535293059245750191826657118701813529349136124792180161754255744225193;
    uint256 constant IC30y = 15861107033521394804307116464494621556149536582559065738450998845929924103532;
    
    uint256 constant IC31x = 11249491986256560061479792556184872321081552510706524487164212401755102038457;
    uint256 constant IC31y = 17284751505719521335840397328161491353541353140018450937117859669461535392879;
    
    uint256 constant IC32x = 15795752327337586499540951089947125243815534957025575012399910559376113870025;
    uint256 constant IC32y = 14198556909492368766472879638054541504511968210528784990721634691271580408651;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[32] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }

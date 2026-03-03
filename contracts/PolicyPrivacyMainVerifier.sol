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
    uint256 constant deltax1 = 20103338690301105931655669450002386573561906000749325277057026112074174067816;
    uint256 constant deltax2 = 4043798851588805137592976190329975425641958769099158364545071238273858903372;
    uint256 constant deltay1 = 3670149343090889307598179385353359625241087359527318543331106993871204192608;
    uint256 constant deltay2 = 15160477060163949416354853751968337200085573126332861853670065620159168121799;

    
    uint256 constant IC0x = 13463203897620366138410556373083028271939243142996441482824819207512139990937;
    uint256 constant IC0y = 2706740109044516511853411882207493641476570902595122603621689150927829628934;
    
    uint256 constant IC1x = 6112577954424932846547095720155578218160779294430341869224844152079465425753;
    uint256 constant IC1y = 12906332018203377893364093463576409131207185243893063685191394865011580374373;
    
    uint256 constant IC2x = 7186518029451609742283680933778115518229132950424405965126125083263214313309;
    uint256 constant IC2y = 18074568886020638066392471763250311645217530096614607518739716893622574301702;
    
    uint256 constant IC3x = 7086330670168216800660579443962883344099744825571193060671921223377149719700;
    uint256 constant IC3y = 4824077645686946250638517141903267275314316483358701988028142108731343596314;
    
    uint256 constant IC4x = 18825491109052274675910967749371042063756084347587514083714678860259758353406;
    uint256 constant IC4y = 13233158963289909437481192071181799908942467351837213293528547721684746662112;
    
    uint256 constant IC5x = 11670419032378645882864332053079358627948339694056742392589389434282156662372;
    uint256 constant IC5y = 19799272684797368389279535887858699684184045126585607143246148416474984740905;
    
    uint256 constant IC6x = 21829818033080008761276182324023631486178548976670483020841430158426647778770;
    uint256 constant IC6y = 1197676403051096668113768049844656950080381521710506409070657459363731237899;
    
    uint256 constant IC7x = 10213945676705546060469548097384822274136205470583325597830134952312675946478;
    uint256 constant IC7y = 4346725387546967020727057595625082611014313208154770350767030234645401033331;
    
    uint256 constant IC8x = 13010598617179388245080519812359969038359810096753625153049461578824351343874;
    uint256 constant IC8y = 6946738939252013624935741377377917770401397062798789186259443177570637203294;
    
    uint256 constant IC9x = 14479228308708689283435126771793199352246448945553390059211964187691542537149;
    uint256 constant IC9y = 19079373958378018211870021259871245128676911738227966824140403583804470539323;
    
    uint256 constant IC10x = 681351398210936742510938536336919844510506489872660223181356388514429461110;
    uint256 constant IC10y = 1047201950452387200539407582212119283992879913552234008796642547979491995399;
    
    uint256 constant IC11x = 4182111852982850387611733351033823167154838343473807476287035616817011157823;
    uint256 constant IC11y = 3205940270137270693252014642924176754673145121861944814737074485986486317924;
    
    uint256 constant IC12x = 8732866746645727312619857596558646692540975701863979775243495450255915510924;
    uint256 constant IC12y = 15813940860355770317834223374122640820117099623490053254686348779314412237123;
    
    uint256 constant IC13x = 2841068399121924219874330174243884992986373768463938914063798558565198830775;
    uint256 constant IC13y = 18908171441303687176863641172568027474092587158767959225364646327804511415024;
    
    uint256 constant IC14x = 7043579763345433571850587860682873770396863789166813274496411935893520736321;
    uint256 constant IC14y = 10309674796420735239779467547132367183191935804282561884063078893846705707391;
    
    uint256 constant IC15x = 21367173136484287983777230550315908840527315372641037550891552673880652755126;
    uint256 constant IC15y = 13356018549648257265229100266090886902952224201749262731623200173062822864898;
    
    uint256 constant IC16x = 13715240118512915558068314911941314379505918599492079541508787235322411161650;
    uint256 constant IC16y = 9157513880179695473000833925956549130033575525825571661720549437480743168690;
    
    uint256 constant IC17x = 13837919059074361441777858610081478596377419595025724971814231812787298321287;
    uint256 constant IC17y = 16309281314572088075663070431294805477521681077959203385356768951278757888635;
    
    uint256 constant IC18x = 9514641205005818364923397197583528400283789824404186486372167326682252790321;
    uint256 constant IC18y = 5156049339591504434999034381183418207236940817849928860226357341825603395308;
    
    uint256 constant IC19x = 8586877213079401997199409788205446814959444976450187251010700113848147408308;
    uint256 constant IC19y = 12703429361057626513229130091117353216108490612543961881517485075166033287211;
    
    uint256 constant IC20x = 3070821911224767811640143347437896828015057337732186623892730529819926565600;
    uint256 constant IC20y = 20925722471048106072309779111843168569610809434153968811777495573491889405831;
    
    uint256 constant IC21x = 6300558889589284483442159542833870838010316642040788173203014538894065636888;
    uint256 constant IC21y = 3862303674778424658335146028895342820255554548773395518183442124609834826311;
    
    uint256 constant IC22x = 13922504486450329439971974741810054168243472544320823849940836336687959370770;
    uint256 constant IC22y = 14644254515111273136222563452944687374072158441829803513718287090854299336527;
    
    uint256 constant IC23x = 20119067140440673016416011981478579647774936162384707115676340388044366884605;
    uint256 constant IC23y = 18990126502442653662391839306017458292221382530181235314685428272278153676758;
    
    uint256 constant IC24x = 20504681152411994264375769557477750515856958593058683254924355301621019206669;
    uint256 constant IC24y = 12488381840528803209164080137591922435754385625740352636025339473601395595487;
    
    uint256 constant IC25x = 19400444046474575603741594957073998217961095872997725895153263743880867696518;
    uint256 constant IC25y = 13081875003467614091489989235591234561958077214926170982436009348062651111621;
    
    uint256 constant IC26x = 8951560461073308042847691075321191486045402346111581149177504179931219153153;
    uint256 constant IC26y = 3983516035980525637089920250151132497658269540784640552289048096953695675310;
    
    uint256 constant IC27x = 1049754741093049762548774680848105959601137364428553535850363360353704354401;
    uint256 constant IC27y = 4367789784088306545917577842831359458869746026800202299398366615104558452462;
    
    uint256 constant IC28x = 16488672240363584203247580776174566202890738407251122721948348512332950985208;
    uint256 constant IC28y = 10600018858491500746664263509256527825995685926570825034751040107943833177213;
    
    uint256 constant IC29x = 13987718082520399056233661316348670328711143962138179348668257750142540567254;
    uint256 constant IC29y = 19885253550821809617110730471349087107233714876073192544285539958642847567619;
    
    uint256 constant IC30x = 5380321114888066017223007988618527835605126719138830261258100275643120946023;
    uint256 constant IC30y = 12729023665107197013434274701374296877036282393618164162804097128312823004186;
    
    uint256 constant IC31x = 7652801598861148022598152093356879097160821878161826023379457708260437402458;
    uint256 constant IC31y = 20319095327840546877411664114801678709895430308045434913876424872799754420821;
    
    uint256 constant IC32x = 1647012137576329445361037477429492159975447862514268256061662617815178966507;
    uint256 constant IC32y = 13315966722173283660036882629116389039736518925585503063889104439341315622427;
    
    uint256 constant IC33x = 7290265099659477848739747422367134013259803113900844394254636653923229142621;
    uint256 constant IC33y = 578580036089910172409216113420149980678296797217339439873149198659120064435;
    
    uint256 constant IC34x = 4800237746437928658247114978420734354724488442925150793833143417423410097282;
    uint256 constant IC34y = 11911957816535791272583402051700193641686948504487938779964090733375956677959;
    
    uint256 constant IC35x = 17511998615666457218115268304270911345756262653385952967700954361111317654032;
    uint256 constant IC35y = 18662574128125898437061143271959326771457828969833610288217905451278667393651;
    
    uint256 constant IC36x = 18410601173942186523549307810899485185612208149976220238757913556583085440663;
    uint256 constant IC36y = 12953171552822272782009315069821799293402253645152490830720620009145484937465;
    
    uint256 constant IC37x = 10565453465015284769565835035915772208007622425112006757423127169941650998674;
    uint256 constant IC37y = 1158726070446032573854422600338086315323691325769541546605174250548340281132;
    
    uint256 constant IC38x = 16501156282257429054073799938852604696907372208992078430415844930456333001147;
    uint256 constant IC38y = 3323811432993733219529353366666814852331180794975483611363824433720104327850;
    
    uint256 constant IC39x = 6613388740498950848277353451634318992442035955077935546819880241218978741981;
    uint256 constant IC39y = 3194002043322701902016277383139597155185127985920393812765844103570736842894;
    
    uint256 constant IC40x = 13333196995549469251985925210155078799142108190096791865558121946518227130645;
    uint256 constant IC40y = 21174976170686750909888751054273409123907060930195234336593692695117675743021;
    
    uint256 constant IC41x = 11863945264825400590396671697214253387720830195350629454093240022253822367864;
    uint256 constant IC41y = 1546264079464545586866740629520386619039220105013896270731447796319495203750;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[41] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC34x, IC34y, calldataload(add(pubSignals, 1056)))
                
                g1_mulAccC(_pVk, IC35x, IC35y, calldataload(add(pubSignals, 1088)))
                
                g1_mulAccC(_pVk, IC36x, IC36y, calldataload(add(pubSignals, 1120)))
                
                g1_mulAccC(_pVk, IC37x, IC37y, calldataload(add(pubSignals, 1152)))
                
                g1_mulAccC(_pVk, IC38x, IC38y, calldataload(add(pubSignals, 1184)))
                
                g1_mulAccC(_pVk, IC39x, IC39y, calldataload(add(pubSignals, 1216)))
                
                g1_mulAccC(_pVk, IC40x, IC40y, calldataload(add(pubSignals, 1248)))
                
                g1_mulAccC(_pVk, IC41x, IC41y, calldataload(add(pubSignals, 1280)))
                

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
            
            checkField(calldataload(add(_pubSignals, 1056)))
            
            checkField(calldataload(add(_pubSignals, 1088)))
            
            checkField(calldataload(add(_pubSignals, 1120)))
            
            checkField(calldataload(add(_pubSignals, 1152)))
            
            checkField(calldataload(add(_pubSignals, 1184)))
            
            checkField(calldataload(add(_pubSignals, 1216)))
            
            checkField(calldataload(add(_pubSignals, 1248)))
            
            checkField(calldataload(add(_pubSignals, 1280)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }

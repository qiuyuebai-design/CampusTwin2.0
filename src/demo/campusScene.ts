import * as THREE from 'three';
import {scenePositions} from './experienceModel';
const colors={brick:0xa86b4e,brickLight:0xc68b67,stone:0xe7dfc7,trim:0xd8cbb2,glass:0x567a73,grass:0xc8d2af,water:0x8bb8ac,tree:0x739269};
export function createCampus(){
 const campus=new THREE.Group();const groups:Record<string,THREE.Group>={};const status:Record<string,THREE.Mesh>={};
 const materials=new Map<number,THREE.MeshStandardMaterial>();const mat=(color:number)=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.78,metalness:color===colors.glass?.2:0}));return materials.get(color)!};
 const box=(g:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m};
 const cylinder=(g:THREE.Group,x:number,y:number,z:number,r:number,h:number,c:number,n=32)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),mat(c));m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m};
 box(campus,0,-2,0,164,2,128,0xd0d8bc);box(campus,0,-.1,0,160,.3,124,0xe3e7d5);
 for(const x of [-72,72])box(campus,x,.1,0,3,.12,113,0xf8f5e9);
 for(const z of [-54,53])box(campus,0,.1,z,145,.12,3,0xf8f5e9);
 box(campus,0,.1,0,8,.15,112,0xf8f5e9);box(campus,0,.12,-10,147,.15,6,0xf8f5e9);box(campus,0,.1,27,145,.15,4,0xf8f5e9);
 // Landscape is an illustrative composition, not a coordinate or scale map.
 const lake=cylinder(campus,-21,.1,0,20,.18,colors.water,64);lake.scale.set(1.65,1,.73);
 const island=cylinder(campus,-19,.3,0,4,.3,colors.grass,24);island.scale.set(1.7,1,.7);
 box(campus,-2,.6,1,3,.6,29,colors.trim);for(const x of [-3.5,-.5])box(campus,x,1.2,1,.18,.8,29,0x947457);
 for(let i=0;i<7;i++){box(campus,-3.5,1.1,-11+i*4,.2,1.2,.2,0x947457);box(campus,-.5,1.1,-11+i*4,.2,1.2,.2,0x947457)}
 const makeGroup=(id:string)=>{const g=new THREE.Group();g.position.set(...scenePositions[id]);g.userData.venueId=id;campus.add(g);groups[id]=g;return g};
 const windows=(g:THREE.Group,x:number,z:number,w:number,floors:number,height:number)=>{for(let f=0;f<floors;f++){box(g,x,2+f*height,z,w,1.25,.16,colors.glass);for(let k=-w/2;k<=w/2;k+=2.4)box(g,x+k,1.7+f*height,z+.1,.18,1.7,.2,colors.trim)}};
 const library=makeGroup('v1');box(library,0,0,0,39,1,24,colors.trim);box(library,-6,1,0,25,11,16,colors.brickLight);box(library,10,1,1,9,16,13,colors.stone);box(library,-6,12,0,26,.7,17,colors.trim);box(library,10,17,1,10,.7,14,colors.trim);windows(library,-6,8.1,23,3,3);windows(library,10,7.6,7,4,3);
 const arts=makeGroup('v3');box(arts,0,0,0,36,.8,25,colors.trim);box(arts,-7,.8,-3,18,9,16,colors.brickLight);box(arts,11,.8,1,14,6,13,colors.brick);box(arts,-7,9.8,-3,19,.6,17,colors.trim);box(arts,11,6.8,1,15,.6,14,colors.trim);windows(arts,-7,5.1,16,2,3);for(let i=0;i<5;i++)box(arts,0,.15+i*.16,17-i*.9,18,.16,1,colors.stone);
 const gate=makeGroup('v5');cylinder(gate,0,.1,0,12,.3,colors.water,40);box(gate,0,.4,0,7,13,7,colors.stone);box(gate,0,13.4,0,10,1,10,colors.trim);cylinder(gate,0,14.4,0,2,3,colors.brickLight,8);
 const classroom=makeGroup('v2');box(classroom,0,0,0,20,8,12,0xb1b9a4);box(classroom,0,8,0,21,.5,13,0xe8e5d6);windows(classroom,0,6.1,17,2,3);
 const sports=makeGroup('v4');const field=cylinder(sports,0,.1,0,13,.5,0xb89473,48);field.scale.set(1.1,1,.7);const inner=cylinder(sports,0,.6,0,10,.12,0x94ac77,48);inner.scale.set(1.1,1,.7);box(sports,0,.73,0,.2,.03,12,0xe5e8d5);box(sports,0,.73,0,15,.03,.2,0xe5e8d5);
 const seminar=makeGroup('v6');box(seminar,0,0,0,17,5,10,0xb8bda8);box(seminar,0,5,0,18,.5,11,0xe9e7db);windows(seminar,0,5.1,14,1,3);
 for(const id of Object.keys(groups)){const g=groups[id];g.traverse(o=>{o.userData.venueId=id});const ring=new THREE.Mesh(new THREE.RingGeometry(id==='v1'?26:id==='v3'?25:17,id==='v1'?26.6:id==='v3'?25.6:17.6,80),new THREE.MeshBasicMaterial({color:0x679582,side:THREE.DoubleSide,transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;ring.position.set(g.position.x,.5,g.position.z);campus.add(ring);status[id]=ring}
 const trunkGeo=new THREE.CylinderGeometry(.28,.4,2.2,5);const leafGeo=new THREE.IcosahedronGeometry(2.1,0);const trunks:THREE.Object3D[]=[];
 for(let i=0;i<66;i++){let x:number,z:number;if(i<25){x=-68+i*5.5;z=58}else if(i<49){x=-68+(i-25)*5.6;z=-58}else{x=-75+(i%2)*150;z=-46+(i-49)*5.4}const tree=new THREE.Group();tree.position.set(x,.2,z);const trunk=new THREE.Mesh(trunkGeo,mat(0x9d8c65));trunk.position.y=1.1;const leaves=new THREE.Mesh(leafGeo,mat(i%3===0?0x9bad75:colors.tree));leaves.position.y=3.2;leaves.scale.y=1.25+(i%3)*.17;leaves.castShadow=true;tree.add(trunk,leaves);campus.add(tree);trunks.push(tree)}
 for(let i=0;i<10;i++){const tree=trunks[i].clone();tree.position.set(-48+i*5,.1,19);campus.add(tree)}
 return {campus,groups,status};
}
